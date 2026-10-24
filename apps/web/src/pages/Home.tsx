import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateTableRequest, CreateTableResponse } from '@poker/engine';
import Lobby from '../components/Lobby';
import { socket } from '../socket';
import { hostKey, writeItem } from '../lib/storage';
import { failureMessage } from '../lib/errors';
import { btnPrimary, input } from '../lib/ui';

type Form = Record<keyof CreateTableRequest, string>;

const DEFAULTS: Form = {
  smallBlind: '5',
  bigBlind: '10',
  startingStack: '1000',
  maxSeats: '6',
  actionTimeoutSec: '30',
};

const FIELDS: { key: keyof CreateTableRequest; label: string }[] = [
  { key: 'smallBlind', label: 'Small blind' },
  { key: 'bigBlind', label: 'Big blind' },
  { key: 'startingStack', label: 'Fichas iniciais' },
  { key: 'maxSeats', label: 'Lugares (2 a 9)' },
  { key: 'actionTimeoutSec', label: 'Tempo por ação (10 a 120 s)' },
];

function parse(f: Form): CreateTableRequest | string {
  const r: CreateTableRequest = {
    smallBlind: Number(f.smallBlind),
    bigBlind: Number(f.bigBlind),
    startingStack: Number(f.startingStack),
    maxSeats: Number(f.maxSeats),
    actionTimeoutSec: Number(f.actionTimeoutSec),
  };
  if (!Object.values(r).every(Number.isInteger)) return 'Use apenas números inteiros.';
  if (r.smallBlind < 1) return 'O small blind precisa ser pelo menos 1.';
  if (r.bigBlind < r.smallBlind) return 'O big blind não pode ser menor que o small blind.';
  if (r.bigBlind > 1_000_000) return 'O big blind pode ser no máximo 1.000.000.';
  if (r.startingStack < r.bigBlind + 1) return 'As fichas iniciais precisam ser maiores que o big blind.';
  if (r.startingStack > 1_000_000_000) return 'As fichas iniciais podem ser no máximo 1.000.000.000.';
  if (r.maxSeats < 2 || r.maxSeats > 9) return 'Os lugares devem estar entre 2 e 9.';
  if (r.actionTimeoutSec < 10 || r.actionTimeoutSec > 120) return 'O tempo por ação deve ser de 10 a 120 segundos.';
  return r;
}

export default function Home() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const req = parse(form);
    if (typeof req === 'string') {
      setError(req);
      return;
    }
    setError(null);
    setPending(true);
    socket.emit('createTable', req, (res: CreateTableResponse) => {
      setPending(false);
      if (res.ok) {
        writeItem(hostKey(res.tableId), res.hostToken);
        navigate(`/t/${res.tableId}`);
      } else {
        setError(failureMessage(res.error));
      }
    });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Poker entre amigos</h1>
        <p className="mt-2 text-sm text-slate-400">
          Entre numa mesa aberta ou crie uma e mande o link para o grupo. Fichas fictícias.
        </p>
      </div>

      <Lobby />

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-800/70 p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Nova mesa</h2>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(({ key, label }) => (
            <label key={key} className={`flex flex-col gap-1 text-sm ${key === 'actionTimeoutSec' ? 'col-span-2' : ''}`}>
              <span className="text-slate-300">{label}</span>
              <input
                type="number"
                inputMode="numeric"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className={`${input} py-2 text-base tabular-nums`}
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${btnPrimary} py-3 text-base`}>
          {pending ? 'Criando…' : 'Criar mesa'}
        </button>
      </form>
    </main>
  );
}
