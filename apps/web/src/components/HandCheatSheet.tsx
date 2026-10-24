import { useEffect, useMemo, useState } from 'react';
import type { Card as CardCode } from '@poker/engine';
import Card from './Card';
import { RANKINGS, analyze } from '../lib/cheatsheet';
import { handLabel } from '../lib/hands';
import { btn } from '../lib/ui';

interface Props {
  /** The viewer's own hole cards, null when he holds none. */
  hole: [CardCode, CardCode] | null;
  board: CardCode[];
}

/** "Colinha": hand rankings, with the viewer's made hand and one-card draws marked. */
export default function HandCheatSheet({ hole, board }: Props) {
  const [open, setOpen] = useState(false);
  const a = useMemo(() => analyze(hole, board), [hole, board]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const best = a.best ? a.rows[a.best].made : null;
  const summary =
    a.best && best ? handLabel(a.best === 'royal-flush' ? 'straight-flush' : a.best, best) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btn} px-2 sm:px-3`}
        aria-haspopup="dialog"
        aria-label="Colinha"
        title="Colinha: ranking das mãos"
      >
        {/* Icon only on phones, where the header is tight. */}
        <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current stroke-2 sm:hidden">
          <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Colinha</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setOpen(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Colinha de mãos"
            className="relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl [--card-xs:26px] sm:max-h-none sm:w-[400px] sm:rounded-none sm:rounded-l-2xl sm:[--card-xs:30px]"
          >
            <header className="flex items-center justify-between gap-2 border-b border-slate-700 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold">Colinha</h2>
                <p className="truncate text-xs text-slate-400">
                  {summary ? (
                    <>
                      Sua mão: <span className="font-semibold text-amber-300">{summary}</span>
                    </>
                  ) : (
                    'Da mais fraca para a mais forte'
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className={btn} aria-label="Fechar">
                ✕
              </button>
            </header>
            <ol className="flex-1 overflow-y-auto px-3 py-2">
              {RANKINGS.map((r, i) => {
                const row = a.rows[r.id];
                const isBest = a.best === r.id;
                const mine = isBest ? row.made : row.outs > 0 ? row.draw : null;
                return (
                  <li
                    key={r.id}
                    className={`mb-1.5 rounded-lg border px-2.5 py-2 ${
                      isBest ? 'border-amber-400/70 bg-amber-400/10' : 'border-slate-800 bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          <span className="mr-1 text-xs tabular-nums text-slate-500">{i + 1}.</span>
                          {r.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">{r.hint}</p>
                      </div>
                      <div className="flex shrink-0 gap-0.5" aria-label={`Exemplo de ${r.name}`}>
                        {r.example.map((c) => (
                          <Card key={c} card={c} />
                        ))}
                      </div>
                    </div>
                    {mine && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            isBest ? 'bg-amber-400 text-slate-900' : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {isBest ? 'Sua mão' : 'Faltam 1'}
                        </span>
                        <div className="flex gap-0.5">
                          {mine.map((c) => (
                            <Card key={c} card={c} tone={isBest ? 'made' : undefined} />
                          ))}
                        </div>
                        {!isBest && (
                          <span className="text-[11px] text-slate-400">
                            {row.outs} {row.outs === 1 ? 'carta serve' : 'cartas servem'}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">
              {hole
                ? 'Calculado só com as suas cartas e a mesa.'
                : 'Sente-se e receba cartas para ver a sua mão aqui.'}
            </p>
          </section>
        </div>
      )}
    </>
  );
}
