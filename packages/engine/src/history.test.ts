import { describe, expect, it } from 'vitest';
import { FULL_DECK } from './deck';
import { handHistoryEntry } from './history';
import { applyAction, createTable, sitDown, startHand } from './table';
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

const HOLES: Record<number, [Card, Card]> = { 0: ['As', 'Ad'], 1: ['Ks', 'Kd'], 2: ['Qs', 'Qd'] };

describe('handHistoryEntry', () => {
  it('shows showdown cards and hand names, never the cards of a folded player', () => {
    let s = startHand(threeHanded(), rig([1, 2, 0], HOLES, BOARD)).state;
    s = applyAction(s, { seat: 0, type: 'fold' }).state;
    s = applyAction(s, { seat: 1, type: 'call' }).state;
    s = applyAction(s, { seat: 2, type: 'check' }).state;
    while (!s.hand!.finished) s = applyAction(s, { seat: s.hand!.toAct!, type: 'check' }).state;

    const e = handHistoryEntry(s, s.hand!.result!, 123);
    expect(e.at).toBe(123);
    expect(e.board).toEqual(BOARD);
    const [alice, bob, carol] = e.players;
    expect(alice).toMatchObject({ name: 'Alice', folded: true, cards: null, handName: null, best: null });
    expect(bob).toMatchObject({ name: 'Bob', folded: false, cards: ['Ks', 'Kd'], category: 'pair', net: 10 });
    expect(bob.handName).toBeTruthy();
    expect(carol).toMatchObject({ cards: ['Qs', 'Qd'], net: -10 });
    expect(e.pots).toEqual([{ amount: 20, winners: ['Bob'] }]);
    expect(JSON.stringify(e)).not.toMatch(/"As"|"Ad"/);
  });

  it('shows no hole cards at all when the hand ends by folds', () => {
    let s = startHand(threeHanded(), rig([1, 2, 0], HOLES, BOARD)).state;
    s = applyAction(s, { seat: 0, type: 'fold' }).state;
    s = applyAction(s, { seat: 1, type: 'fold' }).state;
    expect(s.hand!.finished).toBe(true);

    const e = handHistoryEntry(s, s.hand!.result!, 1);
    expect(e.players.every((p) => p.cards === null && p.handName === null)).toBe(true);
    expect(e.players.find((p) => p.name === 'Carol')!.net).toBe(5);
    expect(JSON.stringify(e)).not.toMatch(/"(As|Ad|Ks|Kd|Qs|Qd)"/);
  });
});
