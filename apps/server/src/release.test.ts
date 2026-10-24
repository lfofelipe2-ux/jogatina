import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientTableState,
  ClientToServerEvents,
  CreateTableResponse,
  JoinTableResponse,
  LobbyTable,
  ProfileResponse,
  ServerToClientEvents,
  SimpleResponse,
} from '@poker/engine';
import { createApp } from './app';
import { forwardedEmail } from './identity';
import { monthOf, openLedger, type Ledger } from './ledger';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const previousTrust = process.env.TRUST_PROXY_EMAIL;
beforeAll(() => {
  process.env.TRUST_PROXY_EMAIL = '1';
});
afterAll(() => {
  if (previousTrust === undefined) delete process.env.TRUST_PROXY_EMAIL;
  else process.env.TRUST_PROXY_EMAIL = previousTrust;
});

const ack = <T>(send: (cb: (r: T) => void) => void): Promise<T> => new Promise((resolve) => send(resolve));
const CONFIG = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 6, actionTimeoutSec: 30 };

const latest = new WeakMap<Client, ClientTableState>();

/** Resolves with the latest state matching pred, including one that already arrived. */
function nextState(c: Client, pred: (s: ClientTableState) => boolean, timeoutMs = 5000): Promise<ClientTableState> {
  const last = latest.get(c);
  if (last && pred(last)) return Promise.resolve(last);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for state')), timeoutMs);
    const on = (s: ClientTableState) => {
      if (!pred(s)) return;
      clearTimeout(t);
      c.off('state', on);
      resolve(s);
    };
    c.on('state', on);
  });
}

describe('forwardedEmail', () => {
  it('reads X-Forwarded-Email lower-cased, and ignores a missing or malformed header', () => {
    expect(forwardedEmail({ 'x-forwarded-email': '  Luis@Example.COM ' })).toBe('luis@example.com');
    expect(forwardedEmail({})).toBeUndefined();
    expect(forwardedEmail({ 'x-forwarded-email': 'not an email' })).toBeUndefined();
  });
});

describe('lobby, profile, identity and single session', () => {
  let app: ReturnType<typeof createApp>;
  let ledger: Ledger;
  let base: string;
  const clients: Client[] = [];
  const month = monthOf(Date.now());

  const open = (email?: string): Promise<Client> =>
    new Promise((resolve, reject) => {
      const s: Client = connect(base, {
        transports: ['websocket'],
        forceNew: true,
        extraHeaders: email ? { 'X-Forwarded-Email': email } : undefined,
      });
      clients.push(s);
      s.on('state', (st) => latest.set(s, st));
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });

  const createTable = async (c: Client) => {
    const r = await ack<CreateTableResponse>((cb) => c.emit('createTable', CONFIG, cb));
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  const join = (c: Client, tableId: string, name: string, extra: { hostToken?: string; reconnectToken?: string } = {}) =>
    ack<JoinTableResponse>((cb) => c.emit('joinTable', { tableId, name, ...extra }, cb));

  beforeAll(async () => {
    ledger = openLedger(':memory:');
    app = createApp({ ledger });
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
    base = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    app.manager.closeAll();
    await app.io.close();
    ledger.close();
  });

  it('lists open tables with players and monthly balances, read-only', async () => {
    const host = await open();
    const t = await createTable(host);
    expect(await join(host, t.tableId, 'Hostia', { hostToken: t.hostToken })).toMatchObject({ ok: true });
    const st = await nextState(host, (s) => s.online.length === 1);
    expect(await ack<SimpleResponse>((cb) => host.emit('sit', { seat: 0 }, cb))).toEqual({ ok: true });

    const res = await fetch(`${base}/api/tables`);
    const body = (await res.json()) as { ok: boolean; tables: LobbyTable[] };
    const row = body.tables.find((x) => x.tableId === t.tableId)!;
    expect(row).toMatchObject({
      name: st.tableName,
      host: 'Hostia',
      smallBlind: 5,
      bigBlind: 10,
      maxSeats: 6,
      seated: 1,
      started: false,
      players: [{ name: 'Hostia', seated: true, balance: -1000 }],
    });
    expect(st.tableName).toMatch(/^Mesa [A-Z2-9]{4}$/);
    expect(JSON.stringify(body)).not.toContain(t.hostToken);

    // Anyone who sees the lobby can join from it.
    const guest = await open();
    expect(await join(guest, row.tableId, 'Visita')).toMatchObject({ ok: true, isHost: false });
  });

  it('uses X-Forwarded-Email as the identity when present, the name otherwise', async () => {
    const a = await open('Luis@Example.COM');
    const b = await open();
    const t = await createTable(a);
    const ra = await join(a, t.tableId, 'Luis', { hostToken: t.hostToken });
    const rb = await join(b, t.tableId, 'Bia');
    expect(ra.ok && rb.ok).toBe(true);
    await ack((cb) => a.emit('sit', { seat: 0 }, cb));
    await ack((cb) => b.emit('sit', { seat: 1 }, cb));
    expect(ledger.monthBalance('luis@example.com', month)).toBe(-1000);
    expect(ledger.monthBalance('luis', month)).toBe(0);
    expect(ledger.monthBalance('bia', month)).toBe(-1000);

    // Profile: opened by playerId, never exposes the email.
    const p = await ack<ProfileResponse>((cb) => b.emit('profile:get', { playerId: ra.ok ? ra.playerId : '' }, cb));
    expect(p).toMatchObject({ ok: true, profile: { name: 'Luis', month, balance: -1000, handsPlayed: 0, biggestPotWon: 0, recent: [] } });
    expect(JSON.stringify(p)).not.toContain('example.com');
  });

  it('records hand results in the profile and the hand history, with no hole cards when the hand ends by a fold', async () => {
    const a = await open();
    const b = await open();
    const t = await createTable(a);
    const ra = await join(a, t.tableId, 'Hist A', { hostToken: t.hostToken });
    const rb = await join(b, t.tableId, 'Hist B');
    if (!ra.ok || !rb.ok) throw new Error('join failed');
    await ack((cb) => a.emit('sit', { seat: 0 }, cb));
    await ack((cb) => b.emit('sit', { seat: 1 }, cb));
    const dealt = nextState(a, (s) => !!s.table.hand && !s.table.hand.finished);
    await ack((cb) => a.emit('host:start', cb));
    const live = await dealt;
    const toAct = live.table.hand!.toAct!;
    const actor = live.table.seats[toAct]!.playerId === ra.playerId ? a : b;
    const watcher = actor === a ? b : a;
    const done = nextState(watcher, (s) => s.history.length === 1);
    expect(await ack<SimpleResponse>((cb) => actor.emit('action', { type: 'fold' }, cb))).toEqual({ ok: true });
    const st = await done;

    const h = st.history[0];
    expect(h.players).toHaveLength(2);
    expect(h.players.every((x) => x.cards === null && x.handName === null)).toBe(true);
    expect(h.players.map((x) => x.net).sort((x, y) => x - y)).toEqual([-5, 5]);

    const prof = await ack<ProfileResponse>((cb) => a.emit('profile:get', { playerId: rb.playerId }, cb));
    if (!prof.ok) throw new Error(prof.error);
    expect(prof.profile.handsPlayed).toBe(1);
    expect(prof.profile.recent).toHaveLength(1);
    expect(prof.profile.recent[0].table).toBe(st.tableName);
    expect(prof.profile.balance).toBe(-1000 + prof.profile.recent[0].amount);
  });

  it('keeps one session per account: a new socket disconnects the older one with a message (name identity)', async () => {
    const first = await open();
    const t = await createTable(first);
    const r1 = await join(first, t.tableId, 'Solo', { hostToken: t.hostToken });
    if (!r1.ok) throw new Error(r1.error);
    const replaced = new Promise<string>((resolve) => first.once('sessionReplaced', (e) => resolve(e.message)));
    const gone = new Promise<void>((resolve) => first.once('disconnect', () => resolve()));

    // Same account (same name) at another table.
    const second = await open();
    const t2 = await createTable(second);
    expect(await join(second, t2.tableId, 'solo', { hostToken: t2.hostToken })).toMatchObject({ ok: true });
    expect(await replaced).toMatch(/outra aba ou aparelho/);
    await gone;
    expect(second.connected).toBe(true);

    // The newest socket still plays normally.
    expect(await ack<SimpleResponse>((cb) => second.emit('sit', { seat: 0 }, cb))).toEqual({ ok: true });
  });

  it('a signed-in account joining the same table from a new device takes its player back and drops the old socket', async () => {
    const phone = await open('ana@example.com');
    const t = await createTable(phone);
    const r1 = await join(phone, t.tableId, 'Ana', { hostToken: t.hostToken });
    if (!r1.ok) throw new Error(r1.error);
    const replaced = new Promise<void>((resolve) => phone.once('sessionReplaced', () => resolve()));

    const laptop = await open('ANA@example.com');
    const r2 = await join(laptop, t.tableId, 'Ana');
    expect(r2).toMatchObject({ ok: true, playerId: r1.playerId, isHost: true });
    await replaced;
    const st = await nextState(laptop, (s) => s.online.length === 1 && s.online[0].connected);
    expect(st.online[0]).toMatchObject({ name: 'Ana', connected: true });

    // Another account cannot reclaim that player with the stolen reconnect token.
    const other = await open('eve@example.com');
    expect(await join(other, t.tableId, 'Eve', { reconnectToken: r1.reconnectToken })).toEqual({
      ok: false,
      error: 'Este lugar pertence a outra conta',
    });
  });
});
