import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientTableState,
  ClientToServerEvents,
  CreateTableResponse,
  JoinTableResponse,
  ServerToClientEvents,
  SimpleResponse,
} from '@poker/engine';
import { createApp } from './app';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

function ack<T>(send: (cb: (r: T) => void) => void): Promise<T> {
  return new Promise((resolve) => send(resolve));
}

async function waitFor<T>(read: () => T | undefined, what: string, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = read();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * Records every state a socket receives and plays the seat it is given whenever
 * its own view carries `legal` (call when there is something to call, else check).
 */
class Player {
  readonly states: ClientTableState[] = [];
  readonly acks: Promise<SimpleResponse>[] = [];
  playerId = '';
  private lastKey: string | null = null;

  constructor(
    readonly name: string,
    readonly socket: Client,
  ) {
    socket.on('state', (st) => this.onState(st));
  }

  get last(): ClientTableState | undefined {
    return this.states[this.states.length - 1];
  }

  private onState(st: ClientTableState): void {
    this.states.push(st);
    const hand = st.table.hand;
    if (!st.legal || !hand || hand.finished) return;
    // The same turn can be broadcast more than once; act only once per distinct position.
    const key = JSON.stringify([
      hand.handNumber,
      hand.street,
      hand.toAct,
      hand.currentBet,
      st.table.seats.map((s) => [s?.stack, s?.committedThisStreet]),
    ]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const type = st.legal.callAmount > 0 ? 'call' : 'check';
    this.acks.push(ack<SimpleResponse>((cb) => this.socket.emit('action', { type }, cb)));
  }
}

describe('e2e: a full hand through the socket.io server', () => {
  let app: ReturnType<typeof createApp>;
  let port: number;
  const sockets: Client[] = [];
  const players: Player[] = [];
  let preHandTotal = 0;

  const open = (): Promise<Client> =>
    new Promise((resolve, reject) => {
      const s: Client = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
      sockets.push(s);
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });

  const total = (st: ClientTableState): number =>
    st.table.seats.reduce((sum, s) => sum + (s?.stack ?? 0), 0);

  beforeAll(async () => {
    app = createApp();
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
    port = (app.httpServer.address() as AddressInfo).port;

    const names = ['Ana', 'Bruno', 'Carla'];
    const socks = [await open(), await open(), await open()];
    for (let i = 0; i < names.length; i++) players.push(new Player(names[i]!, socks[i]!));
    const [host, ...others] = players;
    if (!host) throw new Error('no host');

    const created = await ack<CreateTableResponse>((cb) =>
      host.socket.emit(
        'createTable',
        { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 3, actionTimeoutSec: 30 },
        cb,
      ),
    );
    if (!created.ok) throw new Error(`createTable failed: ${created.error}`);

    const hostJoin = await ack<JoinTableResponse>((cb) =>
      host.socket.emit('joinTable', { tableId: created.tableId, name: host.name, hostToken: created.hostToken }, cb),
    );
    if (!hostJoin.ok) throw new Error(`host join failed: ${hostJoin.error}`);
    host.playerId = hostJoin.playerId;

    for (const p of others) {
      const r = await ack<JoinTableResponse>((cb) =>
        p.socket.emit('joinTable', { tableId: created.tableId, name: p.name }, cb),
      );
      if (!r.ok) throw new Error(`join failed for ${p.name}: ${r.error}`);
      p.playerId = r.playerId;
    }

    for (let seat = 0; seat < players.length; seat++) {
      const p = players[seat]!;
      const r = await ack<SimpleResponse>((cb) => p.socket.emit('sit', { seat }, cb));
      expect(r).toEqual({ ok: true });
    }

    // Before the hand: three seats with full stacks.
    const seated = await waitFor(
      () => {
        const st = host.last;
        return st && st.table.hand === null && st.table.seats.filter((s) => s !== null).length === 3 ? st : undefined;
      },
      'all three seated',
    );
    preHandTotal = total(seated);
    expect(preHandTotal).toBe(3000);

    const started = await ack<SimpleResponse>((cb) => host.socket.emit('host:start', cb));
    expect(started).toEqual({ ok: true });

    await waitFor(() => (host.last?.table.hand ? true : undefined), 'hand to start');

    // Play until every client has seen the finished hand (the server broadcasts it to all sockets).
    await waitFor(
      () => (players.every((p) => p.last?.table.hand?.finished === true) ? true : undefined),
      'hand to finish',
      10000,
    );
    const acks = await Promise.all(players.flatMap((p) => p.acks));
    for (const r of acks) expect(r).toEqual({ ok: true });
    expect(acks.length).toBeGreaterThan(0);
  }, 15000);

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    if (app) {
      app.manager.closeAll();
      await app.io.close();
      if (app.httpServer.listening) {
        await new Promise<void>((resolve) => app.httpServer.close(() => resolve()));
      }
    }
  });

  it('shows each client only its own hole cards until the hand is finished', () => {
    for (const p of players) {
      expect(p.states.length).toBeGreaterThan(0);
      for (const st of p.states) {
        const hand = st.table.hand;
        const finished = hand?.finished === true;

        st.table.seats.forEach((seat) => {
          if (!seat || seat.playerId === st.you.playerId) return;
          if (!finished) expect(seat.holeCards, `${p.name} saw another seat's cards mid-hand`).toBeNull();
        });

        const own = st.you.seat !== null ? st.table.seats[st.you.seat] : null;
        if (hand && !finished && own?.inHand) {
          expect(own.holeCards, `${p.name} is missing own cards`).not.toBeNull();
        }

        if (st.legal) {
          expect(hand?.toAct, `${p.name} received legal actions out of turn`).toBe(st.you.seat);
        }
      }
    }
  });

  it('conserves chips across the hand', () => {
    for (const p of players) {
      expect(p.last && p.last.table.hand?.finished, `${p.name} last state is not finished`).toBe(true);
      expect(total(p.last!), `${p.name} sees a different chip total`).toBe(preHandTotal);
    }
  });

  it('records one scoreboard row per player with handsPlayed 1', () => {
    const sb = players[0]!.last!.scoreboard;
    expect(Object.keys(sb).sort()).toEqual(players.map((p) => p.name).sort());
    for (const p of players) {
      expect(sb[p.name]?.handsPlayed, `handsPlayed for ${p.name}`).toBe(1);
    }
  });
});
