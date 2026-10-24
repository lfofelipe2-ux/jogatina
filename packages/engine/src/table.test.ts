import { describe, it, expect } from 'vitest';
import { FULL_DECK } from './deck';
import {
  createTable, sitDown, standUp, addChips, setSittingOut, activeSeats, canStartHand,
  startHand, legalActions, applyAction, timeoutAction,
} from './table';
import { EngineError } from './types';
import type { ActionType, Card, PlayerAction, TableConfig, TableState } from './types';

const CFG: TableConfig = { maxSeats: 6, smallBlind: 5, bigBlind: 10 };

function tableWith(stacks: Record<number, number>, config: TableConfig = CFG): TableState {
  let s = createTable(config);
  for (const [seat, stack] of Object.entries(stacks)) {
    s = sitDown(s, Number(seat), { playerId: `p${seat}`, name: `P${seat}`, stack });
  }
  return s;
}

/** Deck whose first cards are dealt as the holes (dealOrder starts at SB), then burns and board, then the rest. */
function rig(dealOrder: number[], holes: Record<number, [Card, Card]>, board: Card[]): Card[] {
  const head: Card[] = [];
  for (let r = 0; r < 2; r++) for (const seat of dealOrder) head.push(holes[seat][r]);
  const spare = FULL_DECK.filter((c) => ![...head, ...board].includes(c));
  return [...head, spare[0], ...board.slice(0, 3), spare[1], board[3], spare[2], board[4], ...spare.slice(3)];
}

function act(state: TableState, seat: number, type: ActionType, amount?: number): TableState {
  return applyAction(state, { seat, type, amount }).state;
}

function stacks(state: TableState): (number | null)[] {
  return state.seats.map((s) => (s ? s.stack : null));
}

function chipTotal(state: TableState): number {
  const inStacks = state.seats.reduce((t, s) => t + (s?.stack ?? 0), 0);
  const live = state.hand && !state.hand.finished;
  const committed = live ? Object.values(state.hand!.players).reduce((t, p) => t + p.committedTotal, 0) : 0;
  return inStacks + committed;
}

const BOARD: Card[] = ['2c', '5d', '8h', '9s', 'Jc'];

describe('seating', () => {
  it('validates table config and seats', () => {
    expect(() => createTable({ maxSeats: 1, smallBlind: 5, bigBlind: 10 })).toThrow(EngineError);
    expect(() => createTable({ maxSeats: 10, smallBlind: 5, bigBlind: 10 })).toThrow(EngineError);
    expect(() => createTable({ maxSeats: 6, smallBlind: 10, bigBlind: 5 })).toThrow(EngineError);
    const s = createTable(CFG);
    expect(s.seats).toHaveLength(6);
    expect(s.buttonSeat).toBeNull();
    expect(s.handNumber).toBe(0);
  });

  it('sitDown rejects occupied seats, duplicate players and empty stacks', () => {
    const s = tableWith({ 0: 100 });
    expect(() => sitDown(s, 0, { playerId: 'x', name: 'X', stack: 100 })).toThrow(EngineError);
    expect(() => sitDown(s, 1, { playerId: 'p0', name: 'X', stack: 100 })).toThrow(EngineError);
    expect(() => sitDown(s, 1, { playerId: 'x', name: 'X', stack: 0 })).toThrow(EngineError);
    expect(() => sitDown(s, 6, { playerId: 'x', name: 'X', stack: 100 })).toThrow(EngineError);
  });

  it('activeSeats excludes sitting-out and busted players; canStartHand needs two', () => {
    let s = tableWith({ 0: 100, 1: 100, 2: 100 });
    s = setSittingOut(s, 1, true);
    expect(activeSeats(s)).toEqual([0, 2]);
    s = addChips(s, 0, 1);
    expect(canStartHand(s)).toBe(true);
    s = setSittingOut(s, 2, true);
    expect(canStartHand(s)).toBe(false);
  });

  it('standUp is refused for a player still in the hand, allowed after folding', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });
    s = startHand(s, [...FULL_DECK]).state;
    expect(() => standUp(s, 0)).toThrow(EngineError);
    s = act(s, 0, 'fold');
    expect(standUp(s, 0).seats[0]).toBeNull();
  });
});

describe('blinds and button', () => {
  it('rotates the button and posts blinds over three hands with three players', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });

    let r = startHand(s, [...FULL_DECK]);
    s = r.state;
    expect(r.events[0]).toEqual({ type: 'handStarted', handNumber: 1, buttonSeat: 0, sbSeat: 1, bbSeat: 2 });
    expect(s.hand!.toAct).toBe(0);
    expect(stacks(s)).toEqual([1000, 995, 990]);
    s = act(s, 0, 'fold');
    s = act(s, 1, 'fold');
    expect(s.hand!.finished).toBe(true);
    expect(stacks(s)).toEqual([1000, 995, 1005]);

    r = startHand(s, [...FULL_DECK]);
    s = r.state;
    expect(s.hand!.buttonSeat).toBe(1);
    expect(s.hand!.sbSeat).toBe(2);
    expect(s.hand!.bbSeat).toBe(0);
    expect(s.hand!.toAct).toBe(1);
    s = act(s, 1, 'fold');
    s = act(s, 2, 'fold');
    expect(stacks(s)).toEqual([1005, 995, 1000]);

    r = startHand(s, [...FULL_DECK]);
    s = r.state;
    expect(s.hand!.handNumber).toBe(3);
    expect(s.hand!.buttonSeat).toBe(2);
    expect(s.hand!.sbSeat).toBe(0);
    expect(s.hand!.bbSeat).toBe(1);
    expect(s.hand!.toAct).toBe(2);
  });

  it('skips empty and sitting-out seats when rotating', () => {
    let s = tableWith({ 0: 1000, 2: 1000, 4: 1000, 5: 1000 });
    s = setSittingOut(s, 2, true);
    s = startHand(s, [...FULL_DECK]).state;
    expect(s.hand!.buttonSeat).toBe(0);
    expect(s.hand!.sbSeat).toBe(4);
    expect(s.hand!.bbSeat).toBe(5);
    expect(s.hand!.players[2]).toBeUndefined();
  });

  it('a short blind is capped at the stack and goes all-in', () => {
    let s = tableWith({ 0: 1000, 1: 3, 2: 1000 }, { ...CFG, maxSeats: 3 });
    s = startHand(s, [...FULL_DECK]).state;
    expect(s.hand!.players[1].committedTotal).toBe(3);
    expect(s.hand!.players[1].allIn).toBe(true);
    expect(s.seats[1]!.stack).toBe(0);
    expect(s.hand!.currentBet).toBe(10);
  });

  it('rejects a deck that is not 52 unique cards', () => {
    const s = tableWith({ 0: 1000, 1: 1000 });
    expect(() => startHand(s, FULL_DECK.slice(1))).toThrow(EngineError);
    const duplicate = [...FULL_DECK];
    duplicate[1] = FULL_DECK[0];
    expect(() => startHand(s, duplicate)).toThrow(EngineError);
  });
});

describe('heads-up', () => {
  it('button posts the small blind and acts first preflop; BB acts first afterwards', () => {
    let s = tableWith({ 0: 1000, 1: 1000 }, { ...CFG, maxSeats: 2 });
    s = startHand(s, [...FULL_DECK]).state;
    expect(s.hand!.buttonSeat).toBe(0);
    expect(s.hand!.sbSeat).toBe(0);
    expect(s.hand!.bbSeat).toBe(1);
    expect(s.hand!.toAct).toBe(0);

    s = act(s, 0, 'call');
    expect(s.hand!.toAct).toBe(1);
    s = act(s, 1, 'check');
    expect(s.hand!.street).toBe('flop');
    expect(s.hand!.toAct).toBe(1);
    s = act(s, 1, 'check');
    expect(s.hand!.toAct).toBe(0);
    s = act(s, 0, 'check');
    expect(s.hand!.street).toBe('turn');
    expect(s.hand!.toAct).toBe(1);
  });
});

describe('betting rules', () => {
  it('big blind has the option to check after a limp', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });
    s = startHand(s, [...FULL_DECK]).state;
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    const legal = legalActions(s, 2)!;
    expect(legal.canCheck).toBe(true);
    expect(legal.callAmount).toBe(0);
    expect(legal.canRaise).toBe(true);
    s = act(s, 2, 'check');
    expect(s.hand!.street).toBe('flop');
  });

  it('enforces min-raise and reopens action only on full raises', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });
    s = startHand(s, [...FULL_DECK]).state;
    expect(legalActions(s, 0)).toMatchObject({ minTo: 20, maxTo: 1000, canBet: false, canRaise: true, callAmount: 10 });
    expect(() => applyAction(s, { seat: 0, type: 'raise', amount: 15 })).toThrow(EngineError);
    expect(() => applyAction(s, { seat: 1, type: 'raise', amount: 30 })).toThrow(EngineError);

    s = act(s, 0, 'raise', 30);
    expect(s.hand!.minRaise).toBe(20);
    expect(legalActions(s, 1)).toMatchObject({ minTo: 50, callAmount: 25 });
    expect(() => applyAction(s, { seat: 1, type: 'raise', amount: 40 })).toThrow(EngineError);

    s = act(s, 1, 'call');
    expect(s.hand!.players[1].committedThisStreet).toBe(30);
    s = act(s, 2, 'raise', 50);
    expect(s.hand!.currentBet).toBe(50);
    expect(s.hand!.minRaise).toBe(20);
    expect(s.hand!.players[0].actedThisStreet).toBe(false);
    expect(s.hand!.players[1].actedThisStreet).toBe(false);
    expect(legalActions(s, 0)).toMatchObject({ canRaise: true, minTo: 70 });
  });

  it('a short all-in raise does not reopen action for players who already acted', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 40 }, { ...CFG, maxSeats: 3 });
    s = startHand(s, [...FULL_DECK]).state;
    s = act(s, 0, 'raise', 30);
    s = act(s, 1, 'call');

    const shove = legalActions(s, 2)!;
    expect(shove.maxTo).toBe(40);
    s = act(s, 2, 'raise', 40);
    expect(s.hand!.players[2].allIn).toBe(true);
    expect(s.hand!.currentBet).toBe(40);
    expect(s.hand!.minRaise).toBe(20);

    expect(s.hand!.toAct).toBe(0);
    expect(legalActions(s, 0)).toMatchObject({ canCheck: false, canRaise: false, callAmount: 10 });
    expect(() => applyAction(s, { seat: 0, type: 'raise', amount: 80 })).toThrow(EngineError);

    s = act(s, 0, 'call');
    expect(s.hand!.toAct).toBe(1);
    expect(legalActions(s, 1)).toMatchObject({ canRaise: false, callAmount: 10 });
    s = act(s, 1, 'call');
    expect(s.hand!.street).toBe('flop');
  });

  it('rejects actions out of turn and illegal checks', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });
    s = startHand(s, [...FULL_DECK]).state;
    expect(() => applyAction(s, { seat: 1, type: 'call' })).toThrow(EngineError);
    expect(() => applyAction(s, { seat: 0, type: 'check' })).toThrow(EngineError);
    expect(() => applyAction(s, { seat: 0, type: 'bet', amount: 50 })).toThrow(EngineError);
  });

  it('timeout checks when legal and folds otherwise', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });
    s = startHand(s, [...FULL_DECK]).state;
    expect(timeoutAction(s)).toEqual({ seat: 0, type: 'fold' });
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    expect(timeoutAction(s)).toEqual({ seat: 2, type: 'check' });
  });
});

describe('showdown and pots', () => {
  it('hand ends on folds with the last player taking the pot and no showdown', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });
    s = startHand(s, [...FULL_DECK]).state;
    const r = applyAction(s, { seat: 0, type: 'fold' });
    const end = applyAction(r.state, { seat: 1, type: 'fold' });
    const result = end.state.hand!.result!;
    expect(end.events.at(-1)).toEqual({ type: 'handEnded', result });
    expect(result.showdown).toEqual({});
    expect(result.pots).toEqual([{ amount: 15, winners: [2] }]);
    expect(result.payouts).toEqual({ 2: 15 });
    expect(end.state.hand!.street).toBe('showdown');
    expect(end.state.hand!.toAct).toBeNull();
  });

  it('three-way all-in with different stacks makes a main pot and two side pots', () => {
    let s = tableWith({ 0: 100, 1: 300, 2: 500 }, { ...CFG, maxSeats: 3 });
    const deck = rig([1, 2, 0], { 0: ['As', 'Ad'], 1: ['Ks', 'Kd'], 2: ['Qs', 'Qd'] }, BOARD);
    s = startHand(s, deck).state;
    s = act(s, 0, 'raise', 100);
    s = act(s, 1, 'raise', 300);
    const r = applyAction(s, { seat: 2, type: 'raise', amount: 500 });
    s = r.state;
    expect(r.events.some((e) => e.type === 'street' && e.street === 'flop')).toBe(true);
    expect(s.hand!.finished).toBe(true);

    const result = s.hand!.result!;
    expect(result.pots.map((p) => [p.amount, p.winners])).toEqual([
      [300, [0]],
      [400, [1]],
      [200, [2]],
    ]);
    expect(result.pots[0].handName).toBeDefined();
    expect(result.payouts).toEqual({ 0: 300, 1: 400, 2: 200 });
    expect(Object.keys(result.showdown).map(Number)).toEqual([0, 1, 2]);
    expect(stacks(s)).toEqual([300, 400, 200]);
  });

  it('splits a pot evenly and gives the odd chip to the first winner clockwise after the button', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });
    const deck = rig([1, 2, 0], { 0: ['As', 'Ad'], 1: ['Ah', 'Ac'], 2: ['2h', '3h'] }, ['Ks', 'Kd', '9c', '4s', '7d']);
    s = startHand(s, deck).state;
    s = act(s, 0, 'raise', 21);
    s = act(s, 1, 'call');
    s = act(s, 2, 'call');
    for (let i = 0; i < 3; i++) {
      for (const seat of [1, 2, 0]) s = act(s, seat, 'check');
    }
    const result = s.hand!.result!;
    expect(result.pots).toEqual([
      { amount: 63, winners: [1, 0], handName: expect.any(String), decision: { runnerUp: 2 } },
    ]);
    expect(result.showdown[0]).toMatchObject({ category: 'two-pair', best: ['As', 'Ad', 'Ks', 'Kd', '9c'] });
    expect(result.showdown[2]).toMatchObject({ category: 'pair', best: ['Ks', 'Kd', '9c', '7d', '4s'] });
    expect(result.payouts).toEqual({ 1: 32, 0: 31 });
    expect(stacks(s)).toEqual([1010, 1011, 979]);
  });

  it('chip total is conserved through a hand and matches payouts at the end', () => {
    let s = tableWith({ 0: 1000, 1: 1000, 2: 1000 }, { ...CFG, maxSeats: 3 });
    const before = chipTotal(s);
    s = startHand(s, [...FULL_DECK]).state;
    expect(chipTotal(s)).toBe(before);
    s = act(s, 0, 'raise', 60);
    expect(chipTotal(s)).toBe(before);
    s = act(s, 1, 'call');
    s = act(s, 2, 'fold');
    expect(chipTotal(s)).toBe(before);
    s = act(s, 1, 'fold');
    const sum = Object.values(s.hand!.result!.payouts).reduce((t, v) => t + v, 0);
    expect(sum).toBe(130);
    expect(chipTotal(s)).toBe(before);
    expect(stacks(s)).toEqual([1070, 940, 990]);
  });
});

describe('hand result names', () => {
  it('names every seat occupied when the hand ends, even after that player stands up', () => {
    let s = tableWith({ 0: 500, 1: 500 });
    s = startHand(s, FULL_DECK).state;
    expect(s.hand!.players[0].playerId).toBe('p0');
    s = act(s, 0, 'fold');
    expect(s.hand!.finished).toBe(true);
    expect(s.hand!.result!.names).toEqual({ 0: 'P0', 1: 'P1' });

    s = standUp(s, 1);
    expect(s.hand!.result!.names).toEqual({ 0: 'P0', 1: 'P1' });
  });
});

describe('random play', () => {
  function rng(seed: number): (n: number) => number {
    let x = seed >>> 0;
    return (n) => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x % n;
    };
  }

  function randomAction(state: TableState, seat: number, rand: (n: number) => number): PlayerAction {
    const l = legalActions(state, seat)!;
    const choices: PlayerAction[] = [{ seat, type: 'fold' }];
    choices.push(l.canCheck ? { seat, type: 'check' } : { seat, type: 'call' });
    if (l.canBet) choices.push({ seat, type: 'bet', amount: l.minTo + rand(l.maxTo - l.minTo + 1) });
    if (l.canRaise) choices.push({ seat, type: 'raise', amount: l.minTo + rand(l.maxTo - l.minTo + 1) });
    return choices[rand(choices.length)];
  }

  it('conserves chips and never goes negative over many random hands', () => {
    const rand = rng(12345);
    let s = tableWith({ 0: 300, 1: 150, 2: 500, 3: 80, 4: 1000, 5: 220 });
    let expectedTotal = chipTotal(s);
    let handsPlayed = 0;
    for (let h = 0; h < 300; h++) {
      for (const seat of s.seats.keys()) {
        if (s.seats[seat] && s.seats[seat]!.stack === 0) {
          s = addChips(s, seat, 100);
          expectedTotal += 100;
        }
      }
      if (!canStartHand(s)) break;
      const deck = [...FULL_DECK];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = rand(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      s = startHand(s, deck).state;
      handsPlayed++;
      let guard = 0;
      while (!s.hand!.finished) {
        if (++guard > 500) throw new Error('hand did not terminate');
        const seat = s.hand!.toAct!;
        const r = applyAction(s, randomAction(s, seat, rand));
        s = r.state;
        expect(chipTotal(s)).toBe(expectedTotal);
        expect(s.seats.every((x) => x === null || x.stack >= 0)).toBe(true);
      }
      const result = s.hand!.result!;
      const paid = Object.values(result.payouts).reduce((t, v) => t + v, 0);
      const committed = Object.values(s.hand!.players).reduce((t, p) => t + p.committedTotal, 0);
      expect(paid).toBe(committed);
      expect(chipTotal(s)).toBe(expectedTotal);
    }
    expect(handsPlayed).toBeGreaterThan(50);
  });
});
