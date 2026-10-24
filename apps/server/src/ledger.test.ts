import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handDeltas, ledgerIdentity, monthOf, openLedger, sitDebit, type Ledger } from './ledger';
import type { HandResult, TableState } from '@poker/engine';

const OCT_31_LAST_MS = Date.UTC(2026, 9, 31, 23, 59, 59, 999);
const NOV_1 = Date.UTC(2026, 10, 1);

const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

describe('ledger', () => {
  const open: Ledger[] = [];
  const dirs: string[] = [];
  let clock = 0;

  beforeEach(() => {
    clock = Date.UTC(2026, 9, 10);
  });

  function ledger(file = ':memory:'): Ledger {
    const l = openLedger(file, () => clock);
    open.push(l);
    return l;
  }

  afterEach(() => {
    for (const l of open.splice(0)) l.close();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('monthOf uses UTC', () => {
    expect(monthOf(OCT_31_LAST_MS)).toBe('2026-10');
    expect(monthOf(NOV_1)).toBe('2026-11');
  });

  it('name identity is the trimmed, lower-cased name', () => {
    expect(ledgerIdentity('  Ana ')).toBe('ana');
  });

  it('sums sit debits and hand results', () => {
    const l = ledger();
    l.append([sitDebit('Ana', 1000)]);
    l.append([{ identity: 'Ana', kind: 'hand', amount: 250 }, { identity: 'Bia', kind: 'hand', amount: -250 }]);
    l.append([{ identity: 'Ana', kind: 'hand', amount: 1500 }]);
    expect(l.monthBalance('Ana', '2026-10')).toBe(750);
    expect(l.monthBalance('Bia', '2026-10')).toBe(-250);
    expect(l.monthBalance('Nobody', '2026-10')).toBe(0);
  });

  it('goes negative for a player who keeps losing and sitting down again', () => {
    const l = ledger();
    for (let i = 0; i < 3; i++) {
      l.append([sitDebit('Ana', 1000)]);
      l.append([{ identity: 'Ana', kind: 'hand', amount: -1000 }]);
    }
    expect(l.monthBalance('Ana', '2026-10')).toBe(-6000);
  });

  it('starts each month from zero and keeps earlier months', () => {
    const l = ledger();
    clock = OCT_31_LAST_MS;
    const [oct] = l.append([sitDebit('Ana', 1000)]);
    clock = NOV_1;
    const [nov] = l.append([{ identity: 'Ana', kind: 'hand', amount: 300 }]);
    expect(oct.month).toBe('2026-10');
    expect(nov.month).toBe('2026-11');
    expect(l.monthBalance('Ana', '2026-10')).toBe(-1000);
    expect(l.monthBalance('Ana', '2026-11')).toBe(300);
    expect(l.history('Ana')).toEqual([
      { month: '2026-11', balance: 300 },
      { month: '2026-10', balance: -1000 },
    ]);
  });

  it('exposes no update or delete, and the database refuses both', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ledger-'));
    dirs.push(dir);
    const file = path.join(dir, 'nested', 'ledger.db');
    const l = ledger(file);
    l.append([sitDebit('Ana', 1000)]);
    expect(Object.keys(l).sort()).toEqual(['append', 'close', 'history', 'monthBalance', 'stats']);

    const raw = new DatabaseSync(file);
    try {
      expect(() => raw.exec('UPDATE entries SET amount = 0')).toThrow(/append-only/);
      expect(() => raw.exec('DELETE FROM entries')).toThrow(/append-only/);
    } finally {
      raw.close();
    }
    expect(l.monthBalance('Ana', '2026-10')).toBe(-1000);
  });

  it('writes a batch all or nothing', () => {
    const l = ledger();
    expect(() => l.append([sitDebit('Ana', 1000), { identity: 'Ana', kind: 'hand', amount: 0.5 }])).toThrow();
    expect(() => l.append([sitDebit('Ana', 1000), { identity: 'Ana', kind: 'bogus' as 'hand', amount: 1 }])).toThrow();
    expect(l.history('Ana')).toEqual([]);
  });

  it('handDeltas nets payouts against committed chips, books every dealt-in player and keeps the table', () => {
    const hp = (seat: number, committedTotal: number) => ({ seat, playerId: `p${seat}`, committedTotal }) as never;
    const state = { hand: { players: { 0: hp(0, 200), 1: hp(1, 500), 2: hp(2, 0), 3: hp(3, 10) } } } as unknown as TableState;
    const result = { payouts: { 1: 700 }, names: {} } as unknown as HandResult;
    const ids: Record<string, string> = { p0: 'ana', p1: 'bia@example.com', p2: 'caio' };
    expect(handDeltas(state, result, (pid) => ids[pid], 'Mesa X')).toEqual([
      { identity: 'ana', kind: 'hand', amount: -200, table: 'Mesa X', payout: 0 },
      { identity: 'bia@example.com', kind: 'hand', amount: 200, table: 'Mesa X', payout: 700 },
      { identity: 'caio', kind: 'hand', amount: 0, table: 'Mesa X', payout: 0 },
    ]);
  });

  it('balance maths: sit debits plus hand results, per UTC month, with profile stats', () => {
    const l = ledger();
    clock = Date.UTC(2026, 9, 30, 12);
    l.append([sitDebit('ana', 1000, 'Mesa A')]);
    l.append([{ identity: 'ana', kind: 'hand', amount: 400, table: 'Mesa A', payout: 600 }]);
    clock = Date.UTC(2026, 10, 1, 0, 0, 1);
    l.append([sitDebit('ana', 1000, 'Mesa B')]);
    l.append([{ identity: 'ana', kind: 'hand', amount: -50, table: 'Mesa B', payout: 0 }]);
    l.append([{ identity: 'ana', kind: 'hand', amount: 250, table: 'Mesa B', payout: 350 }]);
    l.append([{ identity: 'ana', kind: 'hand', amount: 0, table: 'Mesa B', payout: 0 }]);

    expect(l.monthBalance('ana', '2026-10')).toBe(-1000 + 400);
    const nov = l.stats('ana', '2026-11');
    expect(nov).toMatchObject({ month: '2026-11', balance: -1000 - 50 + 250, handsPlayed: 3, biggestPotWon: 350 });
    expect(nov.recent.map((r) => r.amount)).toEqual([0, 250, -50, 400]);
    expect(nov.recent[0]).toEqual({ at: clock, table: 'Mesa B', amount: 0 });
    expect(l.stats('ana', '2026-11', 2).recent).toHaveLength(2);
    expect(l.stats('nobody', '2026-11')).toEqual({ month: '2026-11', balance: 0, handsPlayed: 0, biggestPotWon: 0, recent: [] });
  });

  it('adds the new columns to a ledger created by the first release, keeping its rows', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ledger-'));
    dirs.push(dir);
    const file = path.join(dir, 'old.db');
    const raw = new DatabaseSync(file);
    raw.exec(`CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, month TEXT NOT NULL,
      identity TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('sit', 'hand')), amount INTEGER NOT NULL)`);
    raw.exec(`INSERT INTO entries (at, month, identity, kind, amount) VALUES (1, '2026-10', 'ana', 'sit', -1000)`);
    raw.close();
    const l = ledger(file);
    l.append([{ identity: 'ana', kind: 'hand', amount: 30, table: 'Mesa A', payout: 50 }]);
    expect(l.stats('ana', '2026-10')).toMatchObject({ balance: -970, handsPlayed: 1, biggestPotWon: 50 });
  });
});
