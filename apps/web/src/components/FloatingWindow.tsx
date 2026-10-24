import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

const MARGIN = 8;

interface Saved {
  x: number;
  y: number;
  opacity: number;
  minimized: boolean;
}

function load(key: string): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

function save(key: string, value: Saved) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the window just forgets its place.
  }
}

interface Props {
  title: string;
  /** Shown next to the title while minimized, e.g. a count of items waiting. */
  badge?: ReactNode;
  /** localStorage key for position, opacity and minimized state. */
  storageKey: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Movable window over the table. Opaque while in use; when the player goes back to the game it fades to the
 * opacity chosen on its slider, so new messages stay readable without hiding the table.
 */
export default function FloatingWindow({ title, badge, storageKey, onClose, children }: Props) {
  const saved = useRef(load(storageKey)).current;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(
    typeof saved.x === 'number' && typeof saved.y === 'number' ? { x: saved.x, y: saved.y } : null,
  );
  const [opacity, setOpacity] = useState(typeof saved.opacity === 'number' ? saved.opacity : 0.6);
  const [minimized, setMinimized] = useState(saved.minimized === true);
  const [focused, setFocused] = useState(true);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const clamp = (x: number, y: number) => {
    const w = ref.current?.offsetWidth ?? 320;
    return {
      x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      // Keep at least the title bar on screen so the window can always be dragged back.
      y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, window.innerHeight - 48)),
    };
  };

  // First open: top right, below the table header.
  useEffect(() => {
    if (pos) return setPos((p) => p && clamp(p.x, p.y));
    const w = ref.current?.offsetWidth ?? 360;
    setPos(clamp(window.innerWidth - w - 12, 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pos) save(storageKey, { ...pos, opacity, minimized });
  }, [pos, opacity, minimized, storageKey]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => setFocused(!!ref.current?.contains(e.target as Node));
    const onResize = () => setPos((p) => p && clamp(p.x, p.y));
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, label')) return;
    const rect = ref.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      onFocusCapture={() => setFocused(true)}
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, opacity: focused ? 1 : opacity, visibility: pos ? 'visible' : 'hidden' }}
      className={`fixed z-40 flex w-[min(400px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-white/15 shadow-2xl backdrop-blur-md transition-opacity duration-200 ${
        focused ? 'bg-slate-900/90' : 'bg-slate-900/70'
      } ${minimized ? '' : 'h-[min(560px,calc(100dvh-80px))]'}`}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex cursor-move touch-none select-none items-center gap-2 border-b border-white/10 px-3 py-1.5"
      >
        <span aria-hidden className="text-slate-400">
          ⠿
        </span>
        <h2 className="flex flex-1 items-center truncate text-sm font-bold">
          {title}
          {minimized && badge}
        </h2>
        {!minimized && (
          <label className="flex items-center gap-1 text-[11px] text-slate-300" title="Opacidade quando você volta para o jogo">
            <span aria-hidden>◐</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              aria-label="Opacidade fora de foco"
              className="w-16 accent-amber-400"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? 'Restaurar' : 'Minimizar'}
          className="rounded-md px-2 py-0.5 text-slate-200 hover:bg-white/10"
        >
          {minimized ? '▢' : '–'}
        </button>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md px-2 py-0.5 text-slate-200 hover:bg-white/10">
          ✕
        </button>
      </div>
      {!minimized && <div className="flex min-h-0 flex-1 flex-col">{children}</div>}
    </div>
  );
}
