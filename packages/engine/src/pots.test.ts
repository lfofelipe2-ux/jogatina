import { describe, it, expect } from 'vitest';
import { computePots } from './pots';
import type { HandPlayer, HandState } from './types';

function hand(players: { seat: number; committed: number; folded?: boolean }[]): HandState {
  const map: Record<number, HandPlayer> = {};
  for (const p of players) {
    map[p.seat] = {
      seat: p.seat,
      playerId: `id-${p.seat}`,
      holeCards: ['As', 'Ad'],
      committedThisStreet: p.committed,
      committedTotal: p.committed,
      folded: p.folded ?? false,
      allIn: false,
      actedThisStreet: false,
    };
  }
  return { players: map } as unknown as HandState;
}

describe('computePots', () => {
  it('one pot when nobody is all-in', () => {
    expect(computePots(hand([{ seat: 0, committed: 10 }, { seat: 1, committed: 10 }, { seat: 2, committed: 10 }])))
      .toEqual([{ amount: 30, eligibleSeats: [0, 1, 2] }]);
  });

  it('folded chips stay in the pot but folded players are not eligible', () => {
    expect(computePots(hand([{ seat: 0, committed: 10, folded: true }, { seat: 1, committed: 30 }, { seat: 2, committed: 30 }])))
      .toEqual([{ amount: 70, eligibleSeats: [1, 2] }]);
  });

  it('main pot and two side pots for three stacks of 100, 300 and 500', () => {
    expect(computePots(hand([{ seat: 0, committed: 100 }, { seat: 1, committed: 300 }, { seat: 2, committed: 500 }])))
      .toEqual([
        { amount: 300, eligibleSeats: [0, 1, 2] },
        { amount: 400, eligibleSeats: [1, 2] },
        { amount: 200, eligibleSeats: [2] },
      ]);
  });

  it('chips a folded player committed above every live level go to the last pot', () => {
    expect(computePots(hand([{ seat: 0, committed: 50 }, { seat: 1, committed: 200, folded: true }])))
      .toEqual([{ amount: 250, eligibleSeats: [0] }]);
  });

  it('a short all-in creates a pot that only the deeper stacks contest', () => {
    expect(computePots(hand([{ seat: 0, committed: 50 }, { seat: 1, committed: 100 }, { seat: 2, committed: 100, folded: true }])))
      .toEqual([
        { amount: 150, eligibleSeats: [0, 1] },
        { amount: 100, eligibleSeats: [1] },
      ]);
  });
});
