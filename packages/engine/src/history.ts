import type { HandHistoryEntry } from './protocol';
import type { Card, HandResult, TableState } from './types';

/** Finished hands kept per table. */
export const HAND_HISTORY_MAX = 20;

/**
 * Public record of a finished hand. Built only from what the table saw at showdown:
 * hole cards come from `result.showdown`, which never contains a folded seat,
 * so the entry is the same for every viewer and leaks nothing.
 */
export function handHistoryEntry(state: TableState, result: HandResult, at: number): HandHistoryEntry {
  const hand = state.hand;
  if (!hand) throw new Error('No hand to record');
  const name = (seat: number) => result.names[seat] ?? 'Jogador';
  const players = Object.values(hand.players)
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const sd = p.folded ? undefined : result.showdown[p.seat];
      return {
        seat: p.seat,
        name: name(p.seat),
        folded: p.folded,
        net: (result.payouts[p.seat] ?? 0) - p.committedTotal,
        cards: sd ? ([sd.cards[0], sd.cards[1]] as [Card, Card]) : null,
        handName: sd?.handName ?? null,
        category: sd?.category ?? null,
        best: sd?.best ? [...sd.best] : null,
      };
    });
  return {
    handNumber: hand.handNumber,
    at,
    board: [...hand.board],
    pots: result.pots.map((p) => ({ amount: p.amount, winners: p.winners.map(name) })),
    players,
  };
}
