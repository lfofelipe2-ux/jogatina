import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LobbyTable } from '@poker/engine';
import { toneOf } from './Profile';
import { fmt, signed } from '../lib/format';
import { btnPrimary } from '../lib/ui';

const REFRESH_MS = 5000;

/** Open tables on the site, refreshed every few seconds. */
export default function Lobby() {
  const [tables, setTables] = useState<LobbyTable[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch('/api/tables')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((body: { tables: LobbyTable[] }) => {
          if (!live) return;
          setTables(body.tables);
          setError(false);
        })
        .catch(() => live && setError(true));
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-800/70 p-5 shadow-xl">
      <h2 className="text-lg font-semibold">Mesas abertas</h2>
      {error && !tables && <p className="text-sm text-red-400">Não foi possível carregar as mesas.</p>}
      {!error && !tables && <p className="text-sm text-slate-400">Carregando…</p>}
      {tables && tables.length === 0 && <p className="text-sm text-slate-400">Nenhuma mesa aberta. Crie uma abaixo.</p>}
      {tables && tables.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tables.map((t) => (
            <li key={t.tableId} className="flex flex-col gap-2 rounded-xl bg-slate-900/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="text-xs text-slate-400">
                    Blinds {fmt(t.smallBlind)}/{fmt(t.bigBlind)} · {t.seated}/{t.maxSeats} sentados ·{' '}
                    {t.started ? 'em jogo' : 'aguardando'}
                    {t.host ? ` · anfitrião ${t.host}` : ''}
                  </p>
                </div>
                <Link to={`/t/${t.tableId}`} className={`${btnPrimary} shrink-0 px-3 py-1.5`}>
                  Entrar
                </Link>
              </div>
              {t.players.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 text-xs">
                  {t.players.map((p) => (
                    <li key={p.name} className="flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5">
                      <span className={p.seated ? 'text-slate-100' : 'text-slate-400'}>{p.name}</span>
                      {p.balance !== null && (
                        <span className={`text-[11px] tabular-nums ${toneOf(p.balance)}`} title="Saldo do mês">
                          {signed(p.balance)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
