import type { ClientTableState, ScoreRow } from '@poker/engine';
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

  if (rows.length === 0) return <p className="text-sm text-slate-500">Sem jogadores ainda.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-xs sm:text-sm">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400 sm:text-[11px]">
          <tr className="border-b border-slate-700">
            <th className="py-1.5 pr-2 font-medium">Jogador</th>
            <th className="px-1 text-right font-medium">Fichas</th>
            <th className="px-1 text-right font-medium">Saldo</th>
            <th className="px-1 text-right font-medium">Mãos ganhas</th>
            <th className="px-1 text-right font-medium">Maior pote</th>
            <th className="pl-1 text-right font-medium">Mãos jogadas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={`border-b border-slate-800 ${here.has(r.name) ? '' : 'text-slate-500'}`}>
              <td className="max-w-[7rem] truncate py-1.5 pr-2" title={r.name}>
                {r.name}
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
