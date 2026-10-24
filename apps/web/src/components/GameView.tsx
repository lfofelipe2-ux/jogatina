import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChatBody, ChatMessage, ClientTableState, SimpleResponse } from '@poker/engine';
import ActionBar from './ActionBar';
import ChatPanel from './ChatPanel';
import HostPanel from './HostPanel';
import Scoreboard from './Scoreboard';
import ShareLink from './ShareLink';
import Table from './Table';
import { useGame } from './GameContext';
import { fmt } from '../lib/format';
import { btn } from '../lib/ui';

interface Props {
  state: ClientTableState;
  chat: ChatMessage[];
  onRotated: (tableId: string) => void;
  connected?: boolean;
}

type TabId = 'placar' | 'chat' | 'host';

const BUBBLE_MS = 4500;

/** Latest message per player, shown over their seat for a few seconds. History loaded on join does not pop up. */
function useBubbles(chat: ChatMessage[]): Record<string, ChatBody> {
  const [bubbles, setBubbles] = useState<Record<string, { id: number; body: ChatBody }>>({});
  const seen = useRef(chat.at(-1)?.id ?? 0);
  const timers = useRef(new Set<number>());

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    const fresh = chat.filter((m) => m.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = fresh.at(-1)!.id;
    setBubbles((b) => {
      const next = { ...b };
      for (const m of fresh) next[m.playerId] = { id: m.id, body: m.body };
      return next;
    });
    for (const m of fresh) {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        setBubbles((b) => {
          if (b[m.playerId]?.id !== m.id) return b;
          const { [m.playerId]: _gone, ...rest } = b;
          return rest;
        });
      }, BUBBLE_MS);
      timers.current.add(t);
    }
  }, [chat]);

  return Object.fromEntries(Object.entries(bubbles).map(([pid, v]) => [pid, v.body]));
}

export default function GameView({ state, chat, onRotated, connected = true }: Props) {
  const { api, toast } = useGame();
  const [tab, setTab] = useState<TabId>('placar');
  const bubbles = useBubbles(chat);
  const readUpTo = useRef(chat.at(-1)?.id ?? 0);
  if (tab === 'chat') readUpTo.current = chat.at(-1)?.id ?? 0;
  const unread = chat.filter((m) => m.id > readUpTo.current && m.playerId !== state.you.playerId).length;

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
    { id: 'chat', label: unread > 0 ? `Chat (${unread})` : 'Chat' },
  ];
  if (you.isHost) tabs.push({ id: 'host', label: 'Anfitrião' });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold sm:text-lg">
            Blinds {fmt(config.smallBlind)}/{fmt(config.bigBlind)}
          </h1>
          <p className="text-xs text-slate-400">
            Mão {hand?.handNumber || '–'} · {onlineCount} online · {config.actionTimeoutSec}s por ação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShareLink />
          <Link to="/" className={btn}>
            Início
          </Link>
        </div>
      </header>

      {!state.started && (
        <p className="rounded-lg bg-slate-800 px-3 py-2 text-center text-sm text-slate-300">
          Aguardando o anfitrião iniciar
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <Table state={state} bubbles={bubbles} />

          {me && (
            <div className="flex flex-wrap justify-center gap-2">
              {me.sittingOut && (
                <button type="button" disabled={!connected} onClick={() => run(api.sit(me.seat))} className={btn}>
                  Voltar ao jogo
                </button>
              )}
              <button type="button" disabled={!connected} onClick={() => run(api.standUp())} className={btn}>
                Levantar
              </button>
            </div>
          )}

          {state.legal && (
            <ActionBar legal={state.legal} pot={pot} currentBet={hand?.currentBet ?? 0} disabled={!connected} />
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
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
          <Panel show={tab === 'chat'} title="Chat">
            <ChatPanel messages={chat} youId={you.playerId} active={tab === 'chat'} disabled={!connected} />
          </Panel>
          {you.isHost && (
            <Panel show={tab === 'host'} title="Anfitrião">
              <HostPanel state={state} onRotated={onRotated} disabled={!connected} />
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function Panel({ show, title, children }: { show: boolean; title: string; children: React.ReactNode }) {
  return (
    <section className={`${show ? '' : 'hidden'} rounded-xl border border-slate-700 bg-slate-800/60 p-3 lg:block`}>
      <h2 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-slate-400 lg:block">{title}</h2>
      {children}
    </section>
  );
}
