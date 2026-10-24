import { useEffect, useState } from 'react';
import type { ActionType, LegalActions } from '@poker/engine';
import { useGame } from './GameContext';
import { fmt } from '../lib/format';
import { btnDanger, btnPrimary, input } from '../lib/ui';

interface Props {
  legal: LegalActions;
  pot: number;
  currentBet: number;
  disabled?: boolean;
}

export default function ActionBar({ legal, pot, currentBet, disabled = false }: Props) {
  const { api, toast } = useGame();
  const [amount, setAmount] = useState(legal.minTo);
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setBusy] = useState(false);
  const busy = pending || disabled;
  const canSize = legal.canBet || legal.canRaise;

  const clamp = (v: number) => Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(v)));
  const shown = clamp(amount);

  useEffect(() => {
    setAmount((a) => clamp(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legal.minTo, legal.maxTo]);

  const send = async (type: ActionType, value?: number) => {
    setBusy(true);
    const res = await api.action(type, value);
    setBusy(false);
    if (!res.ok) toast(res.error);
  };

  const pick = (v: number) => {
    setDraft(null);
    setAmount(v);
  };

  const sized = (factor: number) => clamp(currentBet + (pot + legal.callAmount) * factor);

  return (
    <div className="sticky bottom-0 z-20 -mx-3 border-t border-slate-700 bg-slate-900/95 p-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <p className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-amber-300">Sua vez</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || !legal.canFold}
          onClick={() => send('fold')}
          className={`${btnDanger} py-3`}
        >
          Desistir
        </button>
        {legal.canCheck ? (
          <button type="button" disabled={busy} onClick={() => send('check')} className="rounded-lg bg-slate-600 py-3 text-sm font-bold text-white hover:bg-slate-500 disabled:opacity-50">
            Passar
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => send('call')} className="rounded-lg bg-sky-600 py-3 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50">
            Pagar {fmt(legal.callAmount)}
          </button>
        )}
      </div>

      {canSize && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300">{legal.canBet ? 'Apostar' : 'Aumentar para'}</span>
            <input
              type="number"
              inputMode="numeric"
              min={legal.minTo}
              max={legal.maxTo}
              value={draft ?? String(shown)}
              disabled={busy}
              onChange={(e) => {
                setDraft(e.target.value);
                const v = Number(e.target.value);
                if (e.target.value.trim() !== '' && Number.isFinite(v)) setAmount(clamp(v));
              }}
              onBlur={() => setDraft(null)}
              className={`${input} w-28 text-right text-base font-semibold tabular-nums`}
            />
          </div>
          <input
            type="range"
            min={legal.minTo}
            max={legal.maxTo}
            step={1}
            value={shown}
            disabled={busy}
            onChange={(e) => {
              setDraft(null);
              setAmount(Number(e.target.value));
            }}
            className="w-full accent-amber-400"
          />
          <div className="grid grid-cols-4 gap-1.5 text-xs">
            <Quick label="½ pote" disabled={busy} onClick={() => pick(sized(0.5))} />
            <Quick label="¾ pote" disabled={busy} onClick={() => pick(sized(0.75))} />
            <Quick label="Pote" disabled={busy} onClick={() => pick(sized(1))} />
            <Quick label="All-in" disabled={busy} onClick={() => pick(legal.maxTo)} />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              send(legal.canBet ? 'bet' : 'raise', shown);
            }}
            className={`${btnPrimary} w-full py-3 text-base`}
          >
            {legal.canBet ? 'Apostar' : 'Aumentar'} {fmt(shown)}
          </button>
        </div>
      )}
    </div>
  );
}

function Quick({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-slate-700 py-1.5 font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
