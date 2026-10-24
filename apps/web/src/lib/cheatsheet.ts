import type { Card, HandCategory, Rank, Suit } from '@poker/engine';

/** The ten rows of the cheat sheet, weakest first. Royal flush is split out of straight flush. */
export type RankingId = HandCategory | 'royal-flush';

export const RANKINGS: { id: RankingId; name: string; hint: string; example: Card[] }[] = [
  { id: 'high-card', name: 'Carta alta', hint: 'Sem combinação, vale a maior', example: ['As', 'Jd', '8c', '5h', '3s'] },
  { id: 'pair', name: 'Par', hint: 'Duas cartas do mesmo valor', example: ['Ks', 'Kh', '9d', '6c', '2s'] },
  { id: 'two-pair', name: 'Dois pares', hint: 'Dois pares diferentes', example: ['Qs', 'Qd', '7h', '7c', '3d'] },
  { id: 'trips', name: 'Trinca', hint: 'Três cartas do mesmo valor', example: ['8s', '8h', '8d', 'Kc', '4s'] },
  { id: 'straight', name: 'Sequência', hint: 'Cinco valores seguidos', example: ['9c', '8d', '7s', '6h', '5c'] },
  { id: 'flush', name: 'Flush', hint: 'Cinco cartas do mesmo naipe', example: ['Ah', 'Jh', '8h', '6h', '3h'] },
  { id: 'full-house', name: 'Full house', hint: 'Uma trinca e um par', example: ['Ts', 'Th', 'Td', '4c', '4s'] },
  { id: 'quads', name: 'Quadra', hint: 'Quatro cartas do mesmo valor', example: ['9s', '9h', '9d', '9c', 'Kd'] },
  { id: 'straight-flush', name: 'Straight flush', hint: 'Sequência de um naipe só', example: ['8s', '7s', '6s', '5s', '4s'] },
  { id: 'royal-flush', name: 'Royal flush', hint: 'Do 10 ao Ás, um naipe só', example: ['Ah', 'Kh', 'Qh', 'Jh', 'Th'] },
];

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: Suit[] = ['s', 'h', 'd', 'c'];
const value = (c: Card) => 14 - RANKS.indexOf(c[0] as Rank);
const byValue = (a: Card, b: Card) => value(b) - value(a);

/** Cards grouped by rank, largest group first, then higher rank. */
function groups(cards: Card[]): Card[][] {
  const map = new Map<string, Card[]>();
  for (const c of [...cards].sort(byValue)) map.set(c[0], [...(map.get(c[0]) ?? []), c]);
  return [...map.values()].sort((a, b) => b.length - a.length || value(b[0]) - value(a[0]));
}

/** Highest five-in-a-row (ace also plays low), or null. */
function straightIn(cards: Card[]): Card[] | null {
  const byVal = new Map<number, Card>();
  for (const c of [...cards].sort(byValue)) if (!byVal.has(value(c))) byVal.set(value(c), c);
  if (byVal.has(14)) byVal.set(1, byVal.get(14)!);
  for (let top = 14; top >= 5; top--) {
    const run = [0, 1, 2, 3, 4].map((i) => byVal.get(top - i));
    if (run.every(Boolean)) return run as Card[];
  }
  return null;
}

function suited(cards: Card[]): Card[][] {
  return SUITS.map((s) => cards.filter((c) => c[1] === s).sort(byValue)).filter((g) => g.length >= 5);
}

/** The cards that form this ranking within the given cards, strongest choice first, or null. */
export function findRanking(id: RankingId, cards: Card[]): Card[] | null {
  if (cards.length === 0) return null;
  const g = groups(cards);
  switch (id) {
    case 'high-card':
      return [g.flat().sort(byValue)[0]];
    case 'pair':
      return g[0].length >= 2 ? g.find((x) => x.length >= 2)!.slice(0, 2) : null;
    case 'two-pair': {
      const pairs = g.filter((x) => x.length >= 2);
      return pairs.length >= 2 ? [...pairs[0].slice(0, 2), ...pairs[1].slice(0, 2)] : null;
    }
    case 'trips':
      return g[0].length >= 3 ? g[0].slice(0, 3) : null;
    case 'straight':
      return straightIn(cards);
    case 'flush':
      return suited(cards)[0]?.slice(0, 5) ?? null;
    case 'full-house': {
      if (g[0].length < 3) return null;
      const pair = g.slice(1).find((x) => x.length >= 2);
      return pair ? [...g[0].slice(0, 3), ...pair.slice(0, 2)] : null;
    }
    case 'quads':
      return g[0].length >= 4 ? g[0].slice(0, 4) : null;
    case 'straight-flush': {
      const runs = suited(cards).map(straightIn).filter((r): r is Card[] => r !== null);
      return runs.sort((a, b) => value(b[0]) - value(a[0]))[0] ?? null;
    }
    case 'royal-flush': {
      const sf = findRanking('straight-flush', cards);
      return sf && sf[0][0] === 'A' ? sf : null;
    }
  }
}

export interface RankingStatus {
  /** Your cards that already form it (made now). */
  made: Card[] | null;
  /** One more card would form it: how many unseen cards do, and which of your cards it builds on. */
  outs: number;
  draw: Card[] | null;
}

export interface Analysis {
  best: RankingId | null;
  rows: Record<RankingId, RankingStatus>;
}

/**
 * Reads only the viewer's own hole cards and the shared board. "Unseen" is every card code not
 * among them; nothing else is known, so outs are counted against that set.
 */
export function analyze(hole: Card[] | null, board: Card[]): Analysis {
  const known = [...(hole ?? []), ...board];
  const rows = {} as Record<RankingId, RankingStatus>;
  let best: RankingId | null = null;
  const canDraw = !!hole && hole.length === 2 && board.length < 5;
  const unseen = canDraw
    ? RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}` as Card)).filter((c) => !known.includes(c))
    : [];

  for (const { id } of RANKINGS) {
    const made = hole ? findRanking(id, known) : null;
    if (made) best = id;
    rows[id] = { made, outs: 0, draw: null };
  }
  if (!best) return { best, rows };

  // Only rankings above the current best can be drawn to.
  const above = RANKINGS.slice(RANKINGS.findIndex((r) => r.id === best) + 1);
  for (const { id } of above) {
    for (const c of unseen) {
      const formed = findRanking(id, [...known, c]);
      if (!formed?.includes(c)) continue;
      rows[id].outs++;
      rows[id].draw ??= formed.filter((x) => x !== c);
    }
  }
  return { best, rows };
}
