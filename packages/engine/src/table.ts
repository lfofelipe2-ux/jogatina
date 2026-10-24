import { FULL_DECK } from './deck';
import { EngineError } from './types';
import { computePots } from './pots';
import { findWinners } from './evaluate';
import type {
  Card, GameEvent, HandPlayer, HandResult, HandState, LegalActions, PlayerAction,
  PotResult, Seat, TableConfig, TableState,
} from './types';

export function createTable(config: TableConfig): TableState {
  const { maxSeats, smallBlind, bigBlind } = config;
  if (!Number.isInteger(maxSeats) || maxSeats < 2 || maxSeats > 9) throw new EngineError('maxSeats must be 2..9');
  if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind) || smallBlind <= 0 || smallBlind > bigBlind) {
    throw new EngineError('blinds must be integers with 0 < smallBlind <= bigBlind');
  }
  return {
    config: { maxSeats, smallBlind, bigBlind },
    seats: Array.from({ length: maxSeats }, () => null),
    buttonSeat: null,
    handNumber: 0,
    hand: null,
  };
}

function assertSeat(state: TableState, seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.config.maxSeats) throw new EngineError(`seat ${seat} is out of range`);
}

function liveHand(state: TableState): HandState | null {
  return state.hand && !state.hand.finished ? state.hand : null;
}

/** True when the seat holds chips in the unfinished hand and must fold before leaving or changing state. */
function committedInLiveHand(state: TableState, seat: number): boolean {
  const p = liveHand(state)?.players[seat];
  return !!p && !p.folded;
}

export function sitDown(state: TableState, seat: number, player: Omit<Seat, 'sittingOut'>): TableState {
  assertSeat(state, seat);
  if (state.seats[seat]) throw new EngineError('seat is occupied');
  if (liveHand(state)?.players[seat]) throw new EngineError('seat is still part of the current hand');
  if (state.seats.some((s) => s?.playerId === player.playerId)) throw new EngineError('player is already seated');
  if (!(player.stack > 0)) throw new EngineError('stack must be positive');
  const next = structuredClone(state);
  next.seats[seat] = { playerId: player.playerId, name: player.name, stack: player.stack, sittingOut: false };
  return next;
}

export function standUp(state: TableState, seat: number): TableState {
  assertSeat(state, seat);
  if (!state.seats[seat]) throw new EngineError('seat is empty');
  if (committedInLiveHand(state, seat)) throw new EngineError('fold before standing up');
  const next = structuredClone(state);
  next.seats[seat] = null;
  return next;
}

export function setSittingOut(state: TableState, seat: number, sittingOut: boolean): TableState {
  assertSeat(state, seat);
  if (!state.seats[seat]) throw new EngineError('seat is empty');
  if (committedInLiveHand(state, seat)) throw new EngineError('fold before sitting out');
  const next = structuredClone(state);
  next.seats[seat]!.sittingOut = sittingOut;
  return next;
}

export function addChips(state: TableState, seat: number, amount: number): TableState {
  assertSeat(state, seat);
  if (!state.seats[seat]) throw new EngineError('seat is empty');
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError('amount must be a positive integer');
  if (committedInLiveHand(state, seat)) throw new EngineError('fold before adding chips');
  const next = structuredClone(state);
  next.seats[seat]!.stack += amount;
  return next;
}

/** Seats that would be dealt into the next hand: occupied, not sitting out, stack > 0. */
export function activeSeats(state: TableState): number[] {
  const out: number[] = [];
  state.seats.forEach((s, i) => {
    if (s && !s.sittingOut && s.stack > 0) out.push(i);
  });
  return out;
}

export function canStartHand(state: TableState): boolean {
  return liveHand(state) === null && activeSeats(state).length >= 2;
}

/** First element of the ascending list strictly after `after`, wrapping around. */
function nextIn(list: number[], after: number): number {
  return list.find((x) => x > after) ?? list[0];
}

function commit(state: TableState, hand: HandState, seat: number, amount: number): void {
  const p = hand.players[seat];
  const s = state.seats[seat]!;
  p.committedThisStreet += amount;
  p.committedTotal += amount;
  s.stack -= amount;
  if (s.stack === 0) p.allIn = true;
}

function canActCount(hand: HandState): number {
  return Object.values(hand.players).filter((p) => !p.folded && !p.allIn).length;
}

/** Next seat clockwise after `from` that still owes an action on this street, or null. */
function nextToAct(hand: HandState, maxSeats: number, from: number): number | null {
  const canAct = Object.values(hand.players).filter((p) => !p.folded && !p.allIn);
  if (canAct.length < 2 && canAct.every((p) => p.committedThisStreet >= hand.currentBet)) return null;
  for (let i = 1; i <= maxSeats; i++) {
    const p = hand.players[(from + i) % maxSeats];
    if (p && !p.folded && !p.allIn && (!p.actedThisStreet || p.committedThisStreet < hand.currentBet)) return p.seat;
  }
  return null;
}

function dealStreet(state: TableState, events: GameEvent[]): void {
  const hand = state.hand!;
  const next = hand.street === 'preflop' ? 'flop' : hand.street === 'flop' ? 'turn' : 'river';
  hand.deck.shift(); // burn
  hand.board.push(...hand.deck.splice(0, next === 'flop' ? 3 : 1));
  hand.street = next;
  for (const p of Object.values(hand.players)) {
    p.committedThisStreet = 0;
    p.actedThisStreet = false;
  }
  hand.currentBet = 0;
  hand.minRaise = state.config.bigBlind;
  events.push({ type: 'street', street: next, board: [...hand.board] });
}

function endHand(state: TableState, events: GameEvent[]): void {
  const hand = state.hand!;
  const n = state.config.maxSeats;
  const live = Object.values(hand.players).filter((p) => !p.folded).sort((a, b) => a.seat - b.seat);
  const foldWin = live.length === 1;

  const names: Record<number, string> = {};
  state.seats.forEach((s, i) => {
    if (s) names[i] = s.name;
  });
  const handNames: Record<number, string> = {};
  const showdown: HandResult['showdown'] = {};
  if (!foldWin) {
    const evaluated = findWinners(live.map((p) => ({ seat: p.seat, cards: [...p.holeCards, ...hand.board] })));
    Object.assign(handNames, evaluated.names);
    for (const p of live) showdown[p.seat] = { cards: p.holeCards, handName: handNames[p.seat] };
  }

  const clockwise: number[] = [];
  for (let i = 1; i <= n; i++) clockwise.push((hand.buttonSeat + i) % n);

  const payouts: Record<number, number> = {};
  const pots: PotResult[] = [];
  for (const pot of computePots(hand)) {
    const winners = pot.eligibleSeats.length === 1
      ? pot.eligibleSeats
      : findWinners(pot.eligibleSeats.map((seat) => ({ seat, cards: [...hand.players[seat].holeCards, ...hand.board] }))).winners;
    const ordered = clockwise.filter((seat) => winners.includes(seat));
    const share = Math.floor(pot.amount / ordered.length);
    const odd = pot.amount - share * ordered.length;
    ordered.forEach((seat, i) => {
      const amount = share + (i < odd ? 1 : 0);
      payouts[seat] = (payouts[seat] ?? 0) + amount;
      state.seats[seat]!.stack += amount;
    });
    pots.push({ amount: pot.amount, winners: ordered, ...(foldWin ? {} : { handName: handNames[ordered[0]] }) });
  }

  const result: HandResult = { pots, payouts, showdown, names };
  hand.result = result;
  hand.finished = true;
  hand.toAct = null;
  hand.street = 'showdown';
  events.push({ type: 'handEnded', result: structuredClone(result) });
}

/** Moves the hand forward after an action or deal: next actor, next street, or showdown. */
function settle(state: TableState, from: number, events: GameEvent[]): void {
  const hand = state.hand!;
  if (Object.values(hand.players).filter((p) => !p.folded).length === 1) return endHand(state, events);
  const next = nextToAct(hand, state.config.maxSeats, from);
  if (next !== null) {
    hand.toAct = next;
    return;
  }
  if (canActCount(hand) >= 2 && hand.street !== 'river') {
    dealStreet(state, events);
    return settle(state, hand.buttonSeat, events);
  }
  while (hand.street !== 'river') dealStreet(state, events);
  endHand(state, events);
}

export function startHand(state: TableState, deck: Card[]): { state: TableState; events: GameEvent[] } {
  if (!canStartHand(state)) throw new EngineError('cannot start a hand now');
  if (deck.length !== FULL_DECK.length || new Set(deck).size !== deck.length || deck.some((c) => !FULL_DECK.includes(c))) {
    throw new EngineError('deck must contain the 52 cards exactly once');
  }
  const next = structuredClone(state);
  const { maxSeats: n, smallBlind, bigBlind } = next.config;
  const act = activeSeats(next);
  const button = next.buttonSeat === null ? act[0] : nextIn(act, next.buttonSeat);
  const sb = act.length === 2 ? button : nextIn(act, button);
  const bb = nextIn(act, sb);

  const dealOrder: number[] = [];
  for (let i = 0; i < n; i++) {
    const seat = (sb + i) % n;
    if (act.includes(seat)) dealOrder.push(seat);
  }
  const players: Record<number, HandPlayer> = {};
  dealOrder.forEach((seat, i) => {
    players[seat] = {
      seat,
      playerId: next.seats[seat]!.playerId,
      holeCards: [deck[i], deck[dealOrder.length + i]],
      committedThisStreet: 0,
      committedTotal: 0,
      folded: false,
      allIn: false,
      actedThisStreet: false,
    };
  });

  const hand: HandState = {
    handNumber: next.handNumber + 1,
    buttonSeat: button,
    sbSeat: sb,
    bbSeat: bb,
    deck: deck.slice(2 * dealOrder.length),
    board: [],
    street: 'preflop',
    players,
    toAct: null,
    currentBet: 0,
    minRaise: bigBlind,
    finished: false,
    result: null,
  };
  next.hand = hand;
  next.handNumber = hand.handNumber;
  next.buttonSeat = button;

  commit(next, hand, sb, Math.min(smallBlind, next.seats[sb]!.stack));
  commit(next, hand, bb, Math.min(bigBlind, next.seats[bb]!.stack));
  hand.currentBet = Math.max(players[sb].committedThisStreet, players[bb].committedThisStreet);

  const events: GameEvent[] = [{ type: 'handStarted', handNumber: hand.handNumber, buttonSeat: button, sbSeat: sb, bbSeat: bb }];
  settle(next, bb, events);
  return { state: next, events };
}

export function legalActions(state: TableState, seat: number): LegalActions | null {
  const hand = liveHand(state);
  if (!hand || hand.toAct !== seat) return null;
  const p = hand.players[seat];
  const stack = state.seats[seat]!.stack;
  const callAmount = Math.min(hand.currentBet - p.committedThisStreet, stack);
  const maxTo = p.committedThisStreet + stack;
  const opening = hand.currentBet === 0;
  const minTo = opening ? state.config.bigBlind : hand.currentBet + hand.minRaise;
  return {
    seat,
    canFold: true,
    canCheck: p.committedThisStreet === hand.currentBet,
    callAmount,
    canBet: opening && stack > 0,
    canRaise: !opening && !p.actedThisStreet && stack > callAmount,
    minTo: Math.min(minTo, maxTo),
    maxTo,
  };
}

export function applyAction(state: TableState, action: PlayerAction): { state: TableState; events: GameEvent[] } {
  if (!liveHand(state)) throw new EngineError('no hand in progress');
  const legal = legalActions(state, action.seat);
  if (!legal) throw new EngineError('not this seat\'s turn');

  const next = structuredClone(state);
  const hand = next.hand!;
  const seat = action.seat;
  const p = hand.players[seat];

  switch (action.type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      if (!legal.canCheck) throw new EngineError('cannot check');
      break;
    case 'call':
      if (legal.callAmount === 0) throw new EngineError('nothing to call');
      commit(next, hand, seat, legal.callAmount);
      break;
    case 'bet':
    case 'raise': {
      if (!(action.type === 'bet' ? legal.canBet : legal.canRaise)) throw new EngineError(`cannot ${action.type}`);
      const to = action.amount;
      if (to === undefined || !Number.isInteger(to) || to < legal.minTo || to > legal.maxTo) {
        throw new EngineError(`${action.type} amount must be between ${legal.minTo} and ${legal.maxTo}`);
      }
      const increment = to - hand.currentBet;
      commit(next, hand, seat, to - p.committedThisStreet);
      if (increment >= hand.minRaise) {
        hand.minRaise = increment;
        for (const other of Object.values(hand.players)) {
          if (other.seat !== seat && !other.folded && !other.allIn) other.actedThisStreet = false;
        }
      }
      hand.currentBet = Math.max(hand.currentBet, to);
      break;
    }
    default:
      throw new EngineError(`unknown action ${String(action.type)}`);
  }

  p.actedThisStreet = true;
  const events: GameEvent[] = [{ type: 'action', seat, action: action.type, to: p.committedThisStreet, allIn: p.allIn }];
  settle(next, seat, events);
  return { state: next, events };
}

/** Action the server applies when the player to act times out: check if legal, else fold. */
export function timeoutAction(state: TableState): PlayerAction | null {
  const hand = liveHand(state);
  if (!hand || hand.toAct === null) return null;
  const legal = legalActions(state, hand.toAct)!;
  return { seat: hand.toAct, type: legal.canCheck ? 'check' : 'fold' };
}
