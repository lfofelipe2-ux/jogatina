import type { Card as CardCode } from '@poker/engine';

// Classic SVG faces (see assets/cards/NOTICE). Vite emits each one as its own file,
// so a face is only downloaded when a card shows it.
const FACES = import.meta.glob<string>('../assets/cards/*.svg', { eager: true, query: '?url', import: 'default' });

const faceUrl = (card: CardCode) =>
  FACES[`../assets/cards/${card[0] === 'T' ? '10' : card[0]}${card[1].toUpperCase()}.svg`];

// Widths come from --card-xs / --card-md when a parent sets them (the table scales them
// with its width); the fallbacks fit the showdown panel. Height follows the deck's ratio.
const SIZE = {
  xs: 'w-[var(--card-xs,34px)] sm:w-[var(--card-xs,40px)]',
  md: 'w-[var(--card-md,44px)] sm:w-[var(--card-md,56px)]',
};

/** made: part of the named hand; win/lose: the card that decided a tie; dim: an unused kicker. */
export type CardTone = 'made' | 'win' | 'lose' | 'dim';

const TONE: Record<CardTone, string> = {
  made: 'ring-2 ring-amber-400',
  win: 'ring-2 ring-emerald-400',
  lose: 'ring-2 ring-red-400',
  dim: 'opacity-55',
};

const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

// Suit glyphs for the large index, drawn as paths so no platform swaps in a colour emoji.
const SUIT_PATH: Record<string, JSX.Element> = {
  s: <path d="M12 1.5C9 6 3 9.6 3 14.2a4.6 4.6 0 0 0 8.1 3L10 22.5h4l-1.1-5.3A4.6 4.6 0 0 0 21 14.2c0-4.6-6-8.2-9-12.7z" />,
  h: <path d="M12 21.8l-1.4-1.3C5.4 15.8 2 12.7 2 8.9 2 5.8 4.4 3.4 7.5 3.4c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.6L12 21.8z" />,
  d: <path d="M12 1.5l8 10.5-8 10.5L4 12z" />,
  c: (
    <>
      <circle cx="12" cy="6.6" r="4.6" />
      <circle cx="6.6" cy="14" r="4.6" />
      <circle cx="17.4" cy="14" r="4.6" />
      <path d="M12 9l-2.2 13.5h4.4z" />
    </>
  ),
};

interface Props {
  card?: CardCode;
  back?: boolean;
  slot?: boolean;
  size?: keyof typeof SIZE;
  /** Turn the card face up with a flip when it appears. */
  flip?: boolean;
  tone?: CardTone;
}

export default function Card({ card, back, slot, size = 'xs', flip, tone }: Props) {
  const base = `${SIZE[size]} aspect-[167/243] shrink-0 rounded-[4px] sm:rounded-md`;
  if (back) return <div className={`${base} card-back border border-blue-900/80`} />;
  if (!card) {
    return slot ? <div className={`${base} border border-dashed border-emerald-100/25`} /> : null;
  }
  const red = card[1] === 'h' || card[1] === 'd';
  const rank = card[0] === 'T' ? '10' : card[0];
  return (
    <div
      role="img"
      aria-label={`${rank}${SUIT[card[1]]}`}
      className={`${base} relative overflow-hidden bg-white shadow-md [container-type:inline-size] ${
        flip ? 'fx-flip' : ''
      } ${tone ? TONE[tone] : ''}`}
    >
      <img src={faceUrl(card)} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
      {/* Large index over the deck's small corner one, readable at seat size. */}
      <div
        className={`absolute left-[3cqw] top-[3cqw] flex w-[44cqw] flex-col items-center rounded-br-[10cqw] bg-white pb-[3cqw] font-extrabold leading-none ${
          red ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        <span className={rank === '10' ? 'text-[36cqw] tracking-[-0.08em]' : 'text-[46cqw]'}>{rank}</span>
        <svg viewBox="0 0 24 24" aria-hidden className="mt-[1cqw] h-[30cqw] w-[30cqw] fill-current">
          {SUIT_PATH[card[1]]}
        </svg>
      </div>
    </div>
  );
}
