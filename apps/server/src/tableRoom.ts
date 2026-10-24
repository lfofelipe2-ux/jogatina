import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import {
  CHAT_HISTORY_MAX,
  CHAT_TEXT_MAX,
  TAUNTS,
  applyAction,
  canStartHand,
  createTable,
  ensurePlayer,
  legalActions,
  recordHand,
  recordTopUp,
  setSittingOut,
  shuffledDeck,
  sitDown,
  standUp as engineStandUp,
  isSticker,
  startHand,
  timeoutAction,
  viewFor,
  type ActionType,
  type ChatBody,
  type ChatMessage,
  type ClientTableState,
  type ClientToServerEvents,
  type GameEvent,
  type GifMedia,
  type JoinTableRequest,
  type JoinTableResponse,
  type PlayerAction,
  type Scoreboard,
  type ServerToClientEvents,
  type TableConfig,
  type TableState,
} from '@poker/engine';
import { handDeltas, sitDebit, type Ledger } from './ledger';

export interface SocketData {
  room?: TableRoom;
  playerId?: string;
  hits: number[];
}

export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export class UserError extends Error {}

const RECONNECT_GRACE_MS = 60_000;
const EMPTY_TABLE_TTL_MS = 30 * 60_000;
const START_DELAY_MS = 1500;
const NEXT_HAND_DELAY_MS = 4000;
const ACTIONS: ActionType[] = ['fold', 'check', 'call', 'bet', 'raise'];
const CHAT_WINDOW_MS = 5000;
const CHAT_MAX_PER_WINDOW = 5;

export function newToken(): string {
  return randomBytes(16).toString('base64url');
}

export function int(v: unknown, min: number, max: number, message = 'Configuração inválida'): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new UserError(message);
  return v;
}

/** Key for remembered off-table stacks: a kicked player who rejoins under the same name gets a new playerId. */
function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function chatBody(raw: unknown, gif: (raw: unknown) => (GifMedia & { id: string }) | undefined): ChatBody {
  const r = (raw ?? {}) as Record<string, unknown>;
  switch (r.kind) {
    case 'text': {
      const text = typeof r.text === 'string' ? r.text.trim() : '';
      if (!text) throw new UserError('Mensagem vazia');
      if (text.length > CHAT_TEXT_MAX) throw new UserError(`Mensagem com mais de ${CHAT_TEXT_MAX} caracteres`);
      return { kind: 'text', text };
    }
    case 'taunt': {
      const text = typeof r.id === 'number' ? TAUNTS[r.id] : undefined;
      if (!text) throw new UserError('Provocação inválida');
      return { kind: 'taunt', text };
    }
    case 'sticker':
      if (!isSticker(r.id)) throw new UserError('Figurinha inválida');
      return { kind: 'sticker', id: r.id };
    case 'gif': {
      const m = gif(r);
      if (!m) throw new UserError('GIF inválido, busque de novo');
      return { kind: 'gif', ...m };
    }
    default:
      throw new UserError('Mensagem inválida');
  }
}

/** Buy-in for a name whose scoreboard row already exists: the chips it had left with it, so the row restarts from zero. */
function buyIn(sb: Scoreboard, name: string, amount: number): Scoreboard {
  const row = sb[name]!;
  return recordTopUp({ ...sb, [name]: { ...row, stack: 0, net: -row.invested } }, name, amount);
}

interface PlayerRecord {
  playerId: string;
  name: string;
  reconnectToken: string;
  isHost: boolean;
  connected: boolean;
  graceTimer: NodeJS.Timeout | null;
}

export interface RoomInit {
  id: string;
  hostToken: string;
  config: TableConfig;
  startingStack: number;
  actionTimeoutSec: number;
  ledger?: Ledger;
}

export class TableRoom {
  id: string;
  readonly hostToken: string;
  readonly startingStack: number;
  readonly actionTimeoutSec: number;
  private readonly ledger?: Ledger;

  private state: TableState;
  private started = false;
  private scoreboard: Scoreboard = {};
  private readonly players = new Map<string, PlayerRecord>();
  /** Chips a player stood up with, keyed by nameKey(name). Cleared on kick. */
  private readonly stacks = new Map<string, number>();
  private readonly pendingStandUp = new Set<string>();
  private readonly pendingSitOut = new Set<string>();
  private readonly sockets = new Set<AppSocket>();
  private readonly chatLog: ChatMessage[] = [];
  private readonly chatHits = new Map<string, number[]>();
  private chatSeq = 0;
  private actionDeadline: number | null = null;
  private actionKey: string | null = null;
  private actionCount = 0;
  private lastHandEnded = false;
  private touchQueued = false;
  private disposed = false;
  private startTimer: NodeJS.Timeout | null = null;
  private actionTimer: NodeJS.Timeout | null = null;
  private deleteTimer: NodeJS.Timeout | null = null;
  private readonly onDelete: (room: TableRoom) => void;

  constructor(init: RoomInit, onDelete: (room: TableRoom) => void) {
    this.id = init.id;
    this.hostToken = init.hostToken;
    this.startingStack = init.startingStack;
    this.actionTimeoutSec = init.actionTimeoutSec;
    this.ledger = init.ledger;
    this.onDelete = onDelete;
    this.state = createTable(init.config);
    this.refreshDeleteTimer();
  }

  has(playerId: string): boolean {
    return this.players.has(playerId);
  }

  connectedCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  assertHost(playerId: string): void {
    if (!this.players.get(playerId)?.isHost) throw new UserError('Só o anfitrião pode fazer isso');
  }

  join(socket: AppSocket, req: JoinTableRequest): JoinTableResponse {
    // Re-joining from the same socket is idempotent: keep the same player record.
    const own = socket.data.room === this && socket.data.playerId ? this.players.get(socket.data.playerId) : undefined;
    let p = own ?? (typeof req.reconnectToken === 'string'
      ? [...this.players.values()].find((x) => x.reconnectToken === req.reconnectToken)
      : undefined);
    if (!p) {
      const name = typeof req.name === 'string' ? req.name.trim() : '';
      if (name.length < 2 || name.length > 16) throw new UserError('Nome deve ter de 2 a 16 caracteres');
      const lower = name.toLocaleLowerCase();
      for (const x of this.players.values()) {
        if (x.name.toLocaleLowerCase() === lower) throw new UserError('Nome já em uso');
      }
      p = { playerId: randomUUID(), name, reconnectToken: newToken(), isHost: false, connected: false, graceTimer: null };
      this.players.set(p.playerId, p);
    }
    if (typeof req.hostToken === 'string' && req.hostToken === this.hostToken) p.isHost = true;
    this.attach(socket, p);
    socket.emit('chat:history', this.chatLog);
    this.commit();
    return { ok: true, playerId: p.playerId, reconnectToken: p.reconnectToken, isHost: p.isHost };
  }

  detach(socket: AppSocket): void {
    this.sockets.delete(socket);
    socket.data.room = undefined;
    const pid = socket.data.playerId;
    const p = pid ? this.players.get(pid) : undefined;
    if (p && p.connected && ![...this.sockets].some((s) => s.data.playerId === p.playerId)) {
      p.connected = false;
      if (p.graceTimer) clearTimeout(p.graceTimer);
      p.graceTimer = setTimeout(() => this.run(() => this.expireGrace(p.playerId)), RECONNECT_GRACE_MS);
    }
    this.refreshDeleteTimer();
    this.commit();
  }

  sit(playerId: string, seatReq: unknown): void {
    const seat = int(seatReq, 0, this.state.config.maxSeats - 1, 'Lugar inválido');
    const p = this.mustPlayer(playerId);
    const current = this.seatOf(playerId);
    if (current === seat) {
      this.pendingStandUp.delete(playerId);
      this.pendingSitOut.delete(playerId);
      if (!this.inLiveHand(seat)) this.state = setSittingOut(this.state, seat, false);
      this.commit();
      return;
    }
    if (current !== null) throw new UserError('Você já está sentado');
    if (this.state.seats[seat]) throw new UserError('Lugar ocupado');
    const key = nameKey(p.name);
    const remembered = this.stacks.get(key) ?? 0;
    const returning = remembered > 0;
    const stack = returning ? remembered : this.startingStack;
    const next = sitDown(this.state, seat, { playerId, name: p.name, stack });
    // Debit before the seat is taken, so a failed write leaves the player standing.
    if (!returning) this.ledger?.append([sitDebit(p.name, this.startingStack)]);
    this.state = next;
    // Returning with chips adds no money; anything else is a fresh buy-in that must be counted in invested.
    if (!returning) {
      this.scoreboard = Object.hasOwn(this.scoreboard, p.name)
        ? buyIn(this.scoreboard, p.name, this.startingStack)
        : ensurePlayer(this.scoreboard, p.name, this.startingStack);
    }
    this.stacks.delete(key);
    this.commit();
  }

  standUp(playerId: string): void {
    this.mustPlayer(playerId);
    if (this.seatOf(playerId) === null) throw new UserError('Você não está sentado');
    this.releaseSeat(playerId);
    this.commit();
  }

  action(playerId: string, req: { type?: unknown; amount?: unknown }): void {
    const seat = this.seatOf(playerId);
    if (seat === null) throw new UserError('Você não está sentado');
    if (!ACTIONS.includes(req.type as ActionType)) throw new UserError('Ação inválida');
    const out: GameEvent[] = [];
    this.apply(
      { seat, type: req.type as ActionType, amount: typeof req.amount === 'number' ? req.amount : undefined },
      out,
    );
    this.commit(out);
  }

  start(playerId: string): void {
    this.assertHost(playerId);
    if (this.state.seats.filter((s) => s !== null).length < 2) {
      throw new UserError('Precisa de pelo menos 2 jogadores sentados');
    }
    this.started = true;
    this.commit();
  }

  kick(playerId: string, targetId: unknown): void {
    this.assertHost(playerId);
    const target = typeof targetId === 'string' ? this.players.get(targetId) : undefined;
    if (!target) throw new UserError('Jogador não encontrado');
    if (target.playerId === playerId) throw new UserError('Você não pode se expulsar');
    // Remove the player first so releaseSeat does not remember the kicked stack (also when the hand settles later).
    this.players.delete(target.playerId);
    this.chatHits.delete(target.playerId);
    this.stacks.delete(nameKey(target.name));
    this.pendingSitOut.delete(target.playerId);
    this.releaseSeat(target.playerId);
    if (target.graceTimer) clearTimeout(target.graceTimer);
    for (const s of [...this.sockets]) {
      if (s.data.playerId !== target.playerId) continue;
      this.sockets.delete(s);
      s.data.room = undefined;
      s.emit('kicked');
      setTimeout(() => s.disconnect(true), 200);
    }
    this.commit();
  }

  chat(playerId: string, raw: unknown, gif: (raw: unknown) => (GifMedia & { id: string }) | undefined): void {
    const p = this.mustPlayer(playerId);
    const body = chatBody(raw, gif);
    const now = Date.now();
    const hits = (this.chatHits.get(playerId) ?? []).filter((t) => now - t < CHAT_WINDOW_MS);
    if (hits.length >= CHAT_MAX_PER_WINDOW) throw new UserError('Calma, muitas mensagens seguidas');
    hits.push(now);
    this.chatHits.set(playerId, hits);
    const msg: ChatMessage = { id: ++this.chatSeq, playerId, name: p.name, at: now, body };
    this.chatLog.push(msg);
    if (this.chatLog.length > CHAT_HISTORY_MAX) this.chatLog.shift();
    for (const s of this.sockets) s.emit('chat', msg);
  }

  announceLink(): void {
    for (const s of this.sockets) s.emit('linkRotated', { tableId: this.id });
    this.touch();
  }

  dispose(): void {
    this.disposed = true;
    for (const t of [this.startTimer, this.actionTimer, this.deleteTimer]) if (t) clearTimeout(t);
    this.startTimer = null;
    this.actionTimer = null;
    this.deleteTimer = null;
    for (const p of this.players.values()) {
      if (p.graceTimer) clearTimeout(p.graceTimer);
      p.graceTimer = null;
    }
  }

  private mustPlayer(playerId: string): PlayerRecord {
    const p = this.players.get(playerId);
    if (!p) throw new UserError('Você não está nesta mesa');
    return p;
  }

  private attach(socket: AppSocket, p: PlayerRecord): void {
    socket.data.room = this;
    socket.data.playerId = p.playerId;
    this.sockets.add(socket);
    p.connected = true;
    if (p.graceTimer) {
      clearTimeout(p.graceTimer);
      p.graceTimer = null;
    }
    this.refreshDeleteTimer();
  }

  private refreshDeleteTimer(): void {
    if (this.sockets.size > 0) {
      if (this.deleteTimer) clearTimeout(this.deleteTimer);
      this.deleteTimer = null;
      return;
    }
    if (!this.deleteTimer) {
      this.deleteTimer = setTimeout(() => this.run(() => this.onDelete(this)), EMPTY_TABLE_TTL_MS);
    }
  }

  private expireGrace(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.connected) return;
    p.graceTimer = null;
    const seat = this.seatOf(playerId);
    if (seat !== null) this.requestSitOut(playerId, seat);
    this.commit();
  }

  private seatOf(playerId: string): number | null {
    const i = this.state.seats.findIndex((s) => s?.playerId === playerId);
    return i < 0 ? null : i;
  }

  /** True when the seat still has chips in the unfinished hand (it must fold before leaving or sitting out). */
  private inLiveHand(seat: number): boolean {
    const hand = this.state.hand;
    const p = hand && !hand.finished ? hand.players[seat] : undefined;
    return !!p && !p.folded;
  }

  /** Sits the seat out now, or once the current hand settles if it is still in play. */
  private requestSitOut(playerId: string, seat: number): void {
    if (this.inLiveHand(seat)) {
      this.pendingSitOut.add(playerId);
      return;
    }
    this.pendingSitOut.delete(playerId);
    this.state = setSittingOut(this.state, seat, true);
  }

  /** Stands the player up now, or after the current hand if they are still in it. */
  private releaseSeat(playerId: string): void {
    const seat = this.seatOf(playerId);
    if (seat === null) return;
    if (this.inLiveHand(seat)) {
      this.pendingStandUp.add(playerId);
      return;
    }
    const s = this.state.seats[seat];
    if (!s) return;
    if (this.players.has(playerId)) this.stacks.set(nameKey(s.name), s.stack);
    this.pendingStandUp.delete(playerId);
    this.state = engineStandUp(this.state, seat);
  }

  private apply(action: PlayerAction, out: GameEvent[]): void {
    const r = applyAction(this.state, action);
    this.state = r.state;
    this.actionCount++;
    out.push(...r.events);
  }

  private autoFold(out: GameEvent[]): void {
    for (;;) {
      const hand = this.state.hand;
      if (!hand || hand.finished || hand.toAct === null) return;
      const pid = this.state.seats[hand.toAct]?.playerId;
      if (!pid || !this.pendingStandUp.has(pid)) return;
      this.apply({ seat: hand.toAct, type: 'fold' }, out);
    }
  }

  /** Runs after every change: auto-folds, end-of-hand bookkeeping. */
  private settle(events: GameEvent[]): void {
    const out = [...events];
    this.autoFold(out);
    const end = out.find((e): e is Extract<GameEvent, { type: 'handEnded' }> => e.type === 'handEnded');
    if (!end) return;
    this.scoreboard = recordHand(this.scoreboard, this.state, end.result);
    try {
      this.ledger?.append(handDeltas(this.state, end.result));
    } catch (e) {
      console.error('[ledger]', e);
    }
    this.lastHandEnded = true;
    for (const pid of [...this.pendingSitOut]) {
      this.pendingSitOut.delete(pid);
      const seat = this.seatOf(pid);
      if (seat !== null) this.state = setSittingOut(this.state, seat, true);
    }
    for (const pid of [...this.pendingStandUp]) {
      this.pendingStandUp.delete(pid);
      this.releaseSeat(pid);
    }
    const busted = this.state.seats.flatMap((s, i) => (s && s.stack === 0 && !s.sittingOut ? [i] : []));
    for (const i of busted) this.state = setSittingOut(this.state, i, true);
  }

  private commit(events: GameEvent[] = []): void {
    this.settle(events);
    this.syncActionTimer();
    this.scheduleStart();
    this.touch();
  }

  /** Broadcasts once, after the current synchronous handler (so an ack goes out first). */
  private touch(): void {
    if (this.touchQueued) return;
    this.touchQueued = true;
    queueMicrotask(() => {
      this.touchQueued = false;
      this.run(() => this.broadcast());
    });
  }

  private broadcast(): void {
    for (const s of this.sockets) s.emit('state', this.stateFor(s.data.playerId ?? null));
  }

  private stateFor(playerId: string | null): ClientTableState {
    const p = playerId ? this.players.get(playerId) : undefined;
    const seat = playerId ? this.seatOf(playerId) : null;
    const hand = this.state.hand;
    const legal = seat !== null && hand && !hand.finished && hand.toAct === seat ? legalActions(this.state, seat) : null;
    return {
      tableId: this.id,
      config: { ...this.state.config, startingStack: this.startingStack, actionTimeoutSec: this.actionTimeoutSec },
      table: viewFor(this.state, playerId),
      serverNow: Date.now(),
      you: { playerId: playerId ?? '', name: p?.name ?? '', seat, isHost: p?.isHost ?? false },
      legal,
      actionDeadline: this.actionDeadline,
      started: this.started,
      scoreboard: this.scoreboard,
      online: [...this.players.values()].map((x) => ({
        playerId: x.playerId,
        name: x.name,
        seat: this.seatOf(x.playerId),
        connected: x.connected,
      })),
    };
  }

  private syncActionTimer(): void {
    const hand = this.state.hand;
    const key = hand && !hand.finished && hand.toAct !== null
      ? `${hand.handNumber}:${hand.toAct}:${this.actionCount}`
      : null;
    if (key === this.actionKey) return;
    this.actionKey = key;
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
    if (key === null) {
      this.actionDeadline = null;
      return;
    }
    const ms = this.actionTimeoutSec * 1000;
    this.actionDeadline = Date.now() + ms;
    this.actionTimer = setTimeout(() => this.run(() => this.onActionTimeout(key)), ms);
  }

  private onActionTimeout(key: string): void {
    if (key !== this.actionKey) return;
    this.actionTimer = null;
    const action = timeoutAction(this.state);
    if (!action) {
      this.commit();
      return;
    }
    const out: GameEvent[] = [];
    this.apply(action, out);
    const pid = this.state.seats[action.seat]?.playerId;
    if (pid) this.requestSitOut(pid, action.seat);
    this.commit(out);
  }

  private scheduleStart(): void {
    if (this.startTimer || !this.started) return;
    const hand = this.state.hand;
    if (hand && !hand.finished) return;
    if (!canStartHand(this.state)) return;
    const delay = this.lastHandEnded ? NEXT_HAND_DELAY_MS : START_DELAY_MS;
    this.startTimer = setTimeout(() => this.run(() => this.startNextHand()), delay);
  }

  private startNextHand(): void {
    this.startTimer = null;
    if (!this.started) return;
    const hand = this.state.hand;
    if (hand && !hand.finished) return;
    if (!canStartHand(this.state)) return;
    const r = startHand(this.state, shuffledDeck((n) => randomInt(n)));
    this.state = r.state;
    this.lastHandEnded = false;
    this.commit(r.events);
  }

  private run(fn: () => void): void {
    if (this.disposed) return;
    try {
      fn();
    } catch (e) {
      console.error('[table]', e);
    }
  }
}
