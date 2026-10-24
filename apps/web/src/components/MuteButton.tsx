import { setMuted, useMuted } from '../lib/sound';
import { btn } from '../lib/ui';

export default function MuteButton() {
  const muted = useMuted();
  const label = muted ? 'Ativar som' : 'Silenciar';
  return (
    <button type="button" onClick={() => setMuted(!muted)} aria-label={label} title={label} aria-pressed={muted} className={btn}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" />
        {muted ? (
          <>
            <path d="m23 9-6 6" />
            <path d="m17 9 6 6" />
          </>
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5a10 10 0 0 1 0 14" />
          </>
        )}
      </svg>
    </button>
  );
}
