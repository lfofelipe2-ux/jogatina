import { describe, expect, it } from 'vitest';
import { ensurePlayer, recordHand, recordTopUp, sortedRows } from './scoreboard';
import type { HandPlayer, HandResult, HandState, Scoreboard, Seat, TableState } from './types';

function seat(name: string, stack: number): Seat {
  return { playerId: `id-${name}`, name, stack, sittingOut: false };
}

function hp(seatIndex: number): HandPlayer {
  return {
    seat: seatIndex,
    playerId: `id-seat-${seatIndex}`,
    holeCards: ['As', 'Kd'],
    committedThisStreet: 0,
    committedTotal: 0,
    folded: false,
    allIn: false,
    actedThisStreet: true,
  };
}

function tableWith(seats: (Seat | null)[], dealt: number[]): TableState {
  const players: Record<number, HandPlayer> = {};
  for (const s of dealt) players[s] = hp(s);
  const hand: HandState = {
    handNumber: 1,
    buttonSeat: 0,
    sbSeat: 0,
    bbSeat: 1,
    deck: [],
    board: [],
    street: 'showdown',
    players,
    toAct: null,
    currentBet: 0,
    minRaise: 2,
    finished: true,
    result: null,
  };
  return {
    config: { maxSeats: seats.length, smallBlind: 1, bigBlind: 2 },
    seats,
    buttonSeat: 0,
    handNumber: 1,
    hand,
  };
}

function result(pots: HandResult['pots'], payouts: Record<number, number>): HandResult {
  return { pots, payouts, showdown: {}, names: {} };
}

describe('ensurePlayer', () => {
  it('adds a fresh row when the name is absent', () => {
    const sb = ensurePlayer({}, 'Ana', 100);
    expect(sb.Ana).toEqual({ name: 'Ana', stack: 100, invested: 100, net: 0, handsPlayed: 0, handsWon: 0, biggestPot: 0 });
  });

  it('returns the same object when the player exists', () => {
    const sb = ensurePlayer({}, 'Ana', 100);
    expect(ensurePlayer(sb, 'Ana', 500)).toBe(sb);
  });

  it('does not mutate the input', () => {
    const sb: Scoreboard = {};
    ensurePlayer(sb, 'Ana', 100);
    expect(sb).toEqual({});
  });

  it('treats prototype names as absent', () => {
    const sb = ensurePlayer({}, 'constructor', 50);
    expect(sb.constructor).toMatchObject({ name: 'constructor', stack: 50 });
  });
});

describe('recordTopUp', () => {
  it('raises invested and stack, and keeps net as stack minus invested', () => {
    const sb = recordTopUp(ensurePlayer({}, 'Ana', 100), 'Ana', 50);
    expect(sb.Ana).toMatchObject({ stack: 150, invested: 150, net: 0 });
  });

  it('throws for an unknown player', () => {
    expect(() => recordTopUp({}, 'Ghost', 10)).toThrow();
  });

  it('does not mutate the input', () => {
    const before = ensurePlayer({}, 'Ana', 100);
    recordTopUp(before, 'Ana', 50);
    expect(before.Ana.stack).toBe(100);
  });
});

describe('recordHand', () => {
  it('updates hands played, won, biggest pot and stacks', () => {
    let sb = ensurePlayer({}, 'Ana', 100);
    sb = ensurePlayer(sb, 'Bo', 100);
    const state = tableWith([seat('Ana', 130), seat('Bo', 70)], [0, 1]);
    const res = result([{ amount: 200, winners: [0], handName: 'Pair' }], { 0: 200 });

    const next = recordHand(sb, state, res);
    expect(next.Ana).toMatchObject({ stack: 130, invested: 100, net: 30, handsPlayed: 1, handsWon: 1, biggestPot: 200 });
    expect(next.Bo).toMatchObject({ stack: 70, invested: 100, net: -30, handsPlayed: 1, handsWon: 0, biggestPot: 0 });
  });

  it('counts a win once even when the seat wins several pots', () => {
    let sb = ensurePlayer({}, 'Ana', 100);
    sb = ensurePlayer(sb, 'Bo', 100);
    const state = tableWith([seat('Ana', 150), seat('Bo', 50)], [0, 1]);
    const res = result(
      [
        { amount: 100, winners: [0] },
        { amount: 100, winners: [0, 1] },
      ],
      { 0: 150, 1: 50 },
    );
    const next = recordHand(sb, state, res);
    expect(next.Ana.handsWon).toBe(1);
    expect(next.Ana.biggestPot).toBe(150);
  });

  it('counts a split pot as a win for every winner', () => {
    let sb = ensurePlayer({}, 'Ana', 100);
    sb = ensurePlayer(sb, 'Bo', 100);
    const state = tableWith([seat('Ana', 100), seat('Bo', 100)], [0, 1]);
    const res = result([{ amount: 200, winners: [0, 1] }], { 0: 100, 1: 100 });
    const next = recordHand(sb, state, res);
    expect(next.Ana.handsWon).toBe(1);
    expect(next.Bo.handsWon).toBe(1);
  });

  it('does not count hands for seats not dealt in, but refreshes their stack', () => {
    let sb = ensurePlayer({}, 'Ana', 100);
    sb = ensurePlayer(sb, 'Cy', 100);
    const state = tableWith([seat('Ana', 100), null, seat('Cy', 90)], [0]);
    const res = result([{ amount: 0, winners: [] }], {});
    const next = recordHand(sb, state, res);
    expect(next.Cy).toMatchObject({ handsPlayed: 0, stack: 90, net: -10 });
  });

  it('skips a dealt seat that is now empty or has no row', () => {
    let sb = ensurePlayer({}, 'Ana', 100);
    const state = tableWith([seat('Ana', 100), null, seat('Stranger', 40)], [0, 1, 2]);
    const res = result([{ amount: 0, winners: [] }], {});
    const next = recordHand(sb, state, res);
    expect(next.Ana.handsPlayed).toBe(1);
    expect(next.Stranger).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const sb = ensurePlayer({}, 'Ana', 100);
    const state = tableWith([seat('Ana', 120)], [0]);
    recordHand(sb, state, result([{ amount: 0, winners: [] }], {}));
    expect(sb.Ana.stack).toBe(100);
    expect(sb.Ana.handsPlayed).toBe(0);
  });

  it('tracks net across a top-up and a bust', () => {
    let sb = ensurePlayer({}, 'Ana', 100);
    sb = recordTopUp(sb, 'Ana', 100);
    sb = ensurePlayer(sb, 'Bo', 50);
    const state = tableWith([seat('Ana', 150), seat('Bo', 0)], [0, 1]);
    sb = recordHand(sb, state, result([{ amount: 150, winners: [0] }], { 0: 150 }));
    expect(sb.Ana).toMatchObject({ invested: 200, stack: 150, net: -50, handsPlayed: 1, handsWon: 1 });
    expect(sb.Bo).toMatchObject({ invested: 50, stack: 0, net: -50, handsPlayed: 1, handsWon: 0 });
  });
});

describe('sortedRows', () => {
  it('sorts by net descending, then name ascending', () => {
    const sb: Scoreboard = {
      Zed: { name: 'Zed', stack: 120, invested: 100, net: 20, handsPlayed: 0, handsWon: 0, biggestPot: 0 },
      Bea: { name: 'Bea', stack: 80, invested: 100, net: -20, handsPlayed: 0, handsWon: 0, biggestPot: 0 },
      Ann: { name: 'Ann', stack: 120, invested: 100, net: 20, handsPlayed: 0, handsWon: 0, biggestPot: 0 },
      Cal: { name: 'Cal', stack: 100, invested: 100, net: 0, handsPlayed: 0, handsWon: 0, biggestPot: 0 },
    };
    expect(sortedRows(sb).map((r) => r.name)).toEqual(['Ann', 'Zed', 'Cal', 'Bea']);
  });

  it('returns an empty list for an empty scoreboard', () => {
    expect(sortedRows({})).toEqual([]);
  });
});
