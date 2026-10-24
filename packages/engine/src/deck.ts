import type { Card } from './types';

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';

export const FULL_DECK: Card[] = [];
for (const r of RANKS) for (const s of SUITS) FULL_DECK.push(`${r}${s}` as Card);

/** Fisher-Yates over a fresh 52-card deck. randomInt(n) must return an integer in [0, n). */
export function shuffledDeck(randomInt: (n: number) => number): Card[] {
  const deck = [...FULL_DECK];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
