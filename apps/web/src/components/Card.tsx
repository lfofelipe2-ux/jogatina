import type { Card as CardCode } from '@poker/engine';

const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

const SIZE = {
  xs: 'h-9 w-6 text-[10px] sm:h-11 sm:w-8 sm:text-xs',
  md: 'h-[3.25rem] w-9 text-sm sm:h-16 sm:w-12 sm:text-base',
};

interface Props {
  card?: CardCode;
  back?: boolean;
  slot?: boolean;
  size?: keyof typeof SIZE;
}

export default function Card({ card, back, slot, size = 'xs' }: Props) {
  const base = `${SIZE[size]} shrink-0 rounded-[4px] sm:rounded-md`;
  if (back) return <div className={`${base} card-back border border-blue-900/80`} />;
  if (!card) {
    return slot ? <div className={`${base} border border-dashed border-emerald-100/25`} /> : null;
  }
  const red = card[1] === 'h' || card[1] === 'd';
  return (
    <div
      className={`${base} flex flex-col items-center justify-center bg-white font-bold leading-none shadow-md ${
        red ? 'text-red-600' : 'text-slate-900'
      }`}
    >
      <span>{card[0] === 'T' ? '10' : card[0]}</span>
      <span>{SUIT[card[1]]}</span>
    </div>
  );
}
