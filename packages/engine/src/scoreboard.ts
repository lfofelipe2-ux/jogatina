import type { HandResult, Scoreboard, ScoreRow, TableState } from './types';

const own = (sb: Scoreboard, name: string): ScoreRow | undefined =>
  Object.hasOwn(sb, name) ? sb[name] : undefined;

export function ensurePlayer(sb: Scoreboard, name: string, buyIn: number): Scoreboard {
  if (own(sb, name)) return sb;
  const row: ScoreRow = { name, stack: buyIn, invested: buyIn, net: 0, handsPlayed: 0, handsWon: 0, biggestPot: 0 };
  return { ...sb, [name]: row };
}

export function recordTopUp(sb: Scoreboard, name: string, amount: number): Scoreboard {
  const row = own(sb, name);
  if (!row) throw new Error(`Unknown scoreboard player: ${name}`);
  const invested = row.invested + amount;
  const stack = row.stack + amount;
  return { ...sb, [name]: { ...row, invested, stack, net: stack - invested } };
}

/** Call once per finished hand with the table state after payouts. */
export function recordHand(sb: Scoreboard, state: TableState, result: HandResult): Scoreboard {
  const next: Scoreboard = { ...sb };
  const hand = state.hand;

  if (hand) {
    for (const key of Object.keys(hand.players)) {
      const seatIndex = Number(key);
      const seat = state.seats[seatIndex];
      const row = seat ? own(next, seat.name) : undefined;
      if (!seat || !row) continue;
      const payout = result.payouts[seatIndex] ?? 0;
      const won = result.pots.some((pot) => pot.winners.includes(seatIndex));
      next[seat.name] = {
        ...row,
        handsPlayed: row.handsPlayed + 1,
        handsWon: row.handsWon + (won ? 1 : 0),
        biggestPot: Math.max(row.biggestPot, payout),
      };
    }
  }

  state.seats.forEach((seat) => {
    const row = seat ? own(next, seat.name) : undefined;
    if (!seat || !row) return;
    next[seat.name] = { ...next[seat.name], stack: seat.stack, net: seat.stack - row.invested };
  });

  return next;
}

/** Rows sorted by net desc, then name. */
export function sortedRows(sb: Scoreboard): ScoreRow[] {
  return Object.values(sb).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}
