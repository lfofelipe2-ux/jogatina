import { describe, it, expect } from 'vitest';
import { FULL_DECK } from './deck';
import { createTable, sitDown, standUp, startHand, applyAction } from './table';
import { viewFor } from './view';
import type { Card, TableState } from './types';

const BOARD: Card[] = ['2c', '5d', '8h', '9s', 'Jc'];

function rig(dealOrder: number[], holes: Record<number, [Card, Card]>, board: Card[]): Card[] {
  const head: Card[] = [];
  for (let r = 0; r < 2; r++) for (const seat of dealOrder) head.push(holes[seat][r]);
  const spare = FULL_DECK.filter((c) => ![...head, ...board].includes(c));
  return [...head, spare[0], ...board.slice(0, 3), spare[1], board[3], spare[2], board[4], ...spare.slice(3)];
}

function threeHanded(): TableState {
  let s = createTable({ maxSeats: 3, smallBlind: 5, bigBlind: 10 });
  s = sitDown(s, 0, { playerId: 'alice', name: 'Alice', stack: 1000 });
  s = sitDown(s, 1, { playerId: 'bob', name: 'Bob', stack: 1000 });
  s = sitDown(s, 2, { playerId: 'carol', name: 'Carol', stack: 1000 });
  return s;
}

describe('viewFor', () => {
  it('shows only the viewer their own hole cards during the hand', () => {
    const deck = rig([1, 2, 0], { 0: ['As', 'Ad'], 1: ['Ks', 'Kd'], 2: ['Qs', 'Qd'] }, BOARD);
    let s = startHand(threeHanded(), deck).state;
    s = applyAction(s, { seat: 0, type: 'call' }).state;

    const alice = viewFor(s, 'alice');
    expect(alice.seats[0]!.holeCards).toEqual(['As', 'Ad']);
    expect(alice.seats[1]!.holeCards).toBeNull();
    expect(alice.seats[2]!.holeCards).toBeNull();
    expect(alice.seats[1]!.hasCards).toBe(true);

    const bob = viewFor(s, 'bob');
    expect(bob.seats[0]!.holeCards).toBeNull();
    expect(bob.seats[1]!.holeCards).toEqual(['Ks', 'Kd']);

    const spectator = viewFor(s, null);
    expect(spectator.seats.every((seat) => seat === null || seat.holeCards === null)).toBe(true);
    expect(JSON.stringify(spectator)).not.toMatch(/"deck"/);
    expect(spectator.hand!.toAct).toBe(1);
    expect(spectator.hand!.currentBet).toBe(10);
  });

  it('marks folded seats and reveals showdown cards to everyone', () => {
    const deck = rig([1, 2, 0], { 0: ['As', 'Ad'], 1: ['Ks', 'Kd'], 2: ['Qs', 'Qd'] }, BOARD);
    let s = startHand(threeHanded(), deck).state;
    s = applyAction(s, { seat: 0, type: 'fold' }).state;
    s = applyAction(s, { seat: 1, type: 'call' }).state;
    s = applyAction(s, { seat: 2, type: 'check' }).state;
    for (let i = 0; i < 4; i++) {
      for (const seat of [1, 2]) {
        if (s.hand!.finished) break;
        s = applyAction(s, { seat, type: 'check' }).state;
      }
    }
    expect(s.hand!.finished).toBe(true);

    const carol = viewFor(s, 'carol');
    expect(carol.seats[0]!.folded).toBe(true);
    expect(carol.seats[0]!.hasCards).toBe(false);
    expect(carol.seats[0]!.holeCards).toBeNull();
    expect(carol.seats[1]!.holeCards).toEqual(['Ks', 'Kd']);
    expect(carol.seats[2]!.holeCards).toEqual(['Qs', 'Qd']);
    expect(carol.hand!.finished).toBe(true);
    expect(carol.hand!.pots).toEqual(s.hand!.result!.pots.map((p) => ({ amount: p.amount, eligibleSeats: p.winners })));
    expect(carol.hand!.result).toEqual(s.hand!.result);
    expect(carol.hand!).not.toHaveProperty('deck');
  });

  it('does not show a previous player\'s folded hole cards to whoever takes the vacated seat', () => {
    const deck = rig([1, 2, 0], { 0: ['As', 'Ad'], 1: ['Ks', 'Kd'], 2: ['Qs', 'Qd'] }, BOARD);
    let s = startHand(threeHanded(), deck).state;
    s = applyAction(s, { seat: 0, type: 'fold' }).state;
    s = applyAction(s, { seat: 1, type: 'call' }).state;
    s = applyAction(s, { seat: 2, type: 'check' }).state;
    for (let i = 0; i < 4 && !s.hand!.finished; i++) {
      for (const seat of [1, 2]) {
        if (s.hand!.finished) break;
        s = applyAction(s, { seat, type: 'check' }).state;
      }
    }
    expect(s.hand!.finished).toBe(true);

    s = standUp(s, 0);
    s = sitDown(s, 0, { playerId: 'dave', name: 'Dave', stack: 1000 });

    const dave = viewFor(s, 'dave');
    expect(dave.seats[0]!.playerId).toBe('dave');
    expect(dave.seats[0]!.holeCards).toBeNull();
    expect(JSON.stringify(dave)).not.toMatch(/"As"|"Ad"/);
    expect(viewFor(s, 'carol').seats[0]!.holeCards).toBeNull();
  });
});
