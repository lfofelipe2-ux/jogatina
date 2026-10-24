import type { HandResult } from '@poker/engine';
import Card, { type CardTone } from './Card';
import { describe, MADE_COUNT, potReason } from '../lib/hands';
import { fmt, joinNames, signed } from '../lib/format';

interface Props {
  result: HandResult;
  nameOf: (seat: number) => string;
}

const potLabel = (i: number) => (i === 0 ? 'Pote' : `Pote paralelo ${i}`);

export default function ShowdownPanel({ result, nameOf }: Props) {
  const seats = Object.keys(result.showdown)
    .map(Number)
    .sort((a, b) => (result.payouts[b] ?? 0) - (result.payouts[a] ?? 0) || a - b);

  // The pot a seat won, or else lost as runner-up, says which of its cards decided it.
  const deciding = (seat: number) => {
    for (const p of result.pots) {
      const d = p.decision;
      if (d?.cardIndex === undefined) continue;
      if (p.winners.includes(seat)) return { index: d.cardIndex, tone: 'win' as const };
      if (d.runnerUp === seat) return { index: d.cardIndex, tone: 'lose' as const };
    }
    return null;
  };

  return (
    <div className="fx-pop rounded-xl sm:mb-6 border border-amber-400/40 bg-slate-950/80 px-2 py-2 text-center shadow-lg sm:px-3">
      {seats.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-3">
          {seats.map((seat) => {
            const sd = result.showdown[seat];
            const won = result.payouts[seat] ?? 0;
            const key = deciding(seat);
            const made = sd.category ? (sd.category === 'flush' ? 5 : MADE_COUNT[sd.category]) : 0;
            const tone = (i: number): CardTone | undefined => {
              if (!sd.best) return undefined;
              if (key && i === key.index) return key.tone;
              return i < made ? 'made' : 'dim';
            };
            return (
              <div
                key={seat}
                className={`flex flex-col items-center gap-1 rounded-lg px-1.5 py-1 sm:px-2 ${
                  won > 0 ? 'bg-amber-400/10 ring-1 ring-amber-400/70' : 'opacity-85'
                }`}
              >
                <div className="flex items-baseline gap-1.5 text-xs font-semibold text-slate-100">
                  <span className="max-w-[7rem] truncate">{nameOf(seat)}</span>
                  {won > 0 && <span className="font-bold tabular-nums text-emerald-400">{signed(won)}</span>}
                </div>
                <div className="flex gap-0.5 p-0.5">
                  {(sd.best ?? sd.cards).map((c, i) => (
                    <Card key={c} card={c} flip tone={tone(i)} />
                  ))}
                </div>
                <div className={`text-[11px] leading-tight ${won > 0 ? 'font-semibold text-amber-200' : 'text-slate-300'}`}>
                  {describe(sd, key?.index)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ul className={`${seats.length > 0 ? 'mt-1.5' : ''} space-y-0.5`}>
        {result.pots.map((pot, i) => {
          const reason = potReason(pot, result.showdown);
          return (
            <li key={i} className="text-xs leading-snug text-slate-300 sm:text-sm">
              {reason && <span className="font-semibold text-amber-200">{reason} · </span>}
              {result.pots.length > 1 && `${potLabel(i)}: `}
              {joinNames(pot.winners.map(nameOf))} {pot.winners.length > 1 ? 'dividem' : 'ganha'} {fmt(pot.amount)}
              {!pot.handName && ' (todos desistiram)'}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
