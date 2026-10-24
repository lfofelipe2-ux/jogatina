// pokersolver is CommonJS: Node's ESM loader only exposes its default export.
import pokersolver from 'pokersolver';
import type { Card, HandCategory, PotDecision } from './types';

const { Hand } = pokersolver;

/** Indexed by pokersolver's rank minus one (a royal flush is a straight flush). */
const CATEGORIES: HandCategory[] = [
  'high-card',
  'pair',
  'two-pair',
  'trips',
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
];

export interface Evaluated { seat: number; handName: string }

export interface MadeHand {
  category: HandCategory;
  /** The five cards that make the hand, in the order poker compares them (made part first, then kickers). */
  best: Card[];
}

/** pokersolver writes the wheel ace as '1'. */
const toCard = (c: { value: string; suit: string }): Card => `${c.value === '1' ? 'A' : c.value}${c.suit}` as Card;

/** Best 5 of hole + board per seat; returns the winning seats (ties = several), every seat's hand, and how the pot was decided. */
export function findWinners(entries: { seat: number; cards: Card[] }[]): {
  winners: number[];
  names: Record<number, string>;
  made: Record<number, MadeHand>;
  decision: PotDecision;
} {
  const solved = entries.map((e) => ({ seat: e.seat, hand: Hand.solve(e.cards) }));
  const best = new Set(Hand.winners(solved.map((s) => s.hand)));
  const names: Record<number, string> = {};
  const made: Record<number, MadeHand> = {};
  for (const s of solved) {
    names[s.seat] = s.hand.descr;
    made[s.seat] = { category: CATEGORIES[s.hand.rank - 1], best: s.hand.cards.map(toCard) };
  }

  const winner = solved.find((s) => best.has(s.hand))!;
  const losers = solved.filter((s) => !best.has(s.hand));
  const decision: PotDecision = {};
  if (losers.length > 0) {
    const top = new Set(Hand.winners(losers.map((s) => s.hand)));
    const runnerUp = losers.find((s) => top.has(s.hand))!;
    decision.runnerUp = runnerUp.seat;
    if (winner.hand.rank === runnerUp.hand.rank) {
      const i = winner.hand.cards.findIndex((c, k) => c.rank !== runnerUp.hand.cards[k].rank);
      if (i >= 0) decision.cardIndex = i;
    }
  }
  return { winners: solved.filter((s) => best.has(s.hand)).map((s) => s.seat), names, made, decision };
}
