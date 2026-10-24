import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CHAT_TEXT_MAX,
  TAUNTS,
  searchStickers,
  stickerUrl,
  type ChatBody,
  type ChatInput,
  type ChatMessage,
  type GifResult,
} from '@poker/engine';
import { useGame } from './GameContext';
import { gifsEnabled, searchGifs } from '../lib/gifs';
import { btn, btnPrimary, input } from '../lib/ui';

const STICKER_PAGE = 60;

type PickerTab = 'stickers' | 'gifs' | 'taunts';

interface Props {
  messages: ChatMessage[];
  youId: string;
  /** The phone tab hides the panel; scrolling only works once it is visible again. */
  active?: boolean;
  disabled?: boolean;
}

export default function ChatPanel({ messages, youId, active = true, disabled = false }: Props) {
  const { api, toast } = useGame();
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.at(-1)?.id, active]);

  const send = async (msg: ChatInput) => {
    setSending(true);
    const res = await api.chat(msg);
    setSending(false);
    if (!res.ok) toast(res.error);
    return res.ok;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (await send({ kind: 'text', text: t })) setText('');
  };

  const pick = async (msg: ChatInput) => {
    if (await send(msg)) setPicker(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={listRef} className="flex max-h-72 min-h-24 flex-col gap-2 overflow-y-auto pr-1 lg:max-h-80">
        {messages.length === 0 && <p className="text-center text-xs text-slate-500">Nenhuma mensagem ainda.</p>}
        {messages.map((m) => (
          <div key={m.id} className="min-w-0 text-sm">
            <span className={`font-semibold ${m.playerId === youId ? 'text-amber-300' : 'text-slate-300'}`}>{m.name}</span>{' '}
            <MessageBody body={m.body} />
          </div>
        ))}
      </div>

      {picker && <Picker onPick={pick} disabled={disabled || sending} />}

      <form onSubmit={submit} className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setPicker((v) => !v)}
          aria-label="Figurinhas, GIFs e provocações"
          aria-expanded={picker}
          className={`${btn} px-2.5 ${picker ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : ''}`}
        >
          😀
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_TEXT_MAX}
          placeholder="Mensagem"
          aria-label="Mensagem"
          className={`${input} flex-1`}
        />
        <button type="submit" disabled={disabled || sending || !text.trim()} className={btnPrimary}>
          Enviar
        </button>
      </form>
    </div>
  );
}

export function MessageBody({ body, compact = false }: { body: ChatBody; compact?: boolean }) {
  switch (body.kind) {
    case 'text':
      return <span className="break-words text-slate-100">{body.text}</span>;
    case 'taunt':
      return <span className="break-words font-bold italic text-amber-300">{body.text}</span>;
    case 'sticker':
      return (
        <img
          src={stickerUrl(body.id)}
          alt="figurinha"
          className={`${compact ? 'h-10 w-10' : 'mt-1 block h-20 w-20'}`}
          loading="lazy"
        />
      );
    case 'gif':
      return (
        <img
          src={body.url}
          alt="GIF"
          width={body.width}
          height={body.height}
          className={`${compact ? 'h-12 w-auto' : 'mt-1 block h-auto max-h-48 w-auto max-w-full'} rounded-md`}
          loading="lazy"
        />
      );
  }
}

function Picker({ onPick, disabled }: { onPick: (msg: ChatInput) => void; disabled: boolean }) {
  const [tab, setTab] = useState<PickerTab>('stickers');
  const [gifs, setGifs] = useState(false);

  useEffect(() => {
    let live = true;
    gifsEnabled().then((on) => live && setGifs(on));
    return () => {
      live = false;
    };
  }, []);

  const tabs: { id: PickerTab; label: string }[] = [{ id: 'stickers', label: 'Figurinhas' }];
  if (gifs) tabs.push({ id: 'gifs', label: 'GIFs' });
  tabs.push({ id: 'taunts', label: 'Provocações' });

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
      <div role="tablist" className="mb-2 flex gap-1 rounded-md bg-slate-800 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded py-1 text-xs ${
              tab === t.id ? 'bg-amber-400 font-semibold text-slate-900' : 'text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'stickers' && <Stickers onPick={onPick} disabled={disabled} />}
      {tab === 'gifs' && <Gifs onPick={onPick} disabled={disabled} />}
      {tab === 'taunts' && (
        <div className="flex flex-wrap gap-1.5">
          {TAUNTS.map((t, id) => (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onPick({ kind: 'taunt', id })}
              className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-slate-600 disabled:opacity-50"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stickers({ onPick, disabled }: { onPick: (msg: ChatInput) => void; disabled: boolean }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(STICKER_PAGE);
  const found = searchStickers(q);

  return (
    <div className="flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setLimit(STICKER_PAGE);
        }}
        placeholder="Buscar: rindo, bravo, fogo, money…"
        aria-label="Buscar figurinha"
        className={input}
      />
      <div className="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-8 lg:grid-cols-6">
        {found.slice(0, limit).map((id) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onPick({ kind: 'sticker', id })}
            className="rounded-md p-1 hover:bg-slate-700 disabled:opacity-50"
          >
            <img src={stickerUrl(id, false)} alt="" className="h-9 w-9" loading="lazy" />
          </button>
        ))}
      </div>
      {found.length === 0 && <p className="text-center text-xs text-slate-500">Nada encontrado.</p>}
      {found.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + STICKER_PAGE)} className={`${btn} py-1 text-xs`}>
          Mostrar mais
        </button>
      )}
      <p className="text-right text-[10px] text-slate-500">Noto Emoji Animation · CC BY 4.0</p>
    </div>
  );
}

function Gifs({ onPick, disabled }: { onPick: (msg: ChatInput) => void; disabled: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GifResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setError(null);
      searchGifs(q, ctrl.signal)
        .then(setResults)
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Erro na busca');
        });
    }, 400);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar GIF"
        aria-label="Buscar GIF"
        className={input}
      />
      {error && <p className="text-center text-xs text-red-300">{error}</p>}
      {!error && results === null && <p className="text-center text-xs text-slate-500">Carregando…</p>}
      {results && results.length === 0 && <p className="text-center text-xs text-slate-500">Nada encontrado.</p>}
      <div className="grid max-h-60 grid-cols-3 gap-1 overflow-y-auto">
        {results?.map((g) => (
          <button
            key={g.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick({ kind: 'gif', id: g.id, url: g.url, width: g.width, height: g.height, sig: g.sig })}
            className="overflow-hidden rounded-md hover:ring-2 hover:ring-amber-400 disabled:opacity-50"
          >
            <img src={g.previewUrl} alt="" className="h-20 w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <p className="text-right text-[10px] text-slate-500">GIFs via KLIPY</p>
    </div>
  );
}
