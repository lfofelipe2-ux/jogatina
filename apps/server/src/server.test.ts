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

class Watcher {
  last: ClientTableState | null = null;
  private waiters: { pred: (s: ClientTableState) => boolean; resolve: (s: ClientTableState) => void }[] = [];

  constructor(socket: Client) {
    socket.on('state', (st) => {
      this.last = st;
      this.waiters = this.waiters.filter((w) => {
        if (!w.pred(st)) return true;
        w.resolve(st);
        return false;
      });
    });
  }

  until(pred: (s: ClientTableState) => boolean, timeoutMs = 5000): Promise<ClientTableState> {
    if (this.last && pred(this.last)) return Promise.resolve(this.last);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for state')), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (s) => {
          clearTimeout(t);
          resolve(s);
        },
      });
    });
  }
}

describe('poker server', () => {
  let app: ReturnType<typeof createApp>;
  let port: number;
  const clients: Client[] = [];

  const open = (): Promise<Client> =>
    new Promise((resolve, reject) => {
      const s: Client = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
      clients.push(s);
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });

  let lobby: Client;
  let alice: Client;
  let bob: Client;
  let tableId: string;
  let hostToken: string;
  let aliceId: string;
  let aliceToken: string;
  let aliceWatch: Watcher;
  let bobWatch: Watcher;

  beforeAll(async () => {
    app = createApp();
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
    port = (app.httpServer.address() as AddressInfo).port;
    lobby = await open();
    alice = await open();
    bob = await open();
    aliceWatch = new Watcher(alice);
    bobWatch = new Watcher(bob);
  });

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    app.manager.closeAll();
    await app.io.close();
  });

  it('rejects an invalid table config and creates a valid one', async () => {
    const bad = await ack<CreateTableResponse>((cb) =>
      lobby.emit('createTable', { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 1, actionTimeoutSec: 30 }, cb),
    );
    expect(bad.ok).toBe(false);

    const created = await ack<CreateTableResponse>((cb) =>
      lobby.emit('createTable', { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 6, actionTimeoutSec: 30 }, cb),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    tableId = created.tableId;
    hostToken = created.hostToken;
  });

  it('reports an unknown table', async () => {
    const r = await ack<JoinTableResponse>((cb) => bob.emit('joinTable', { tableId: 'nope', name: 'Bob' }, cb));
    expect(r).toEqual({ ok: false, error: 'Mesa não encontrada' });
  });

  it('joins players, rejects duplicate names, and marks the host', async () => {
    const a = await ack<JoinTableResponse>((cb) =>
      alice.emit('joinTable', { tableId, name: 'Alice', hostToken }, cb),
    );
    expect(a).toMatchObject({ ok: true, isHost: true });
    if (!a.ok) return;
    aliceId = a.playerId;
    aliceToken = a.reconnectToken;

    const b = await ack<JoinTableResponse>((cb) => bob.emit('joinTable', { tableId, name: ' Bob ' }, cb));
    expect(b).toMatchObject({ ok: true, isHost: false });

    const dup = await ack<JoinTableResponse>((cb) => lobby.emit('joinTable', { tableId, name: 'alice' }, cb));
    expect(dup).toEqual({ ok: false, error: 'Nome já em uso' });
  });

  it('rejects host commands from non-hosts', async () => {
    const r = await ack<SimpleResponse>((cb) => bob.emit('host:start', cb));
    expect(r).toEqual({ ok: false, error: 'Só o anfitrião pode fazer isso' });
  });

  it('seats both players and starts a hand', async () => {
    const s0 = await ack<SimpleResponse>((cb) => alice.emit('sit', { seat: 0 }, cb));
    const s1 = await ack<SimpleResponse>((cb) => bob.emit('sit', { seat: 1 }, cb));
    expect(s0).toEqual({ ok: true });
    expect(s1).toEqual({ ok: true });

    const started = await ack<SimpleResponse>((cb) => alice.emit('host:start', cb));
    expect(started).toEqual({ ok: true });

    await aliceWatch.until((s) => s.table.hand !== null && !s.table.hand.finished);
  });

  it('shows each player only their own hole cards and legal moves to the actor only', async () => {
    const a = await aliceWatch.until((s) => s.table.hand !== null && !s.table.hand.finished);
    const b = await bobWatch.until((s) => s.table.hand !== null && !s.table.hand.finished);

    expect(a.table.seats[0]?.holeCards).not.toBeNull();
    expect(a.table.seats[1]?.holeCards).toBeNull();
    expect(b.table.seats[1]?.holeCards).not.toBeNull();
    expect(b.table.seats[0]?.holeCards).toBeNull();

    const actor = a.table.hand?.toAct;
    expect(actor === 0 || actor === 1).toBe(true);
    expect(actor === 0 ? a.legal : b.legal).not.toBeNull();
    expect(actor === 0 ? b.legal : a.legal).toBeNull();
  });

  it('applies a fold, ends the hand and updates the scoreboard', async () => {
    const cur = await aliceWatch.until((s) => s.table.hand !== null && !s.table.hand.finished);
    const actor = cur.table.hand?.toAct;
    const who = actor === 0 ? alice : bob;
    const r = await ack<SimpleResponse>((cb) => who.emit('action', { type: 'fold' }, cb));
    expect(r).toEqual({ ok: true });

    const done = await aliceWatch.until((s) => s.table.hand?.finished === true);
    expect(done.scoreboard['Alice']?.handsPlayed).toBe(1);
    expect(done.scoreboard['Bob']?.handsPlayed).toBe(1);
  });

  it('reclaims the same player with the reconnect token', async () => {
    alice.disconnect();
    const again = await open();
    const r = await ack<JoinTableResponse>((cb) =>
      again.emit('joinTable', { tableId, name: 'Alice', reconnectToken: aliceToken }, cb),
    );
    expect(r).toMatchObject({ ok: true, playerId: aliceId, isHost: true });
  });

  it('lets a connection re-join the table it is already in, but not switch tables', async () => {
    const again = await open();
    const first = await ack<JoinTableResponse>((cb) =>
      again.emit('joinTable', { tableId, name: 'Alice', reconnectToken: aliceToken }, cb),
    );
    expect(first).toMatchObject({ ok: true, playerId: aliceId });
    const second = await ack<JoinTableResponse>((cb) =>
      again.emit('joinTable', { tableId, name: 'Alice', reconnectToken: aliceToken }, cb),
    );
    expect(second).toMatchObject({ ok: true, playerId: aliceId });

    const other = await ack<CreateTableResponse>((cb) =>
      lobby.emit('createTable', { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 6, actionTimeoutSec: 30 }, cb),
    );
    if (!other.ok) throw new Error('could not create second table');
    const switched = await ack<JoinTableResponse>((cb) =>
      again.emit('joinTable', { tableId: other.tableId, name: 'Carla' }, cb),
    );
    expect(switched).toEqual({ ok: false, error: 'Esta conexão já está em uma mesa' });
  });
});
