import type { ChatInput, ChatMessage } from './chat';
import type { ActionType, Card, HandCategory, LegalActions, Scoreboard, TableConfig, TableView } from './types';

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
  /** Profile of a player at the viewer's table (the viewer must have joined it). */
  'profile:get': (req: { playerId: string }, ack: Ack<ProfileResponse>) => void;
}

/** One finished hand. Hole cards appear only for seats that reached showdown; folded seats never show cards. */
export interface HandHistoryEntry {
  handNumber: number;
  /** Epoch ms when the hand ended. */
  at: number;
  board: Card[];
  pots: { amount: number; winners: string[] }[];
  players: {
    seat: number;
    name: string;
    folded: boolean;
    /** Chips won (+) or lost (-) in this hand. */
    net: number;
    /** Showdown only. */
    cards: [Card, Card] | null;
    /** Best five-card hand, showdown only. */
    handName: string | null;
    category: HandCategory | null;
    best: Card[] | null;
  }[];
}

export interface PlayerProfile {
  name: string;
  /** 'YYYY-MM' (UTC) the numbers below refer to. */
  month: string;
  /** Monthly balance: each sit debits the starting stack, hand results are added on top. */
  balance: number;
  handsPlayed: number;
  biggestPotWon: number;
  /** Last pot results, newest first. */
  recent: { at: number; table: string | null; amount: number }[];
}
export type ProfileResponse = { ok: true; profile: PlayerProfile } | { ok: false; error: string };

/** Row of GET /api/tables: an open table any signed-in user may join. */
export interface LobbyTable {
  tableId: string;
  name: string;
  host: string | null;
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  maxSeats: number;
  seated: number;
  started: boolean;
  /** Connected players; balance is this month's ledger balance, null when no ledger is configured. */
  players: { name: string; seated: boolean; balance: number | null }[];
}

export interface ClientTableState {
  tableId: string;
  /** Stable display name ("Mesa ABCD"), unchanged when the link is rotated. */
  tableName: string;
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
  /** Most recent finished hands, newest first. Same for every viewer. */
  history: HandHistoryEntry[];
}

export interface ServerToClientEvents {
  state: (state: ClientTableState) => void;
  linkRotated: (req: { tableId: string }) => void;
  kicked: () => void;
  /** The same account joined from another socket; this one is being disconnected. */
  sessionReplaced: (req: { message: string }) => void;
  error: (req: { message: string }) => void;
  chat: (msg: ChatMessage) => void;
  /** Sent once on join with the most recent messages, oldest first. */
  'chat:history': (msgs: ChatMessage[]) => void;
}
