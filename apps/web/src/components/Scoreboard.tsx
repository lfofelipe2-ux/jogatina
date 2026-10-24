import type { ClientTableState, ScoreRow } from '@poker/engine';
import { PlayerName } from './Profile';
import { fmt, signed } from '../lib/format';

export function sortedRows(scoreboard: Record<string, ScoreRow>): ScoreRow[] {
  return Object.values(scoreboard).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name, 'pt-BR'));
}

interface Props {
  scoreboard: Record<string, ScoreRow>;
  online: ClientTableState['online'];
}

export default function Scoreboard({ scoreboard, online }: Props) {
  const rows = sortedRows(scoreboard);
  const here = new Set(online.filter((p) => p.connected).map((p) => p.name));
  const idOf = new Map(online.map((p) => [p.name, p.playerId]));

  if (rows.length === 0) return <p className="text-sm text-slate-500">Sem jogadores ainda.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-left text-xs sm:text-sm">
        <thead className="whitespace-nowrap text-[11px] text-slate-300">
          <tr className="border-b border-slate-700">
            <th className="py-1.5 pr-1 font-medium">Jogador</th>
            <th className="px-1 text-right font-medium">Fichas</th>
            <th className="px-1 text-right font-medium">Saldo</th>
            <th className="px-1 text-right font-medium" title="Mãos ganhas">Ganhas</th>
            <th className="px-1 text-right font-medium" title="Maior pote">Maior</th>
            <th className="pl-1 text-right font-medium" title="Mãos jogadas">Jogadas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={`border-b border-slate-800 ${here.has(r.name) ? '' : 'text-slate-400'}`}>
              <td className="max-w-[7rem] truncate py-1.5 pr-1" title={r.name}>
                <PlayerName playerId={idOf.get(r.name)} name={r.name} />
              </td>
              <td className="px-1 text-right tabular-nums">{fmt(r.stack)}</td>
              <td
                className={`px-1 text-right font-semibold tabular-nums ${
                  r.net > 0 ? 'text-emerald-400' : r.net < 0 ? 'text-red-400' : ''
                }`}
              >
                {signed(r.net)}
              </td>
              <td className="px-1 text-right tabular-nums">{r.handsWon}</td>
              <td className="px-1 text-right tabular-nums">{fmt(r.biggestPot)}</td>
              <td className="pl-1 text-right tabular-nums">{r.handsPlayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
