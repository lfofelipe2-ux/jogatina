import type { HandState, Pot } from './types';

const sameSeats = (a: number[], b: number[]) => a.length === b.length && a.every((s, i) => s === b[i]);

/** Main pot and side pots from committedTotal; folded players' chips count but they are not eligible. */
export function computePots(hand: HandState): Pot[] {
  const all = Object.values(hand.players).sort((a, b) => a.seat - b.seat);
  const live = all.filter((p) => !p.folded);
  const levels = [...new Set(live.map((p) => p.committedTotal))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of all) amount += Math.min(Math.max(p.committedTotal - prev, 0), level - prev);
    pots.push({ amount, eligibleSeats: live.filter((p) => p.committedTotal >= level).map((p) => p.seat) });
    prev = level;
  }
  const top = levels[levels.length - 1] ?? 0;
  const overflow = all.reduce((sum, p) => sum + Math.max(p.committedTotal - top, 0), 0);
  if (overflow > 0 && pots.length > 0) pots[pots.length - 1].amount += overflow;

  const merged: Pot[] = [];
  for (const pot of pots) {
    if (pot.amount <= 0) continue;
    const last = merged[merged.length - 1];
    if (last && sameSeats(last.eligibleSeats, pot.eligibleSeats)) last.amount += pot.amount;
    else merged.push(pot);
  }
  return merged;
}
