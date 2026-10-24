import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  REQUEST_MAX_LEN,
  REQUEST_REPLY_MAX_LEN,
  REQUEST_STATUS_LABEL,
  type ChangeRequest,
  type RequestStatus,
} from '@poker/engine';
import FloatingWindow from './FloatingWindow';
import { useGame } from './GameContext';
import { btn, btnDanger, btnPrimary, input } from '../lib/ui';

const STATUS_TONE: Record<RequestStatus, string> = {
  pending: 'bg-slate-600/80 text-slate-100',
  approved: 'bg-sky-700/80 text-white',
  rejected: 'bg-red-800/80 text-white',
  working: 'bg-amber-500/90 text-slate-900',
  preview: 'bg-violet-600/90 text-white',
  merging: 'bg-sky-700/80 text-white',
  waiting_deploy: 'bg-sky-700/80 text-white',
  deployed: 'bg-emerald-600/90 text-white',
  failed: 'bg-red-800/80 text-white',
};

const time = (at: number) => new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

interface Props {
  youName: string;
  onClose: () => void;
}

/** Project change requests: anyone suggests, the admin approves, a worker implements, previews and publishes. */
export default function RequestsPanel({ youName, onClose }: Props) {
  const { api, toast } = useGame();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.requests().then((res) => {
      if (!alive) return;
      setLoaded(true);
      if (!res.ok) return toast(res.error);
      setRequests(res.requests);
      setCanApprove(res.canApprove);
    });
    const off = api.onRequestUpdate((r) =>
      setRequests((list) => (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list])),
    );
    return () => {
      alive = false;
      off();
    };
  }, [api, toast]);

  const waiting = requests.filter((r) => r.status === 'preview' || (canApprove && r.status === 'pending')).length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const res = await api.requestCreate(text.trim());
    setBusy(false);
    if (!res.ok) return toast(res.error);
    setText('');
  };

  return (
    <FloatingWindow
      title="Pedidos"
      storageKey="jogatina.requestsWindow"
      onClose={onClose}
      badge={waiting > 0 ? <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[11px] text-slate-900">{waiting}</span> : null}
    >
      <p className="border-b border-white/10 px-3 py-1.5 text-xs text-slate-300">
        Sugira uma mudança. Depois da aprovação, o worker implementa e mostra a prévia antes de publicar.
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {loaded && requests.length === 0 && <p className="text-center text-sm text-slate-300">Nenhum pedido ainda.</p>}
        {requests.map((r) => (
          <RequestCard key={r.id} request={r} canApprove={canApprove} canReply={canApprove || r.authorName === youName} />
        ))}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={REQUEST_MAX_LEN}
          rows={2}
          placeholder="Ex.: deixar o botão de aumentar maior no celular"
          aria-label="Novo pedido"
          className={`${input} flex-1 resize-none bg-slate-800/70`}
        />
        <button type="submit" disabled={busy || text.trim().length === 0} className={`${btnPrimary} self-end`}>
          Enviar
        </button>
      </form>
    </FloatingWindow>
  );
}

function RequestCard({ request: r, canApprove, canReply }: { request: ChangeRequest; canApprove: boolean; canReply: boolean }) {
  const { api, toast } = useGame();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const run = async (task: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await task;
    setBusy(false);
    if (!res.ok) toast(res.error ?? 'Erro');
    return res.ok;
  };

  const decidable = canApprove && (r.status === 'pending' || r.status === 'preview');

  return (
    <article className="rounded-xl border border-white/10 bg-slate-800/50 p-2.5 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-300">
          #{r.id} · {r.authorName} · {time(r.at)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status]}`}>{REQUEST_STATUS_LABEL[r.status]}</span>
      </div>
      <p className="whitespace-pre-wrap text-slate-100">{r.text}</p>

      {r.events.length > 0 && (
        <ol className="mt-2 flex flex-col gap-1.5 border-l border-white/15 pl-2">
          {r.events.map((e, i) => (
            <li key={i} className="text-xs">
              <span className={e.author === 'worker' ? 'font-semibold text-violet-300' : 'font-semibold text-amber-300'}>{e.name}</span>{' '}
              <span className="text-slate-400">{time(e.at)}</span>
              {e.text && <p className="whitespace-pre-wrap text-slate-200">{e.text}</p>}
              {e.images.length > 0 && (
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {e.images.map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-white/10">
                      <img src={src} alt="Prévia" loading="lazy" className="h-28 w-full object-cover object-top" />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
          <div ref={endRef} />
        </ol>
      )}

      {r.prUrl && (
        <a href={r.prUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-300 underline">
          Ver o PR no GitHub
        </a>
      )}

      {decidable && (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={() => run(api.requestDecide(r.id, true))} className={`${btnPrimary} flex-1 py-1.5`}>
            {r.status === 'preview' ? 'Aprovar e publicar' : 'Aprovar'}
          </button>
          <button type="button" disabled={busy} onClick={() => run(api.requestDecide(r.id, false))} className={`${btnDanger} py-1.5`}>
            Recusar
          </button>
        </div>
      )}

      {canReply && r.status !== 'rejected' && r.status !== 'deployed' && (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reply.trim() && (await run(api.requestReply(r.id, reply.trim())))) setReply('');
          }}
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={REQUEST_REPLY_MAX_LEN}
            placeholder={r.status === 'preview' && canApprove ? 'Pedir ajuste na prévia' : 'Responder'}
            aria-label="Responder ao pedido"
            className={`${input} flex-1 bg-slate-900/60 py-1 text-xs`}
          />
          <button type="submit" disabled={busy || !reply.trim()} className={`${btn} py-1 text-xs`}>
            Enviar
          </button>
        </form>
      )}
    </article>
  );
}
