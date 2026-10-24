import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameApi } from '../api';
import { failureMessage } from '../lib/errors';

interface GameCtx {
  api: GameApi;
  toast: (text: string) => void;
}

const Ctx = createContext<GameCtx | null>(null);

export function GameProvider({ api, children }: { api: GameApi; children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((text: string) => {
    setMessage(failureMessage(text));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => ({ api, toast }), [api, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {message && (
        <div
          role="status"
          className="fixed left-1/2 top-3 z-50 w-[90%] max-w-sm -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg"
        >
          {message}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useGame(): GameCtx {
  const value = useContext(Ctx);
  if (!value) throw new Error('useGame precisa estar dentro de GameProvider');
  return value;
}
