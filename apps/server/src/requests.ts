import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ChangeRequest, RequestAuthor, RequestEvent, RequestStatus } from '@poker/engine';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

/** A requester may keep this many requests waiting for approval at once. */
export const MAX_PENDING_PER_AUTHOR = 3;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  author_identity TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,
  pr_url TEXT
);
CREATE TABLE IF NOT EXISTS request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests (id),
  at INTEGER NOT NULL,
  author TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS request_events_request ON request_events (request_id);
`;

export interface RequestStore {
  create(identity: string, name: string, text: string): ChangeRequest;
  get(id: number): ChangeRequest | undefined;
  /** Newest first. */
  list(limit?: number): ChangeRequest[];
  pendingCount(identity: string): number;
  authorOf(id: number): string | undefined;
  setStatus(id: number, status: RequestStatus, prUrl?: string | null): ChangeRequest | undefined;
  addEvent(id: number, author: RequestAuthor, name: string, text: string, images?: string[]): ChangeRequest | undefined;
  /**
   * Hands the worker its next job, atomically: an approved preview to merge ('merging' -> 'waiting_deploy') first,
   * otherwise the oldest approved request to work on ('approved' -> 'working').
   */
  claimNext(): { kind: 'merge' | 'work'; request: ChangeRequest } | undefined;
  close(): void;
}

interface Row {
  id: number;
  at: number;
  author_name: string;
  text: string;
  status: RequestStatus;
  pr_url: string | null;
}

/** Opens (or creates) the request store at `file`; pass ':memory:' for tests. */
export function openRequests(file: string, now: () => number = Date.now): RequestStore {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const insert = db.prepare('INSERT INTO requests (at, author_identity, author_name, text, status) VALUES (?, ?, ?, ?, ?)');
  const one = db.prepare('SELECT id, at, author_name, text, status, pr_url FROM requests WHERE id = ?');
  const recent = db.prepare('SELECT id, at, author_name, text, status, pr_url FROM requests ORDER BY id DESC LIMIT ?');
  const events = db.prepare('SELECT at, author, name, text, images FROM request_events WHERE request_id = ? ORDER BY id');
  const pending = db.prepare("SELECT COUNT(*) AS n FROM requests WHERE author_identity = ? AND status = 'pending'");
  const author = db.prepare('SELECT author_identity AS a FROM requests WHERE id = ?');
  const status = db.prepare('UPDATE requests SET status = ? WHERE id = ?');
  const statusPr = db.prepare('UPDATE requests SET status = ?, pr_url = ? WHERE id = ?');
  const event = db.prepare('INSERT INTO request_events (request_id, at, author, name, text, images) VALUES (?, ?, ?, ?, ?, ?)');
  const oldest = db.prepare('SELECT id FROM requests WHERE status = ? ORDER BY id LIMIT 1');

  const hydrate = (r: Row): ChangeRequest => ({
    id: Number(r.id),
    at: Number(r.at),
    authorName: r.author_name,
    text: r.text,
    status: r.status,
    prUrl: r.pr_url,
    events: (events.all(r.id) as unknown as (Omit<RequestEvent, 'images'> & { images: string })[]).map((e) => ({
      ...e,
      at: Number(e.at),
      images: JSON.parse(e.images) as string[],
    })),
  });
  const get = (id: number) => {
    const r = one.get(id) as Row | undefined;
    return r ? hydrate(r) : undefined;
  };

  return {
    create(identity, name, text) {
      const r = insert.run(now(), identity, name, text, 'pending');
      return get(Number(r.lastInsertRowid))!;
    },
    get,
    list(limit = 30) {
      return (recent.all(limit) as unknown as Row[]).map(hydrate);
    },
    pendingCount(identity) {
      return Number((pending.get(identity) as { n: number }).n);
    },
    authorOf(id) {
      return (author.get(id) as { a: string } | undefined)?.a;
    },
    setStatus(id, next, prUrl) {
      if (prUrl === undefined) status.run(next, id);
      else statusPr.run(next, prUrl, id);
      return get(id);
    },
    addEvent(id, who, name, text, images = []) {
      if (!one.get(id)) return undefined;
      event.run(id, now(), who, name, text, JSON.stringify(images));
      return get(id);
    },
    claimNext() {
      db.exec('BEGIN IMMEDIATE');
      try {
        let kind: 'merge' | 'work' = 'merge';
        let r = oldest.get('merging') as { id: number } | undefined;
        if (r) status.run('waiting_deploy', r.id);
        else {
          kind = 'work';
          r = oldest.get('approved') as { id: number } | undefined;
          if (r) status.run('working', r.id);
        }
        db.exec('COMMIT');
        return r ? { kind, request: get(Number(r.id))! } : undefined;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    close() {
      db.close();
    },
  };
}
