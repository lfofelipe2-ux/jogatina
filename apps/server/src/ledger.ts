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
}

export type NewEntry = Pick<LedgerEntry, 'identity' | 'kind' | 'amount'>;

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
  close(): void;
}

/** Placeholder: the player's display name, until Google login provides a stable account id. */
export function ledgerIdentity(name: string): string {
  return name.trim();
}

export function monthOf(at: number): string {
  return new Date(at).toISOString().slice(0, 7);
}

/** Net chips per player for a finished hand: payout minus everything committed (uncalled bets come back as payout). */
export function handDeltas(state: TableState, result: HandResult): NewEntry[] {
  const out: NewEntry[] = [];
  for (const p of Object.values(state.hand?.players ?? {})) {
    const name = result.names[p.seat];
    const amount = (result.payouts[p.seat] ?? 0) - p.committedTotal;
    if (name === undefined || amount === 0) continue;
    out.push({ identity: ledgerIdentity(name), kind: 'hand', amount });
  }
  return out;
}

export function sitDebit(name: string, startingStack: number): NewEntry {
  return { identity: ledgerIdentity(name), kind: 'sit', amount: -startingStack };
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
  const insert = db.prepare('INSERT INTO entries (at, month, identity, kind, amount) VALUES (?, ?, ?, ?, ?)');
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
          const r = insert.run(at, month, e.identity, e.kind, e.amount);
          written.push({ id: Number(r.lastInsertRowid), at, month, ...e });
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
    close() {
      db.close();
    },
  };
}
