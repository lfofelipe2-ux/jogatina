import { describe, expect, it } from 'vitest';
import type { ClientTableState, SeatView } from '@poker/engine';
import { soundsFor } from './tableSounds';
import { isMuted, setMuted } from './sound';

const seat = (i: number, o: Partial<SeatView> = {}): SeatView => ({
  seat: i,
  playerId: `p${i}`,
  name: `P${i}`,
  stack: 1000,
  sittingOut: false,
  inHand: true,
  folded: false,
  allIn: false,
  committedThisStreet: 0,
  holeCards: null,
  hasCards: true,
  ...o,
});

function st(o: {
  handNumber?: number;
  street?: 'preflop' | 'flop';
  toAct?: number | null;
  currentBet?: number;
  board?: string[];
  seats?: SeatView[];
  legal?: boolean;
  finished?: boolean;
  payouts?: Record<number, number>;
}): ClientTableState {
  return {
    you: { playerId: 'p0', name: 'P0', seat: 0, isHost: false },
    legal: o.legal ? ({ seat: 0 } as never) : null,
    table: {
      seats: o.seats ?? [seat(0), seat(1)],
      hand: {
        handNumber: o.handNumber ?? 1,
        street: o.street ?? 'preflop',
        toAct: o.toAct ?? 1,
        currentBet: o.currentBet ?? 10,
        board: o.board ?? [],
        finished: o.finished ?? false,
        result: o.finished ? { payouts: o.payouts ?? {}, pots: [], showdown: {}, names: {} } : null,
      },
    },
  } as unknown as ClientTableState;
}

describe('soundsFor', () => {
  it('deals a new hand, and plays the turn sound when it is the viewer to act', () => {
    expect(soundsFor(st({ handNumber: 1, finished: true }), st({ handNumber: 2, legal: true }))).toEqual(['deal', 'turn']);
  });

  it('tells fold, call, raise and all-in apart', () => {
    const before = st({ toAct: 1 });
    expect(soundsFor(before, st({ toAct: 0, seats: [seat(0), seat(1, { folded: true })] }))).toContain('fold');
    expect(soundsFor(before, st({ toAct: 0, seats: [seat(0), seat(1, { committedThisStreet: 10 })] }))).toEqual(['chips']);
    expect(soundsFor(before, st({ toAct: 0, seats: [seat(0), seat(1, { committedThisStreet: 40 })] }))).toEqual(['raise']);
    expect(soundsFor(before, st({ toAct: 0, seats: [seat(0), seat(1, { allIn: true, committedThisStreet: 1000 })] }))).toEqual([
      'allin',
    ]);
  });

  it('plays a check and a dealt card when the street moves on without chips', () => {
    const before = st({ toAct: 1 });
    expect(soundsFor(before, st({ toAct: 0, street: 'flop', board: ['2c', '3d', '4h'] }))).toEqual(['check', 'deal']);
  });

  it('plays the win sound only for the viewer who won', () => {
    expect(soundsFor(st({}), st({ finished: true, toAct: null, payouts: { 0: 20 } }))).toContain('win');
    expect(soundsFor(st({}), st({ finished: true, toAct: null, payouts: { 1: 20 } }))).not.toContain('win');
  });
});

describe('mute', () => {
  it('defaults to unmuted and survives storage being unavailable', () => {
    expect(isMuted()).toBe(false);
    expect(() => setMuted(true)).not.toThrow();
    expect(isMuted()).toBe(true);
    setMuted(false);
  });
});
