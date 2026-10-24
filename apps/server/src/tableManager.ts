import { randomInt } from 'node:crypto';
import type { CreateTableResponse, LobbyTable } from '@poker/engine';
import type { Ledger } from './ledger';
import { TableRoom, int, newToken } from './tableRoom';

// No 0/O or 1/I, so a name read aloud is unambiguous.
const NAME_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class TableManager {
  private readonly tables = new Map<string, TableRoom>();

  constructor(private readonly ledger?: Ledger) {}

  get size(): number {
    return this.tables.size;
  }

  connectedPlayers(): number {
    let n = 0;
    for (const t of this.tables.values()) n += t.connectedCount();
    return n;
  }

  /** Open tables for the lobby, busiest first. */
  list(): LobbyTable[] {
    return [...this.tables.values()]
      .map((t) => t.summary())
      .sort((a, b) => b.players.length - a.players.length || a.name.localeCompare(b.name));
  }

  private newName(): string {
    const taken = new Set([...this.tables.values()].map((t) => t.name));
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += NAME_CHARS[randomInt(NAME_CHARS.length)];
      const name = `Mesa ${code}`;
      if (!taken.has(name)) return name;
    }
  }

  find(tableId: unknown): TableRoom | undefined {
    return typeof tableId === 'string' ? this.tables.get(tableId) : undefined;
  }

  create(raw: unknown): CreateTableResponse {
    const r = (raw ?? {}) as Record<string, unknown>;
    const maxSeats = int(r.maxSeats, 2, 9);
    const bigBlind = int(r.bigBlind, 1, 1_000_000);
    const smallBlind = int(r.smallBlind, 1, bigBlind);
    const startingStack = int(r.startingStack, bigBlind + 1, 1_000_000_000);
    const actionTimeoutSec = int(r.actionTimeoutSec, 10, 120);
    let id = newToken();
    while (this.tables.has(id)) id = newToken();
    const hostToken = newToken();
    const room = new TableRoom(
      { id, name: this.newName(), hostToken, config: { maxSeats, smallBlind, bigBlind }, startingStack, actionTimeoutSec, ledger: this.ledger },
      (t) => this.remove(t),
    );
    this.tables.set(id, room);
    return { ok: true, tableId: id, hostToken };
  }

  rotate(room: TableRoom): string {
    this.tables.delete(room.id);
    let id = newToken();
    while (this.tables.has(id)) id = newToken();
    room.id = id;
    this.tables.set(id, room);
    return id;
  }

  closeAll(): void {
    for (const t of this.tables.values()) t.dispose();
    this.tables.clear();
  }

  private remove(room: TableRoom): void {
    if (this.tables.get(room.id) === room) this.tables.delete(room.id);
    room.dispose();
  }
}
