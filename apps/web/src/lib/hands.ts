import type { Card, HandCategory, HandResult, PotResult } from '@poker/engine';

type Rank = Card[0];

const ONE: Record<Rank, string> = {
  A: 'Ás', K: 'Rei', Q: 'Dama', J: 'Valete', T: '10', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2',
};
const MANY: Record<Rank, string> = {
  A: 'Ases', K: 'Reis', Q: 'Damas', J: 'Valetes', T: '10', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2',
};

export const rankLabel = (c: Card) => (c[0] === 'T' ? '10' : c[0]);

/** How many of the five best cards the hand's name covers; a later deciding card is called a kicker. */
export const MADE_COUNT: Record<HandCategory, number> = {
  'high-card': 1,
  pair: 2,
  'two-pair': 4,
  trips: 3,
  straight: 5,
  flush: 1,
  'full-house': 5,
  quads: 4,
  'straight-flush': 5,
};

/** Flush or better. */
export const RARE: HandCategory[] = ['flush', 'full-house', 'quads', 'straight-flush'];

export function handLabel(category: HandCategory, best: Card[]): string {
  const r = (i: number) => best[i][0] as Rank;
  switch (category) {
    case 'high-card':
      return `Carta alta ${ONE[r(0)]}`;
    case 'pair':
      return `Par de ${MANY[r(0)]}`;
    case 'two-pair':
      return `Dois pares, ${MANY[r(0)]} e ${MANY[r(2)]}`;
    case 'trips':
      return `Trinca de ${MANY[r(0)]}`;
    case 'straight':
      return `Sequência até ${ONE[r(0)]}`;
    case 'flush':
      return `Flush, ${ONE[r(0)]} alto`;
    case 'full-house':
      return `Full house, ${MANY[r(0)]} com ${MANY[r(3)]}`;
    case 'quads':
      return `Quadra de ${MANY[r(0)]}`;
    case 'straight-flush':
      return r(0) === 'A' ? 'Royal flush' : `Straight flush até ${ONE[r(0)]}`;
  }
}

type Showdown = HandResult['showdown'][number];

/** pt-BR hand name, with the deciding kicker when one is given. Falls back to pokersolver's text. */
export function describe(sd: Showdown, kickerIndex?: number): string {
  if (!sd.category || !sd.best) return sd.handName;
  const base = handLabel(sd.category, sd.best);
  if (kickerIndex === undefined || kickerIndex < MADE_COUNT[sd.category]) return base;
  return `${base}, kicker ${rankLabel(sd.best[kickerIndex])}`;
}

/** "Par de Valetes, kicker K, venceu Par de Valetes, kicker Q", or "Divisão do pote" on a full tie. */
export function potReason(pot: PotResult, showdown: HandResult['showdown']): string | null {
  const d = pot.decision;
  if (!d) return null;
  const split = pot.winners.length > 1;
  if (d.runnerUp === undefined) return 'Divisão do pote';
  const win = showdown[pot.winners[0]];
  const lose = showdown[d.runnerUp];
  if (!win || !lose) return null;
  const text = `${describe(win, d.cardIndex)} ${split ? 'venceram' : 'venceu'} ${describe(lose, d.cardIndex)}`;
  return split ? `Divisão do pote: ${text}` : text;
}
