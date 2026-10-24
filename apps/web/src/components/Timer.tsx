import { useEffect, useState } from 'react';

/** serverNow - Date.now(), refreshed on every state the server sends. */
let clockOffset = 0;
export function syncServerClock(serverNow: number): void {
  if (Number.isFinite(serverNow)) clockOffset = serverNow - Date.now();
}

function useServerNow(): number {
  const [now, setNow] = useState(() => Date.now() + clockOffset);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + clockOffset), 250);
    return () => window.clearInterval(id);
  }, []);

  return now;
}

interface Props {
  deadline: number;
  totalSec: number;
}

export default function Timer({ deadline, totalSec }: Props) {
  const now = useServerNow();
  const left = Math.max(0, deadline - now);
  const ratio = Math.min(1, left / (totalSec * 1000));
  const sec = Math.ceil(left / 1000);

  return (
    <div className="flex items-center gap-1" role="timer" aria-label={`${sec} segundos`}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full transition-[width] duration-200 ease-linear ${ratio < 0.25 ? 'bg-red-500' : 'bg-amber-400'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="w-6 text-right text-[10px] tabular-nums text-amber-200">{sec}s</span>
    </div>
  );
}

/** Seconds left, shown only in the last 10 seconds. */
export function Countdown({ deadline, className }: { deadline: number; className: string }) {
  const sec = Math.ceil(Math.max(0, deadline - useServerNow()) / 1000);
  if (sec > 10) return null;
  return (
    <div className={`pointer-events-none font-bold tabular-nums ${className}`} role="timer" aria-label={`${sec} segundos`}>
      {sec}
    </div>
  );
}
