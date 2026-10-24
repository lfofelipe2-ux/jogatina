import { describe, expect, it } from 'vitest';
import { shuffledDeck } from './deck';
import { computePots } from './pots';
import { activeSeats, applyAction, canStartHand, createTable, legalActions, sitDown, standUp, startHand } from './table';
import type { HandState, LegalActions, PlayerAction, TableState } from './types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_ACTIONS_PER_HAND = 500;
const TOTAL_HANDS = 2000;

function stackTotal(state: TableState): number {
  return state.seats.reduce((sum, s) => sum + (s ? s.stack : 0), 0);
}

function committedTotal(hand: HandState): number {
  return Object.values(hand.players).reduce((sum, p) => sum + p.committedTotal, 0);
}

function checkInvariants(state: TableState, initialTotal: number): void {
  for (const s of state.seats) {
    if (s) expect(s.stack, `negative stack for ${s.name}`).toBeGreaterThanOrEqual(0);
  }
  const hand = state.hand;
  if (!hand) {
    expect(stackTotal(state)).toBe(initialTotal);
    return;
  }
  expect(hand.toAct === null, 'toAct must be null exactly when the hand is finished').toBe(hand.finished);
  if (hand.finished) return;
  const committed = committedTotal(hand);
  expect(stackTotal(state) + committed, 'chips in play changed').toBe(initialTotal);
  const potSum = computePots(hand).reduce((sum, p) => sum + p.amount, 0);
  expect(potSum, 'pots do not sum to committed chips').toBe(committed);
}

function chooseAction(rng: () => number, seat: number, legal: LegalActions): PlayerAction {
  const r = rng();
  const canRaiseTo = (legal.canBet || legal.canRaise) && legal.maxTo >= legal.minTo;
  if (canRaiseTo && r < 0.4) {
    const type = legal.canBet ? 'bet' : 'raise';
    const amount =
      rng() < 0.15 ? legal.maxTo : legal.minTo + Math.floor(rng() * (legal.maxTo - legal.minTo + 1));
    return { seat, type, amount };
  }
  if (legal.canCheck) return { seat, type: 'check' };
  if (r < 0.85 || !legal.canFold) return { seat, type: 'call' };
  return { seat, type: 'fold' };
}

describe('engine randomized simulation', () => {
  it('conserves chips and finishes every hand across 2000 random hands', { timeout: 60_000 }, () => {
    const rng = mulberry32(20260424);
    const randInt = (n: number) => Math.floor(rng() * n);
    let handsPlayed = 0;
    let tables = 0;

    while (handsPlayed < TOTAL_HANDS) {
      tables++;
      expect(tables, 'too many tables; simulation is not progressing').toBeLessThan(TOTAL_HANDS * 2);

      const players = 2 + randInt(8);
      const maxSeats = players + randInt(10 - players);
      const bigBlind = [2, 4, 10][randInt(3)];
      let state = createTable({ maxSeats, smallBlind: bigBlind / 2, bigBlind });

      const seatOrder = Array.from({ length: maxSeats }, (_, i) => i);
      for (let i = seatOrder.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [seatOrder[i], seatOrder[j]] = [seatOrder[j], seatOrder[i]];
      }
      for (let i = 0; i < players; i++) {
        const stack = bigBlind * (1 + randInt(80));
        state = sitDown(state, seatOrder[i], { playerId: `p${tables}-${i}`, name: `P${tables}-${i}`, stack });
      }
      const initialTotal = stackTotal(state);
      const budget = Math.min(TOTAL_HANDS - handsPlayed, 5 + randInt(40));
      let handsHere = 0;

      while (handsHere < budget && activeSeats(state).length >= 2 && canStartHand(state)) {
        const deck = shuffledDeck(randInt);
        expect(new Set(deck).size, 'deck is not 52 unique cards').toBe(52);

        state = startHand(state, deck).state;
        expect(state.hand, 'startHand did not create a hand').not.toBeNull();
        checkInvariants(state, initialTotal);

        let actions = 0;
        while (state.hand && !state.hand.finished) {
          actions++;
          expect(actions, 'hand exceeded the action limit').toBeLessThanOrEqual(MAX_ACTIONS_PER_HAND);
          const seat = state.hand.toAct;
          expect(seat, 'no seat to act in a live hand').not.toBeNull();
          const legal = legalActions(state, seat as number);
          expect(legal, `no legal actions for seat ${seat}`).not.toBeNull();
          const action = chooseAction(rng, seat as number, legal as LegalActions);
          state = applyAction(state, action).state;
          checkInvariants(state, initialTotal);
        }

        expect(state.hand?.result, 'finished hand has no result').not.toBeNull();
        expect(stackTotal(state), 'chips lost or created at hand end').toBe(initialTotal);

        for (let i = 0; i < state.seats.length; i++) {
          if (state.seats[i]?.stack === 0) state = standUp(state, i);
        }
        handsHere++;
        handsPlayed++;
      }
    }

    expect(handsPlayed).toBe(TOTAL_HANDS);
  });
});
