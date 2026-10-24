import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { btnPrimary, input } from '../lib/ui';

interface Props {
  initialName: string;
  error: string | null;
  notice: string | null;
  pending: boolean;
  onSubmit: (name: string) => void;
}

export default function JoinForm({ initialName, error, notice, pending, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = name.trim();
    if (t.length < 2 || t.length > 16) {
      setLocalError('Use de 2 a 16 caracteres.');
      return;
    }
    setLocalError(null);
    onSubmit(t);
  };

  const shownError = localError ?? error;

  return (
    <div className="mx-auto mt-12 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl">
      <h1 className="text-xl font-bold">Entrar na mesa</h1>
      {notice && <p className="mt-3 rounded-md bg-amber-400/10 px-3 py-2 text-sm text-amber-200">{notice}</p>}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-300">Seu nome</span>
          <input
            value={name}
            maxLength={16}
            autoFocus
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            className={`${input} py-2 text-base`}
          />
        </label>
        {shownError && (
          <p role="alert" className="text-sm text-red-400">
            {shownError}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${btnPrimary} py-3 text-base`}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <Link to="/" className="mt-4 block text-center text-sm text-slate-400 hover:text-slate-200">
        Criar outra mesa
      </Link>
    </div>
  );
}
