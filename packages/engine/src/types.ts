export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
/** Two characters, rank then suit: 'As', 'Td', '2c'. Same notation pokersolver uses. */
export type Card = `${Rank}${Suit}`;

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface TableConfig {
  maxSeats: number; // 2..9
  smallBlind: number;
  bigBlind: number;
}

export interface Seat {
  playerId: string;
  name: string;
  stack: number;
  sittingOut: boolean;
}

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface PlayerAction {
  seat: number;
  type: ActionType;
  /** For bet/raise: the total the player has committed on this street after the action ("raise to"). Ignored otherwise. */
  amount?: number;
}

export interface HandPlayer {
  seat: number;
  /** Player who was dealt into this seat. The seat may be reoccupied by someone else later. */
  playerId: string;
  holeCards: [Card, Card];
  committedThisStreet: number;
  committedTotal: number;
  folded: boolean;
  allIn: boolean;
  actedThisStreet: boolean;
}

export interface Pot {
  amount: number;
  eligibleSeats: number[];
}

export interface PotResult {
  amount: number;
  winners: number[];
  /** pokersolver hand description of the winning hand; absent when everyone else folded. */
  handName?: string;
}

export interface HandResult {
  pots: PotResult[];
  /** Chips paid to each seat this hand (seat index -> amount). */
  payouts: Record<number, number>;
  /** Hole cards and hand name of every seat that reached showdown without folding. Empty when the hand ended by folds. */
  showdown: Record<number, { cards: [Card, Card]; handName: string }>;
  /** Player name of every seat occupied when the hand ended, including seats whose player stands up later. */
  names: Record<number, string>;
}

export interface HandState {
  handNumber: number;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  /** Remaining undealt cards, top of deck at index 0. */
  deck: Card[];
  board: Card[];
  street: Street;
  /** Keyed by seat index; only seats dealt into this hand. */
  players: Record<number, HandPlayer>;
  /** Seat whose turn it is, or null when no action is pending (hand finished). */
  toAct: number | null;
  /** Highest committedThisStreet among players. */
  currentBet: number;
  /** Minimum raise increment for this street (starts at bigBlind, grows with each full raise). */
  minRaise: number;
  finished: boolean;
  result: HandResult | null;
}

export interface TableState {
  config: TableConfig;
  seats: (Seat | null)[]; // length === config.maxSeats
  buttonSeat: number | null;
  handNumber: number;
  hand: HandState | null;
}

export interface LegalActions {
  seat: number;
  canFold: boolean;
  canCheck: boolean;
  /** Extra chips needed to call (capped at the stack); 0 when check is possible. */
  callAmount: number;
  canBet: boolean; // no bet yet on this street
  canRaise: boolean; // a bet exists and the player may raise
  /** Smallest legal "to" amount for bet/raise (capped at all-in). */
  minTo: number;
  /** Largest legal "to" amount: committedThisStreet + stack (all-in). */
  maxTo: number;
}

export type GameEvent =
  | { type: 'handStarted'; handNumber: number; buttonSeat: number; sbSeat: number; bbSeat: number }
  | { type: 'action'; seat: number; action: ActionType; to: number; allIn: boolean }
  | { type: 'street'; street: Street; board: Card[] }
  | { type: 'handEnded'; result: HandResult };

export class EngineError extends Error {}

/** What one viewer may see. Other players' hole cards are null unless revealed at showdown. */
export interface SeatView {
  seat: number;
  playerId: string;
  name: string;
  stack: number;
  sittingOut: boolean;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  committedThisStreet: number;
  holeCards: [Card, Card] | null;
  hasCards: boolean;
}

export interface HandView {
  handNumber: number;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  board: Card[];
  street: Street;
  toAct: number | null;
  currentBet: number;
  pots: Pot[];
  finished: boolean;
  result: HandResult | null;
}

export interface TableView {
  config: TableConfig;
  seats: (SeatView | null)[];
  hand: HandView | null;
}

export interface ScoreRow {
  name: string;
  stack: number;
  /** Total chips bought in plus top-ups. */
  invested: number;
  /** stack - invested, refreshed after each hand. */
  net: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
}

/** Keyed by player name (unique per table). */
export type Scoreboard = Record<string, ScoreRow>;
