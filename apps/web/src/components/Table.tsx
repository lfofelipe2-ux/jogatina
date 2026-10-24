import type { ClientTableState } from '@poker/engine';
import Card from './Card';
import Seat, { type Tag } from './Seat';
import ShowdownPanel from './ShowdownPanel';
import { Countdown } from './Timer';
import { useGame } from './GameContext';
import { useTableFx, type BadgeTone, type Pt } from './useTableFx';
import { fmt, STREET_LABEL } from '../lib/format';

// Seats sit on the felt rim, with a small inset (percent of the table box).
const RX = 40;
const RY = 40;
const POT: Pt = { left: '50%', top: '46%' };

const BADGE_TONE: Record<BadgeTone, string> = {
  allin: 'bg-red-600 text-white ring-red-300/70',
  pot: 'bg-amber-400 text-slate-900 ring-amber-200/80',
  rare: 'bg-fuchsia-600 text-white ring-fuchsia-300/70',
};

export default function Table({ state }: { state: ClientTableState }) {
  const { api, toast } = useGame();
  const { table, you } = state;
  const hand = table.hand;
  const n = table.config.maxSeats;
  const mySeat = you.seat ?? 0;
  const toActSeat = hand && !hand.finished ? hand.toAct : null;

  const nameOf = (seat: number) =>
    hand?.result?.names?.[seat] ?? table.seats[seat]?.name ?? 'Jogador';

  const pos = (seat: number) => {
    const rel = (seat - mySeat + n) % n;
    const a = Math.PI / 2 + (rel * 2 * Math.PI) / n;
    return { x: 50 + RX * Math.cos(a), y: 50 + RY * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) };
  };

  // Bet chips sit on the seat-to-centre line, offset by a share of the table width
  // (with a pixel floor), so they never land on the seat, the board or the pot pill.
  const chipStyle = (seat: number) => {
    const p = pos(seat);
    const side = Math.abs(p.cos) > 0.3;
    const dx = side ? -Math.sign(p.cos) : 0;
    const dy = side ? 0 : -Math.sign(p.sin);
    return {
      left: `calc(${p.x}% + ${dx} * var(--chip-dx))`,
      top: `calc(${p.y}% + ${dy} * (${p.sin > 0 ? 'var(--chip-dy-bottom)' : 'var(--chip-dy-top)'}))`,
    };
  };

  const seatPt = (seat: number): Pt => {
    const p = pos(seat);
    return { left: `${p.x}%`, top: `${p.y}%` };
  };
  const { flyers, badges, dealDelays } = useTableFx(state, { seatPt, betPt: chipStyle, potPt: POT });
  const payouts = hand?.finished ? hand.result?.payouts : undefined;

  const tagsOf = (seat: number): Tag[] => {
    if (!hand) return [];
    const tags: Tag[] = [];
    if (hand.buttonSeat === seat) tags.push('D');
    if (hand.sbSeat === seat) tags.push('SB');
    if (hand.bbSeat === seat) tags.push('BB');
    return tags;
  };

  const sit = async (seat: number) => {
    const res = await api.sit(seat);
    if (!res.ok) toast(res.error);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {hand?.finished && hand.result && <ShowdownPanel result={hand.result} nameOf={nameOf} />}
      <div className="relative grid min-h-0 flex-1 place-items-center [container-type:size]">
        <div className="table-box relative [container-type:inline-size] [--chip-dx:max(66px,10cqw)] [--chip-dy-bottom:max(80px,11.5cqw)] [--chip-dy-top:max(62px,10cqw)]">
          <div className="felt absolute inset-[4%] rounded-[50%] border-[12px] border-emerald-950 shadow-[inset_0_0_30px_rgba(0,0,0,0.35),0_12px_30px_rgba(0,0,0,0.45)] sm:inset-x-[3%] sm:inset-y-[6%]" />

          <div className="absolute left-1/2 top-[46%] flex w-[60%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center sm:top-1/2">
            {toActSeat !== null && toActSeat === you.seat && state.actionDeadline !== null && (
              <Countdown
                deadline={state.actionDeadline}
                className="absolute bottom-full mb-1 text-6xl leading-none text-red-400 [text-shadow:0_2px_8px_rgba(0,0,0,0.6)]"
              />
            )}
            {hand ? (
              <>
                <div className="pot-pill whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold sm:px-2.5 sm:text-xs tabular-nums text-white">
                  {hand.pots.length === 0 && <span>Pote: 0</span>}
                  {hand.pots.map((p, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-emerald-200"> · </span>}
                      {i === 0 ? (
                        'Pote'
                      ) : (
                        <>
                          <span className="sm:hidden">Paralelo</span>
                          <span className="hidden sm:inline">Pote paralelo</span> {i}
                        </>
                      )}
                      : {fmt(p.amount)}
                    </span>
                  ))}
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-50">
                  {STREET_LABEL[hand.street]}
                </span>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Card key={i} card={hand.board[i]} size="md" slot flip />
                  ))}
                </div>
              </>
            ) : (
              <span className="text-xs text-emerald-50">
                {state.started ? 'Aguardando a próxima mão' : ''}
              </span>
            )}
          </div>

          {table.seats.map((view, seat) => {
            const p = pos(seat);
            const active = toActSeat === seat;
            return (
              <Seat
                key={seat}
                seat={seat}
                x={p.x}
                y={p.y}
                view={view}
                isYou={you.seat === seat}
                tags={tagsOf(seat)}
                toAct={active}
                deadline={active ? state.actionDeadline : null}
                timeoutSec={state.config.actionTimeoutSec}
                canSit={you.seat === null}
                onSit={sit}
                won={payouts?.[seat]}
                handKey={hand?.handNumber}
                dealDelay={dealDelays[seat]}
              />
            );
          })}

          {table.seats.map((view, seat) => {
            if (!view || view.committedThisStreet <= 0) return null;
            return (
              <div
                key={`bet${seat}-${view.committedThisStreet}`}
                className="fx-slide absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-amber-500 px-1.5 py-0.5 text-xs font-bold leading-none tabular-nums text-slate-900 shadow"
                style={flyVars(seatPt(seat), chipStyle(seat))}
              >
                {fmt(view.committedThisStreet)}
              </div>
            );
          })}

          {flyers.map((f) => (
            <div
              key={f.id}
              aria-hidden
              className={`fx-fly pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 ${
                f.kind === 'card'
                  ? 'card-back h-9 w-6 rounded-[4px] border border-blue-900/80 shadow-md sm:h-11 sm:w-8'
                  : 'h-4 w-4 rounded-full border-2 border-dashed border-amber-100 bg-amber-500 shadow'
              }`}
              style={{ ...flyVars(f.from, f.to), animationDelay: `${f.delay}ms` }}
            />
          ))}

          {badges.length > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-[27%] z-40 flex -translate-x-1/2 flex-col items-center gap-1 sm:top-[24%]">
              {badges.map((b) => (
                <span
                  key={b.id}
                  className={`fx-badge whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide shadow-lg ring-2 sm:text-sm ${BADGE_TONE[b.tone]}`}
                >
                  {b.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Start and end points for the fx-fly / fx-slide keyframes; the end point is also the resting position. */
function flyVars(from: Pt, to: Pt) {
  return {
    left: to.left,
    top: to.top,
    '--x0': from.left,
    '--y0': from.top,
    '--x1': to.left,
    '--y1': to.top,
  } as React.CSSProperties;
}
