import { describe, it, expect } from 'vitest';
import { findWinners } from './evaluate';
import type { Card } from './types';

describe('findWinners', () => {
  it('picks the best five-card hand from seven cards', () => {
    const r = findWinners([
      { seat: 0, cards: ['As', 'Ad', '2c', '5d', '8h', '9s', 'Jc'] },
      { seat: 1, cards: ['Ks', 'Kd', '2c', '5d', '8h', '9s', 'Jc'] },
    ]);
    expect(r.winners).toEqual([0]);
    expect(r.names[0]).toBe("Pair, A's");
    expect(r.names[1]).toBe("Pair, K's");
  });

  it('returns every tied seat', () => {
    const board: Card[] = ['Ks', 'Kd', '9c', '4s', '7d'];
    const r = findWinners([
      { seat: 0, cards: ['As', 'Ad', ...board] },
      { seat: 1, cards: ['Ah', 'Ac', ...board] },
      { seat: 2, cards: ['2h', '3h', ...board] },
    ]);
    expect(r.winners).toEqual([0, 1]);
    expect(Object.keys(r.names).map(Number).sort()).toEqual([0, 1, 2]);
  });

  it('ranks a flush above a straight', () => {
    const r = findWinners([
      { seat: 3, cards: ['2h', '9h', 'Kh', 'Th', 'Ah', '5c', '6s'] },
      { seat: 5, cards: ['7c', '8d', '4d', '5c', '6s', 'Jh', 'Qd'] },
    ]);
    expect(r.winners).toEqual([3]);
  });
});

describe('findWinners decision', () => {
  const board: Card[] = ['Jc', '8d', '5s', '3h', '2c'];

  it('reports the kicker that broke a tie between equal pairs', () => {
    const r = findWinners([
      { seat: 0, cards: ['Jh', 'Kd', ...board] },
      { seat: 1, cards: ['Js', 'Qd', ...board] },
    ]);
    expect(r.winners).toEqual([0]);
    expect(r.made[0]).toEqual({ category: 'pair', best: ['Jh', 'Jc', 'Kd', '8d', '5s'] });
    expect(r.made[1].best).toEqual(['Js', 'Jc', 'Qd', '8d', '5s']);
    expect(r.decision).toEqual({ runnerUp: 1, cardIndex: 2 });
  });

  it('omits cardIndex when the category decided', () => {
    const r = findWinners([
      { seat: 4, cards: ['8h', '8s', ...board] },
      { seat: 6, cards: ['Ah', 'Jd', ...board] },
    ]);
    expect(r.winners).toEqual([4]);
    expect(r.made[4].category).toBe('trips');
    expect(r.decision).toEqual({ runnerUp: 6 });
  });

  it('reports the higher pair rank inside the made hand', () => {
    const r = findWinners([
      { seat: 0, cards: ['Kh', 'Ks', ...board] },
      { seat: 1, cards: ['Qh', 'Qs', ...board] },
    ]);
    expect(r.decision).toEqual({ runnerUp: 1, cardIndex: 0 });
  });

  it('has no runner-up when every contender ties', () => {
    const r = findWinners([
      { seat: 0, cards: ['Ah', '4d', ...board] },
      { seat: 1, cards: ['As', '4c', ...board] },
    ]);
    expect(r.winners).toEqual([0, 1]);
    expect(r.made[0].category).toBe('straight');
    expect(r.decision).toEqual({});
  });

  it('picks the best losing hand as runner-up and writes the wheel ace as A', () => {
    const r = findWinners([
      { seat: 0, cards: ['9h', '9s', ...board] },
      { seat: 1, cards: ['Ad', '4s', ...board] },
      { seat: 2, cards: ['Kh', 'Qh', ...board] },
    ]);
    expect(r.winners).toEqual([1]);
    expect(r.made[1].best).toEqual(['5s', '4s', '3h', '2c', 'Ad']);
    expect(r.decision).toEqual({ runnerUp: 0 });
  });

  it('classifies flush and above', () => {
    const r = findWinners([
      { seat: 0, cards: ['Ac', 'Kc', 'Qc', 'Jc', 'Tc', '2d', '3h'] },
      { seat: 1, cards: ['9c', '4c', 'Qc', 'Jc', 'Tc', '2d', '3h'] },
    ]);
    expect(r.made[0].category).toBe('straight-flush');
    expect(r.made[1].category).toBe('flush');
    expect(r.decision).toEqual({ runnerUp: 1 });
  });
});
