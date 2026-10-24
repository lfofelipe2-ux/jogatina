import { describe, it, expect } from 'vitest';
import { FULL_DECK, shuffledDeck } from './deck';

describe('deck', () => {
  it('FULL_DECK has 52 unique cards in rank-then-suit notation', () => {
    expect(FULL_DECK).toHaveLength(52);
    expect(new Set(FULL_DECK).size).toBe(52);
    expect(FULL_DECK[0]).toBe('2s');
    expect(FULL_DECK[51]).toBe('Ac');
    expect(FULL_DECK).toContain('Td');
  });

  it('shuffledDeck returns a permutation of FULL_DECK without mutating it', () => {
    let x = 7;
    const deck = shuffledDeck((n) => {
      x = (x * 31 + 11) % 1000003;
      return x % n;
    });
    expect([...deck].sort()).toEqual([...FULL_DECK].sort());
    expect(deck).not.toEqual(FULL_DECK);
    expect(FULL_DECK[0]).toBe('2s');
    expect(FULL_DECK).toHaveLength(52);
  });

  it('shuffledDeck with an identity random source keeps the order', () => {
    expect(shuffledDeck((n) => n - 1)).toEqual(FULL_DECK);
  });
});
