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

  const amountInput = (
    <input
      type="number"
      inputMode="numeric"
      aria-label={legal.canBet ? 'Apostar' : 'Aumentar para'}
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
      className={`${input} w-16 shrink-0 py-1 text-right text-base font-semibold tabular-nums md:w-24`}
    />
  );

  // Phone: chip strip above one row of buttons. md and up: one row (fold, call, amount, chips, raise).
  return (
    <div className="flex flex-col gap-2 border-t border-slate-700 bg-slate-900/95 px-3 py-2 backdrop-blur md:h-16 md:flex-row md:items-center md:rounded-xl md:border md:px-2 md:py-0">
      {canSize && (
        <div className="flex items-center gap-1.5 md:order-3 md:min-w-0 md:flex-1 md:gap-2">
          {amountInput}
          <input
            type="range"
            min={legal.minTo}
            max={legal.maxTo}
            step={1}
            value={shown}
            disabled={busy}
            aria-label={legal.canBet ? 'Apostar' : 'Aumentar para'}
            onChange={(e) => {
              setDraft(null);
              setAmount(Number(e.target.value));
            }}
            className="hidden min-w-0 flex-1 accent-amber-400 lg:block"
          />
          <div className="grid flex-1 grid-cols-4 gap-1.5 text-xs md:ml-auto md:flex md:flex-none md:gap-1">
            <Quick label="½ pote" disabled={busy} onClick={() => pick(sized(0.5))} />
            <Quick label="¾ pote" disabled={busy} onClick={() => pick(sized(0.75))} />
            <Quick label="Pote" disabled={busy} onClick={() => pick(sized(1))} />
            <Quick label="All-in" disabled={busy} onClick={() => pick(legal.maxTo)} />
          </div>
        </div>
      )}
      <div className={`grid gap-2 ${canSize ? 'grid-cols-[1fr_1fr_1.5fr]' : 'grid-cols-2'} md:contents`}>
        <button
          type="button"
          disabled={busy || !legal.canFold}
          onClick={() => send('fold')}
          className={`${btnDanger} h-11 md:order-1 md:h-12 md:px-4`}
        >
          Desistir
        </button>
        {legal.canCheck ? (
          <button type="button" disabled={busy} onClick={() => send('check')} className="h-11 rounded-lg bg-slate-600 px-3 text-sm font-bold text-white hover:bg-slate-500 disabled:opacity-50 md:order-2 md:h-12 md:px-4">
            Passar
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => send('call')} className="h-11 whitespace-nowrap rounded-lg bg-sky-600 px-3 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50 md:order-2 md:h-12 md:px-4">
            Pagar {fmt(legal.callAmount)}
          </button>
        )}
        {canSize && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              send(legal.canBet ? 'bet' : 'raise', shown);
            }}
            className={`${btnPrimary} h-11 whitespace-nowrap text-base md:order-4 md:h-12 md:px-5`}
          >
            {legal.canBet ? 'Apostar' : 'Aumentar'} {fmt(shown)}
          </button>
        )}
      </div>
    </div>
  );
}

function Quick({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="whitespace-nowrap rounded-md bg-slate-700 px-1 py-1.5 font-medium text-slate-100 md:px-2.5 md:py-2 hover:bg-slate-600 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
