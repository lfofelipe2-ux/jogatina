import { useState } from 'react';
import type { ClientTableState, SimpleResponse } from '@poker/engine';
import { useGame } from './GameContext';
import { fmt } from '../lib/format';
import { btn, btnPrimary } from '../lib/ui';

interface Props {
  state: ClientTableState;
  onRotated: (tableId: string) => void;
  disabled?: boolean;
}

export default function HostPanel({ state, onRotated, disabled = false }: Props) {
  const { api, toast } = useGame();
  const [pending, setBusy] = useState(false);
  const busy = pending || disabled;

  const run = async (task: () => Promise<SimpleResponse>): Promise<boolean> => {
    setBusy(true);
    const res = await task();
    setBusy(false);
    if (!res.ok) toast(res.error);
    return res.ok;
  };

  const kick = async (playerId: string, name: string) => {
    if (!window.confirm(`Remover ${name} da mesa?`)) return;
    await run(() => api.kick(playerId));
  };

  const rotate = async () => {
    setBusy(true);
    const res = await api.rotateLink();
    setBusy(false);
    if (res.ok) onRotated(res.tableId);
    else toast(res.error);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {!state.started && (
          <button type="button" disabled={busy} onClick={() => run(() => api.start())} className={btnPrimary}>
            Iniciar
          </button>
        )}
        <button type="button" disabled={busy} onClick={rotate} className={btn}>
          Gerar novo link
        </button>
      </div>

      <ul className="divide-y divide-slate-700 rounded-lg border border-slate-700">
        {state.online.map((p) => {
          const seat = p.seat === null ? null : state.table.seats[p.seat];
          const isYou = p.playerId === state.you.playerId;
          return (
            <li key={p.playerId} className="flex flex-col gap-2 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-slate-600'}`}
                  />
                  <span className="truncate">
                    {p.name}
                    {isYou && ' (você)'}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {seat ? `${fmt(seat.stack)} fichas` : 'Espectador'}
                </span>
              </div>
              {!isYou && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => kick(p.playerId, p.name)}
                    className="rounded-lg px-2 py-2 text-sm font-semibold text-red-400 hover:bg-red-950 disabled:opacity-50"
                  >
                    Remover
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
