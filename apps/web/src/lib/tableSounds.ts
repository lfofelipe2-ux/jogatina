import type { ClientTableState } from '@poker/engine';
import type { SoundName } from './sound';

/** Sounds for the change from one table state to the next, in the order they should play. */
export function soundsFor(before: ClientTableState | null, after: ClientTableState): SoundName[] {
  const out: SoundName[] = [];
  const hand = after.table.hand;
  const old = before?.table.hand ?? null;
  if (!before || !hand) return out;

  if (old?.handNumber !== hand.handNumber) {
    if (!hand.finished) out.push('deal');
    if (after.legal) out.push('turn');
    return out;
  }
  if (old.finished) return out;

  // Actions, read from what changed on each seat.
  let acted = false;
  after.table.seats.forEach((v, s) => {
    const p = before.table.seats[s];
    if (!v || !p || v.playerId !== p.playerId) return;
    if (v.folded && !p.folded) {
      out.push('fold');
      acted = true;
    } else if (v.allIn && !p.allIn) {
      out.push('allin');
      acted = true;
    } else if (v.committedThisStreet > p.committedThisStreet && old.street === hand.street) {
      out.push(v.committedThisStreet > old.currentBet ? 'raise' : 'chips');
      acted = true;
    }
  });
  // A street change resets the bets; the closing call shows up as the actor's stack going down.
  if (!acted && old.street !== hand.street && old.toAct !== null) {
    const s = old.toAct;
    const v = after.table.seats[s];
    const p = before.table.seats[s];
    if (v && p && v.stack < p.stack) out.push(v.allIn && !p.allIn ? 'allin' : 'chips');
    else out.push('check');
    acted = true;
  }
  // Same street, turn moved on and nobody put chips in or folded: a check.
  if (!acted && old.street === hand.street && old.toAct !== null && old.toAct !== hand.toAct) out.push('check');

  if (hand.board.length > old.board.length) out.push('deal');

  if (hand.finished && hand.result) {
    const mine = after.you.seat !== null && (hand.result.payouts[after.you.seat] ?? 0) > 0;
    out.push(mine ? 'win' : 'chips');
  } else if (after.legal && !before.legal) {
    out.push('turn');
  }
  return out;
}
