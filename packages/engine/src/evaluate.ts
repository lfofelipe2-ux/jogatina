// pokersolver is CommonJS: Node's ESM loader only exposes its default export.
import pokersolver from 'pokersolver';
import type { Card } from './types';

const { Hand } = pokersolver;

export interface Evaluated { seat: number; handName: string }

/** Best 5 of hole + board per seat; returns the winning seats (ties = several) and every seat's hand name. */
export function findWinners(entries: { seat: number; cards: Card[] }[]): { winners: number[]; names: Record<number, string> } {
  const solved = entries.map((e) => ({ seat: e.seat, hand: Hand.solve(e.cards) }));
  const best = new Set(Hand.winners(solved.map((s) => s.hand)));
  const names: Record<number, string> = {};
  for (const s of solved) names[s.seat] = s.hand.descr;
  return { winners: solved.filter((s) => best.has(s.hand)).map((s) => s.seat), names };
}
