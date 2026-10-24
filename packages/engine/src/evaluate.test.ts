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
