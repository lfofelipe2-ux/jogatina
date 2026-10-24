import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ClientTableState, SimpleResponse } from '@poker/engine';
import ActionBar from './ActionBar';
import HandCheatSheet from './HandCheatSheet';
import HostPanel from './HostPanel';
import Scoreboard from './Scoreboard';
import ShareLink from './ShareLink';
import Table from './Table';
import { useGame } from './GameContext';
import { fmt } from '../lib/format';
import { btn } from '../lib/ui';

interface Props {
  state: ClientTableState;
  onRotated: (tableId: string) => void;
  connected?: boolean;
}

type TabId = 'placar' | 'host';

export default function GameView({ state, onRotated, connected = true }: Props) {
  const { api, toast } = useGame();
  const [tab, setTab] = useState<TabId>('placar');

  const { table, you, config } = state;
  const hand = table.hand;
  const me = you.seat === null ? null : (table.seats[you.seat] ?? null);
  // hand.pots already includes the chips committed on the current street.
  const pot = (hand?.pots ?? []).reduce((sum, p) => sum + p.amount, 0);
  const onlineCount = state.online.filter((p) => p.connected).length;

  const run = (task: Promise<SimpleResponse>) =>
    task.then((res) => {
      if (!res.ok) toast(res.error);
    });

  const tabs: { id: TabId; label: string }[] = [
    { id: 'placar', label: 'Placar' },
  ];
  if (you.isHost) tabs.push({ id: 'host', label: 'Anfitrião' });

  const seatButtons = me && (
    <>
      {me.sittingOut && (
        <button type="button" disabled={!connected} onClick={() => run(api.sit(me.seat))} className={btn}>
          Voltar ao jogo
        </button>
      )}
      <button type="button" disabled={!connected} onClick={() => run(api.standUp())} className={btn}>
        Levantar
      </button>
    </>
  );
  const info = `Mão ${hand?.handNumber || '–'} · ${onlineCount} online · ${config.actionTimeoutSec}s por ação`;

  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:h-dvh lg:min-h-[600px] lg:grid-cols-[minmax(0,1fr)_310px] lg:grid-rows-[auto_minmax(0,1fr)_64px] lg:gap-3 lg:p-3">
      <div className="flex h-dvh min-h-[560px] flex-col gap-2 px-3 pt-2 sm:gap-3 sm:px-4 sm:pt-3 lg:contents">
        <header className="flex items-center justify-between gap-2 lg:col-span-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold sm:text-lg">
              Blinds {fmt(config.smallBlind)}/{fmt(config.bigBlind)}
            </h1>
            <p className="hidden text-xs text-slate-400 sm:block">{info}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <HandCheatSheet hole={hand ? (me?.holeCards ?? null) : null} board={hand?.board ?? []} />
            <ShareLink />
            <span className="hidden gap-2 sm:flex">{seatButtons}</span>
            <Link to="/" className={btn}>
              Início
            </Link>
            <details className="relative sm:hidden">
              <summary aria-label="Mais opções" className={`${btn} cursor-pointer list-none`}>
                ⋯
              </summary>
              <div className="absolute right-0 top-full z-40 mt-1 flex w-56 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800 p-2 shadow-xl">
                <p className="text-xs text-slate-400">{info}</p>
                {seatButtons}
              </div>
            </details>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:col-start-1 lg:row-start-2">
          {!state.started && (
            <p className="rounded-lg bg-slate-800 px-3 py-2 text-center text-sm text-slate-300">
              Aguardando o anfitrião iniciar
            </p>
          )}
          <Table state={state} />
        </div>

        <div className="-mx-3 shrink-0 sm:-mx-4 md:mx-0 md:h-16 lg:col-start-1 lg:row-start-3">
          {state.legal && (
            <ActionBar legal={state.legal} pot={pot} currentBet={hand?.currentBet ?? 0} disabled={!connected} />
          )}
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-3 p-3 sm:p-4 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto lg:p-0">
        <div role="tablist" className="flex gap-1 rounded-lg bg-slate-800 p-1 lg:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-md py-1.5 text-sm ${
                tab === t.id ? 'bg-amber-400 font-semibold text-slate-900' : 'text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Panel show={tab === 'placar'} title="Placar">
          <Scoreboard scoreboard={state.scoreboard} online={state.online} />
        </Panel>
        {you.isHost && (
          <Panel show={tab === 'host'} title="Anfitrião">
            <HostPanel state={state} onRotated={onRotated} disabled={!connected} />
          </Panel>
        )}
      </aside>
    </div>
  );
}

function Panel({ show, title, children }: { show: boolean; title: string; children: React.ReactNode }) {
  return (
    <section className={`${show ? '' : 'hidden'} rounded-xl border border-slate-700 bg-slate-800/60 p-3 lg:block lg:px-2`}>
      <h2 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-slate-400 lg:block">{title}</h2>
      {children}
    </section>
  );
}
