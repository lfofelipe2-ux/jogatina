import type { ReactNode } from 'react';
import type { SeatView } from '@poker/engine';
import Card from './Card';
import Timer from './Timer';
import { fmt } from '../lib/format';

export type Tag = 'D' | 'SB' | 'BB';

interface Props {
  seat: number;
  x: number;
  y: number;
  view: SeatView | null;
  isYou: boolean;
  tags: Tag[];
  toAct: boolean;
  deadline: number | null;
  timeoutSec: number;
  canSit: boolean;
  onSit: (seat: number) => void;
}

const WRAP = 'absolute z-10 -translate-x-1/2 -translate-y-1/2';
const BOX = 'w-[80px] sm:w-[104px]';

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded px-1 text-[9px] font-bold leading-4 text-white ${className}`}>{children}</span>;
}

export default function Seat({
  seat,
  x,
  y,
  view,
  isYou,
  tags,
  toAct,
  deadline,
  timeoutSec,
  canSit,
  onSit,
}: Props) {
  const pos = { left: `${x}%`, top: `${y}%` };

  if (!view) {
    return (
      <div className={WRAP} style={pos}>
        <div
          className={`${BOX} flex h-14 flex-col items-center justify-center rounded-xl border border-dashed border-emerald-100/30 text-[11px] text-emerald-100/60`}
        >
          {canSit ? (
            <button
              type="button"
              onClick={() => onSit(seat)}
              className="rounded-lg bg-emerald-950/70 px-2.5 py-1 text-xs font-semibold text-emerald-50 hover:bg-emerald-900"
            >
              Sentar
            </button>
          ) : (
            'Vago'
          )}
        </div>
      </div>
    );
  }

  const ring = toAct
    ? 'border-amber-400 ring-2 ring-amber-400/70 shadow-[0_0_18px_rgba(251,191,36,0.45)]'
    : isYou
      ? 'border-sky-400'
      : 'border-slate-600';

  return (
    <div className={WRAP} style={pos}>
      <div
        className={`relative ${BOX} rounded-xl border bg-slate-900/95 px-1 pb-1.5 pt-2 text-center shadow-lg transition-opacity ${ring} ${
          view.folded ? 'opacity-40' : ''
        }`}
      >
        {tags.includes('D') && (
          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-900 shadow">
            D
          </span>
        )}
        <div className="truncate px-1 text-xs font-semibold text-slate-100">{view.name}</div>
        <div className="text-[11px] font-medium tabular-nums text-emerald-300">{fmt(view.stack)}</div>
        <div className="mt-0.5 flex min-h-[14px] flex-wrap justify-center gap-0.5">
          {tags.includes('SB') && <Badge className="bg-indigo-600">SB</Badge>}
          {tags.includes('BB') && <Badge className="bg-indigo-800">BB</Badge>}
          {isYou && <Badge className="bg-sky-600">Você</Badge>}
          {view.sittingOut && <Badge className="bg-slate-600">Ausente</Badge>}
          {view.allIn && <Badge className="bg-red-600">All-in</Badge>}
        </div>
        <div className="mt-1 flex justify-center gap-0.5">
          {view.holeCards ? (
            <>
              <Card card={view.holeCards[0]} />
              <Card card={view.holeCards[1]} />
            </>
          ) : view.hasCards ? (
            <>
              <Card back />
              <Card back />
            </>
          ) : null}
        </div>
        {toAct && deadline !== null && (
          <div className="mt-1.5 px-0.5">
            <Timer deadline={deadline} totalSec={timeoutSec} />
          </div>
        )}
      </div>
    </div>
  );
}
