import type { ClientTableState, HandResult } from '@poker/engine';
import Card from './Card';
import Seat, { type Tag } from './Seat';
import { useGame } from './GameContext';
import { fmt, joinNames, STREET_LABEL } from '../lib/format';

const RX = 36;
const RY = 36;

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
    return { x: 50 + RX * Math.cos(a), y: 50 + RY * Math.sin(a) };
  };

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
    <div className="flex flex-col gap-2">
      {hand?.finished && hand.result && <ResultBanner result={hand.result} nameOf={nameOf} />}
      <div className="relative mx-auto aspect-[4/5] w-full sm:aspect-[16/11]">
        <div className="felt absolute inset-x-[3%] inset-y-[8%] rounded-[50%] border-[12px] border-emerald-950 shadow-[inset_0_0_30px_rgba(0,0,0,0.35),0_12px_30px_rgba(0,0,0,0.45)]" />

        <div className="absolute left-1/2 top-1/2 flex w-[56%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center">
          {hand ? (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-100/80">
                {STREET_LABEL[hand.street]}
              </span>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Card key={i} card={hand.board[i]} size="md" slot />
                ))}
              </div>
              <div className="text-xs font-semibold tabular-nums text-white">
                {hand.pots.length === 0 && <div>Pote: 0</div>}
                {hand.pots.map((p, i) => (
                  <div key={i}>
                    {i === 0 ? 'Pote' : `Pote paralelo ${i}`}: {fmt(p.amount)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <span className="text-xs text-emerald-100/80">
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
            />
          );
        })}

        {table.seats.map((view, seat) => {
          if (!view || view.committedThisStreet <= 0) return null;
          const p = pos(seat);
          return (
            <div
              key={`bet${seat}`}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums text-slate-900 shadow"
              style={{ left: `${p.x + (50 - p.x) * 0.5}%`, top: `${p.y + (50 - p.y) * 0.5}%` }}
            >
              {fmt(view.committedThisStreet)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultBanner({ result, nameOf }: { result: HandResult; nameOf: (seat: number) => string }) {
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-center text-sm text-amber-100">
      {result.pots.map((pot, i) => (
        <p key={i}>
          {joinNames(pot.winners.map(nameOf))} {pot.winners.length > 1 ? 'dividem' : 'ganha'} {fmt(pot.amount)}
          {pot.handName ? ` com ${pot.handName}` : ' (todos desistiram)'}
        </p>
      ))}
    </div>
  );
}
