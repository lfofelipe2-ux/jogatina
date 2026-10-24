import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PlayerProfile } from '@poker/engine';
import { useGame } from './GameContext';
import { fmt, signed } from '../lib/format';
import { btn } from '../lib/ui';

const OpenProfile = createContext<((playerId: string) => void) | null>(null);

/** Callback that opens a player's profile, or null outside a table. */
export function useOpenProfile(): ((playerId: string) => void) | null {
  return useContext(OpenProfile);
}

export const toneOf = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-slate-200');

const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const when = (at: number) =>
  new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** A player's name that opens their profile when tapped. */
export function PlayerName({ playerId, name, className = '' }: { playerId?: string; name: string; className?: string }) {
  const open = useOpenProfile();
  if (!open || !playerId) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(playerId);
      }}
      title={`Ver perfil de ${name}`}
      className={`max-w-full truncate underline decoration-dotted underline-offset-2 hover:text-amber-200 ${className}`}
    >
      {name}
    </button>
  );
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <OpenProfile.Provider value={setTarget}>
      {children}
      {target && <ProfileModal playerId={target} onClose={() => setTarget(null)} />}
    </OpenProfile.Provider>
  );
}

export function ProfileModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { api } = useGame();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.profile(playerId).then((res) => {
      if (!live) return;
      if (res.ok) setProfile(res.profile);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [api, playerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Perfil do jogador"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:rounded-2xl"
      >
        {!profile && !error && <p className="py-8 text-center text-sm text-slate-400">Carregando perfil…</p>}
        {error && <p className="py-8 text-center text-sm text-red-400">{error}</p>}
        {profile && (
          <>
            <div className="text-center">
              <h2 className="truncate text-xl font-bold">{profile.name}</h2>
              <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">Saldo de {monthLabel(profile.month)}</p>
              <p className={`text-5xl font-extrabold tabular-nums ${toneOf(profile.balance)}`}>{signed(profile.balance)}</p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-slate-800 p-2">
                <dt className="text-xs text-slate-400">Mãos jogadas</dt>
                <dd className="text-lg font-semibold tabular-nums">{fmt(profile.handsPlayed)}</dd>
              </div>
              <div className="rounded-lg bg-slate-800 p-2">
                <dt className="text-xs text-slate-400">Maior pote ganho</dt>
                <dd className="text-lg font-semibold tabular-nums">{fmt(profile.biggestPotWon)}</dd>
              </div>
            </dl>
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Últimos potes</h3>
              {profile.recent.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma mão jogada ainda.</p>
              ) : (
                <ul className="divide-y divide-slate-800 text-sm">
                  {profile.recent.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0">
                        <span className="tabular-nums text-slate-300">{when(r.at)}</span>
                        <span className="ml-2 truncate text-slate-500">{r.table ?? 'Mesa'}</span>
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${toneOf(r.amount)}`}>{signed(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className="text-center text-[11px] text-slate-500">
              Cada vez que senta, o saldo desconta as fichas iniciais; o resultado das mãos soma por cima. Zera todo mês.
            </p>
          </>
        )}
        <button type="button" onClick={onClose} className={btn}>
          Fechar
        </button>
      </div>
    </div>
  );
}
