import { computePots } from './pots';
import type { Card, HandView, SeatView, TableState, TableView } from './types';

/** Hides every hole card except the viewer's own, and those revealed at showdown. viewerPlayerId null = spectator. */
export function viewFor(state: TableState, viewerPlayerId: string | null): TableView {
  const hand = state.hand;
  const showdown = hand?.result?.showdown ?? {};

  const seats = state.seats.map((seat, i): SeatView | null => {
    if (!seat) return null;
    const hp = hand?.players[i];
    const revealed = showdown[i];
    const ownCards = viewerPlayerId !== null && hp && hp.playerId === viewerPlayerId ? hp.holeCards : null;
    const cards = ownCards ?? revealed?.cards ?? null;
    return {
      seat: i,
      playerId: seat.playerId,
      name: seat.name,
      stack: seat.stack,
      sittingOut: seat.sittingOut,
      inHand: !!hp && !!hand && !hand.finished,
      folded: hp?.folded ?? false,
      allIn: hp?.allIn ?? false,
      committedThisStreet: hp?.committedThisStreet ?? 0,
      holeCards: cards ? ([cards[0], cards[1]] as [Card, Card]) : null,
      hasCards: !!hp && !hp.folded,
    };
  });

  let handView: HandView | null = null;
  if (hand) {
    handView = {
      handNumber: hand.handNumber,
      buttonSeat: hand.buttonSeat,
      sbSeat: hand.sbSeat,
      bbSeat: hand.bbSeat,
      board: [...hand.board],
      street: hand.street,
      toAct: hand.toAct,
      currentBet: hand.currentBet,
      pots: hand.result
        ? hand.result.pots.map((p) => ({ amount: p.amount, eligibleSeats: [...p.winners] }))
        : computePots(hand),
      finished: hand.finished,
      result: hand.result ? structuredClone(hand.result) : null,
    };
  }
  return { config: { ...state.config }, seats, hand: handView };
}
