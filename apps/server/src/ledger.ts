import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { HandResult, TableState } from '@poker/engine';

// Vite (used by vitest) drops the node: prefix from a static import of node:sqlite, which has no bare name.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

export type LedgerKind = 'sit' | 'hand';

export interface LedgerEntry {
  id: number;
  /** Epoch ms, server clock. */
  at: number;
  /** 'YYYY-MM' in UTC; the balance resets each month. */
  month: string;
  identity: string;
  kind: LedgerKind;
  /** sit: minus the starting stack received; hand: chips won (+) or lost (-). */
  amount: number;
  /** Display name of the table the entry happened at; null for entries written before it was recorded. */
  table: string | null;
  /** hand only: chips collected from the pot (0 when the hand was lost). */
  payout: number | null;
}

export type NewEntry = Pick<LedgerEntry, 'identity' | 'kind' | 'amount'> & Partial<Pick<LedgerEntry, 'table' | 'payout'>>;

export interface HandRecord {
  at: number;
  table: string | null;
  amount: number;
}

export interface ProfileStats {
  month: string;
  balance: number;
  /** Hands dealt in to during the month. */
  handsPlayed: number;
  /** Largest single-hand payout during the month. */
  biggestPotWon: number;
  /** Most recent hand results, newest first, across months. */
  recent: HandRecord[];
}

export interface MonthBalance {
  month: string;
  balance: number;
}

/** Append-only by design: there is no update or delete, and the database rejects both. */
export interface Ledger {
  /** Appends all entries in one transaction, stamped with the same time. */
  append(entries: NewEntry[]): LedgerEntry[];
  monthBalance(identity: string, month: string): number;
  /** Every month the identity has entries in, newest first. */
  history(identity: string): MonthBalance[];
  stats(identity: string, month: string, recent?: number): ProfileStats;
  close(): void;
}

/** Name-based identity, used until login provides an email: trimmed and case-insensitive like table names. */
export function ledgerIdentity(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function monthOf(at: number): string {
  return new Date(at).toISOString().slice(0, 7);
}

/**
 * Net chips per player dealt into a finished hand: payout minus everything committed (uncalled bets come back as payout).
 * Every dealt-in player gets an entry, also when it nets zero, so hands played can be counted.
 */
export function handDeltas(
  state: TableState,
  result: HandResult,
  identityOf: (playerId: string) => string | undefined,
  table: string | null = null,
): NewEntry[] {
  const out: NewEntry[] = [];
  for (const p of Object.values(state.hand?.players ?? {})) {
    const identity = identityOf(p.playerId);
    if (identity === undefined) continue;
    const payout = result.payouts[p.seat] ?? 0;
    out.push({ identity, kind: 'hand', amount: payout - p.committedTotal, table, payout });
  }
  return out;
}

export function sitDebit(identity: string, startingStack: number, table: string | null = null): NewEntry {
  return { identity, kind: 'sit', amount: -startingStack, table };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  month TEXT NOT NULL,
  identity TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sit', 'hand')),
  amount INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_identity_month ON entries (identity, month);
CREATE TRIGGER IF NOT EXISTS entries_no_update BEFORE UPDATE ON entries
  BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS entries_no_delete BEFORE DELETE ON entries
  BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
`;

/** Opens (or creates) the ledger at `file`; pass ':memory:' for tests. */
export function openLedger(file: string, now: () => number = Date.now): Ledger {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Columns added after the first release; ALTER ... ADD COLUMN keeps every existing row.
  const cols = new Set((db.prepare('PRAGMA table_info(entries)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('table_name')) db.exec('ALTER TABLE entries ADD COLUMN table_name TEXT');
  if (!cols.has('payout')) db.exec('ALTER TABLE entries ADD COLUMN payout INTEGER');
  const insert = db.prepare(
    'INSERT INTO entries (at, month, identity, kind, amount, table_name, payout) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const handStats = db.prepare(
    "SELECT COUNT(*) AS hands, COALESCE(MAX(payout), 0) AS biggest FROM entries WHERE identity = ? AND month = ? AND kind = 'hand'",
  );
  const recentHands = db.prepare(
    "SELECT at, table_name AS tbl, amount FROM entries WHERE identity = ? AND kind = 'hand' ORDER BY id DESC LIMIT ?",
  );
  const sum = db.prepare('SELECT COALESCE(SUM(amount), 0) AS balance FROM entries WHERE identity = ? AND month = ?');
  const months = db.prepare(
    'SELECT month, SUM(amount) AS balance FROM entries WHERE identity = ? GROUP BY month ORDER BY month DESC',
  );

  return {
    append(entries) {
      for (const e of entries) {
        if (!Number.isSafeInteger(e.amount)) throw new Error(`Invalid ledger amount: ${e.amount}`);
      }
      const at = now();
      const month = monthOf(at);
      const written: LedgerEntry[] = [];
      db.exec('BEGIN');
      try {
        for (const e of entries) {
          const table = e.table ?? null;
          const payout = e.payout ?? null;
          const r = insert.run(at, month, e.identity, e.kind, e.amount, table, payout);
          written.push({ id: Number(r.lastInsertRowid), at, month, identity: e.identity, kind: e.kind, amount: e.amount, table, payout });
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return written;
    },
    monthBalance(identity, month) {
      return Number((sum.get(identity, month) as { balance: number }).balance);
    },
    history(identity) {
      return (months.all(identity) as unknown as MonthBalance[]).map((r) => ({ month: r.month, balance: Number(r.balance) }));
    },
    stats(identity, month, recent = 10) {
      const h = handStats.get(identity, month) as { hands: number; biggest: number };
      const rows = recentHands.all(identity, recent) as { at: number; tbl: string | null; amount: number }[];
      return {
        month,
        balance: Number((sum.get(identity, month) as { balance: number }).balance),
        handsPlayed: Number(h.hands),
        biggestPotWon: Number(h.biggest),
        recent: rows.map((r) => ({ at: Number(r.at), table: r.tbl, amount: Number(r.amount) })),
      };
    },
    close() {
      db.close();
    },
  };
}
