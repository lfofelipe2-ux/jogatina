import type { ChatInput, ChatMessage } from './chat';
import type { ActionType, LegalActions, Scoreboard, TableConfig, TableView } from './types';

export interface CreateTableRequest {
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  maxSeats: number; // 2..9
  actionTimeoutSec: number; // 10..120
}
export type CreateTableResponse = { ok: true; tableId: string; hostToken: string } | { ok: false; error: string };

export interface JoinTableRequest {
  tableId: string;
  name: string; // 2..16 chars, trimmed, unique at the table
  /** Sent back on reload to reclaim the same player and seat. */
  reconnectToken?: string;
  /** Present only in the creator's browser. */
  hostToken?: string;
}
export type JoinTableResponse =
  | { ok: true; playerId: string; reconnectToken: string; isHost: boolean }
  | { ok: false; error: string };

export type Ack<T> = (response: T) => void;
export type SimpleResponse = { ok: true } | { ok: false; error: string };

export interface ClientToServerEvents {
  createTable: (req: CreateTableRequest, ack: Ack<CreateTableResponse>) => void;
  joinTable: (req: JoinTableRequest, ack: Ack<JoinTableResponse>) => void;
  sit: (req: { seat: number }, ack: Ack<SimpleResponse>) => void;
  standUp: (ack: Ack<SimpleResponse>) => void;
  action: (req: { type: ActionType; amount?: number }, ack: Ack<SimpleResponse>) => void;
  'host:start': (ack: Ack<SimpleResponse>) => void;
  'host:kick': (req: { playerId: string }, ack: Ack<SimpleResponse>) => void;
  'host:rotateLink': (ack: Ack<{ ok: true; tableId: string } | { ok: false; error: string }>) => void;
  'chat:send': (req: ChatInput, ack: Ack<SimpleResponse>) => void;
}

export interface ClientTableState {
  tableId: string;
  config: TableConfig & { startingStack: number; actionTimeoutSec: number };
  table: TableView;
  you: { playerId: string; name: string; seat: number | null; isHost: boolean };
  /** Present only when it is this viewer's turn. */
  legal: LegalActions | null;
  /** Epoch ms when the player to act times out, or null. */
  actionDeadline: number | null;
  /** Server clock (Date.now()) when this state was built, for countdown skew correction. */
  serverNow: number;
  started: boolean;
  scoreboard: Scoreboard;
  /** Players currently connected to the table, including spectators. */
  online: { playerId: string; name: string; seat: number | null; connected: boolean }[];
}

export interface ServerToClientEvents {
  state: (state: ClientTableState) => void;
  linkRotated: (req: { tableId: string }) => void;
  kicked: () => void;
  error: (req: { message: string }) => void;
  chat: (msg: ChatMessage) => void;
  /** Sent once on join with the most recent messages, oldest first. */
  'chat:history': (msgs: ChatMessage[]) => void;
}
