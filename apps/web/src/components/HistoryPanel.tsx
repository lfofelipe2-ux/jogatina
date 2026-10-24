import type { ClientTableState, HandHistoryEntry } from '@poker/engine';
import Card from './Card';
import { PlayerName, toneOf } from './Profile';
import { handLabel } from '../lib/hands';
import { fmt, joinNames, signed } from '../lib/format';

const time = (at: number) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Finished hands, newest first. Hole cards appear only for players who reached showdown. */
export default function HistoryPanel({ history, online }: { history: HandHistoryEntry[]; online: ClientTableState['online'] }) {
  if (history.length === 0) return <p className="text-sm text-slate-500">Nenhuma mão terminada ainda.</p>;
  const idOf = new Map(online.map((p) => [p.name, p.playerId]));

  return (
    <ol className="flex flex-col gap-2">
      {history.map((h) => (
        <li key={h.handNumber} className="rounded-lg bg-slate-900/60 p-2">
          <div className="flex items-baseline justify-between gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Mão {h.handNumber}</span>
            <span className="tabular-nums">{time(h.at)}</span>
          </div>
          {h.board.length > 0 && (
            <div className="mt-1 flex gap-0.5 [--card-xs:26px]">
              {h.board.map((c) => (
                <Card key={c} card={c} />
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-amber-200">
            {h.pots.map((p, i) => (
              <span key={i} className="block">
                {joinNames(p.winners)} {p.winners.length > 1 ? 'dividem' : 'leva'} {fmt(p.amount)}
              </span>
            ))}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {h.players.map((p) => (
              <li key={p.seat} className={`flex items-center gap-1.5 ${p.folded ? 'text-slate-500' : ''}`}>
                <PlayerName playerId={idOf.get(p.name)} name={p.name} className="w-20 shrink-0 truncate text-left" />
                <span className="flex min-w-[54px] gap-0.5 [--card-xs:22px]">
                  {p.cards ? p.cards.map((c) => <Card key={c} card={c} />) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {p.folded ? 'Desistiu' : p.category && p.best ? handLabel(p.category, p.best) : p.cards ? p.handName : ''}
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${toneOf(p.net)}`}>{signed(p.net)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
