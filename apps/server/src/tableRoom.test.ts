import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ClientTableState } from '@poker/engine';
import type { JoinTableRequest } from '@poker/engine';
import { openLedger, type Ledger } from './ledger';
import { TableRoom, type AppSocket } from './tableRoom';

const ACTION_TIMEOUT_SEC = 10;

function fakeSocket(): AppSocket {
  return { data: { hits: [] }, emit: vi.fn(), disconnect: vi.fn() } as unknown as AppSocket;
}

function emitted(sock: AppSocket, event: string): unknown[][] {
  return (sock.emit as Mock).mock.calls.filter((c) => c[0] === event);
}

function lastState(sock: AppSocket): ClientTableState {
  const calls = emitted(sock, 'state');
  return calls[calls.length - 1][1] as ClientTableState;
}

function joined(room: TableRoom, sock: AppSocket, req: JoinTableRequest): { playerId: string; reconnectToken: string } {
  const r = room.join(sock, req);
  if (!r.ok) throw new Error(r.error);
  return r;
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('TableRoom', () => {
  const rooms: TableRoom[] = [];

  function makeRoom(ledger?: Ledger): TableRoom {
    const room = new TableRoom(
      {
        id: 't1',
        hostToken: 'host-token',
        config: { maxSeats: 6, smallBlind: 5, bigBlind: 10 },
        startingStack: 1000,
        actionTimeoutSec: ACTION_TIMEOUT_SEC,
        ledger,
      },
      () => {},
    );
    rooms.push(room);
    return room;
  }

  /** Heads-up table with a hand in progress: seat 0 (button, small blind) acts first preflop. */
  async function handInProgress(ledger?: Ledger) {
    const room = makeRoom(ledger);
    const a = fakeSocket();
    const b = fakeSocket();
    const pa = joined(room, a, { tableId: 't1', name: 'Alice', hostToken: 'host-token' }).playerId;
    const pb = joined(room, b, { tableId: 't1', name: 'Bob' }).playerId;
    room.sit(pa, 0);
    room.sit(pb, 1);
    room.start(pa);
    await vi.advanceTimersByTimeAsync(1600);
    expect(lastState(a).table.hand!.toAct).toBe(0);
    return { room, a, b, pa, pb };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const r of rooms.splice(0)) r.dispose();
    vi.useRealTimers();
  });

  describe('sitting out while in a live hand', () => {
    it('an action timeout that auto-checks does not freeze the table, and the seat sits out after the hand', async () => {
      const { room, a, pa, pb } = await handInProgress();
      room.action(pa, { type: 'call' });
      await flush();

      await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_SEC * 1000);
      let st = lastState(a);
      expect(st.table.hand!.street).toBe('flop');
      expect(st.table.hand!.toAct).toBe(1);
      expect(st.table.seats[1]!.sittingOut).toBe(false);

      room.action(pb, { type: 'check' });
      room.action(pa, { type: 'fold' });
      await flush();

      st = lastState(a);
      expect(st.table.hand!.finished).toBe(true);
      expect(st.table.seats[1]!.sittingOut).toBe(true);
      expect(st.table.seats[0]!.sittingOut).toBe(false);
    });

    it('standing up mid-hand does not throw; the seat is released once the hand ends', async () => {
      const { room, b, pa } = await handInProgress();
      expect(() => room.standUp(pa)).not.toThrow();
      await flush();

      const st = lastState(b);
      expect(st.table.hand!.finished).toBe(true);
      expect(st.table.seats[0]).toBeNull();
    });

    it('sitting back in the same seat cancels a pending stand-up', async () => {
      const { room, a, pa, pb } = await handInProgress();
      room.action(pa, { type: 'call' });
      room.standUp(pa);
      expect(() => room.sit(pa, 0)).not.toThrow();
      room.action(pb, { type: 'check' });
      await flush();

      const st = lastState(a);
      expect(st.table.hand!.street).toBe('flop');
      expect(st.table.hand!.finished).toBe(false);
      expect(st.table.seats[0]).not.toBeNull();
      expect(st.table.seats[0]!.sittingOut).toBe(false);
    });
  });

  describe('rejoining after a kick', () => {
    it('a kicked player who rejoins under the same name is bought in again, so net is not inflated', async () => {
      const { room, a, pa, pb } = await handInProgress();
      room.action(pa, { type: 'fold' });
      await flush();
      expect(lastState(a).table.seats[1]!.stack).toBe(1005);

      room.kick(pa, pb);
      const c = fakeSocket();
      const pc = joined(room, c, { tableId: 't1', name: 'Bob' }).playerId;
      room.sit(pc, 1);
      await flush();

      const st = lastState(c);
      const row = st.scoreboard['Bob']!;
      expect(st.table.seats[1]!.stack).toBe(1000);
      expect(row.invested).toBe(1000 + 1000);
      expect(row.net).toBe(st.table.seats[1]!.stack - row.invested);
    });
  });

  describe('ledger', () => {
    it('debits the starting stack on sit and records each player\'s net when a hand ends', async () => {
      const ledger = openLedger(':memory:');
      const month = new Date().toISOString().slice(0, 7);
      const { room, pa, pb } = await handInProgress(ledger);
      expect(ledger.monthBalance('Alice', month)).toBe(-1000);
      expect(ledger.monthBalance('Bob', month)).toBe(-1000);

      room.action(pa, { type: 'fold' });
      await flush();
      // Alice posted the small blind (5) and folded; Bob's big blind is returned as part of his payout.
      expect(ledger.monthBalance('Alice', month)).toBe(-1000 - 5);
      expect(ledger.monthBalance('Bob', month)).toBe(-1000 + 5);

      room.standUp(pb);
      room.sit(pb, 1);
      expect(ledger.monthBalance('Bob', month)).toBe(-1000 + 5);
      ledger.close();
    });

    it('a fresh buy-in after busting or a kick is debited again', async () => {
      const ledger = openLedger(':memory:');
      const month = new Date().toISOString().slice(0, 7);
      const { room, pa, pb } = await handInProgress(ledger);
      room.action(pa, { type: 'fold' });
      room.kick(pa, pb);
      const c = fakeSocket();
      const pc = joined(room, c, { tableId: 't1', name: 'Bob' }).playerId;
      room.sit(pc, 1);
      expect(ledger.monthBalance('Bob', month)).toBe(-2000 + 5);
      ledger.close();
    });
  });

  describe('join', () => {
    it('re-joining from the same socket keeps the same player', async () => {
      const room = makeRoom();
      const a = fakeSocket();
      const first = joined(room, a, { tableId: 't1', name: 'Alice' });
      const again = joined(room, a, { tableId: 't1', name: 'Alice' });
      expect(again.playerId).toBe(first.playerId);
      expect(again.reconnectToken).toBe(first.reconnectToken);
    });
  });

  describe('state', () => {
    it('includes the server clock', async () => {
      const room = makeRoom();
      const a = fakeSocket();
      joined(room, a, { tableId: 't1', name: 'Alice' });
      await flush();
      const st = lastState(a);
      expect(typeof st.serverNow).toBe('number');
      expect(Math.abs(st.serverNow - Date.now())).toBeLessThan(1000);
    });
  });
});
