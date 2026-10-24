import { useEffect, useRef, useState } from 'react';
import type { ClientTableState } from '@poker/engine';
import { handLabel, RARE } from '../lib/hands';
import { fmt, joinNames } from '../lib/format';

/** A pot at or above this many big blinds gets the "Pote grande" badge. */
export const BIG_POT_BB = 30;

const BADGE_MS = 2800;
const DEAL_STEP_MS = 60;
const FLY_MS = 350;
const PAYOUT_DELAY_MS = 700;

export interface Pt {
  left: string;
  top: string;
}

export interface Flyer {
  id: string;
  kind: 'card' | 'chip';
  from: Pt;
  to: Pt;
  delay: number;
}

export type BadgeTone = 'allin' | 'pot' | 'rare';

export interface Badge {
  id: string;
  text: string;
  tone: BadgeTone;
}

export interface Geometry {
  seatPt: (seat: number) => Pt;
  betPt: (seat: number) => Pt;
  potPt: Pt;
}

/** Turns state transitions into short-lived flyers (dealt cards, chips) and event badges. */
export function useTableFx(state: ClientTableState, geo: Geometry) {
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [dealDelays, setDealDelays] = useState<Record<number, number>>({});
  const prev = useRef<ClientTableState | null>(null);
  const seen = useRef<{ hand: number; keys: Set<string> }>({ hand: -1, keys: new Set() });
  const timers = useRef<number[]>([]);
  const geoRef = useRef(geo);
  geoRef.current = geo;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const { seatPt, betPt, potPt } = geoRef.current;
    const before = prev.current;
    prev.current = state;
    const hand = state.table.hand;
    const seats = state.table.seats;
    if (!hand) return;

    const added: Flyer[] = [];
    const oldHand = before?.table.hand;
    const sameHand = oldHand?.handNumber === hand.handNumber;

    if (before && !sameHand && !hand.finished) {
      const n = seats.length;
      const order: number[] = [];
      for (let i = 1; i <= n; i++) {
        const s = (hand.buttonSeat + i) % n;
        if (seats[s]?.hasCards) order.push(s);
      }
      const delays: Record<number, number> = {};
      for (let round = 0; round < 2; round++) {
        order.forEach((s, i) => {
          const delay = (round * order.length + i) * DEAL_STEP_MS;
          added.push({ id: `deal${hand.handNumber}-${round}-${s}`, kind: 'card', from: seatPt(hand.buttonSeat), to: seatPt(s), delay });
          delays[s] = delay + FLY_MS;
        });
      }
      setDealDelays(delays);
    }

    if (before && sameHand && !oldHand!.finished && (oldHand!.street !== hand.street || hand.finished)) {
      before.table.seats.forEach((v, s) => {
        if (v && v.committedThisStreet > 0) {
          added.push({ id: `gather${hand.handNumber}-${oldHand!.street}-${s}`, kind: 'chip', from: betPt(s), to: potPt, delay: 0 });
        }
      });
      if (hand.finished && hand.result) {
        for (const s of Object.keys(hand.result.payouts).map(Number)) {
          added.push({ id: `pay${hand.handNumber}-${s}`, kind: 'chip', from: potPt, to: seatPt(s), delay: PAYOUT_DELAY_MS });
        }
      }
    }

    if (added.length) {
      setFlyers((f) => [...f, ...added]);
      const ids = new Set(added.map((a) => a.id));
      const last = Math.max(...added.map((a) => a.delay)) + FLY_MS + 100;
      later(last, () => setFlyers((f) => f.filter((x) => !ids.has(x.id))));
    }

    if (seen.current.hand !== hand.handNumber) seen.current = { hand: hand.handNumber, keys: new Set() };
    const keys = seen.current.keys;
    const fresh: Badge[] = [];
    const fire = (key: string, text: string, tone: BadgeTone) => {
      if (keys.has(key)) return;
      keys.add(key);
      fresh.push({ id: `${hand.handNumber}-${key}`, text, tone });
    };

    seats.forEach((v, s) => {
      if (v?.allIn) fire(`allin${s}`, `All-in: ${v.name}`, 'allin');
    });
    const total = hand.pots.reduce((sum, p) => sum + p.amount, 0);
    if (total >= BIG_POT_BB * state.config.bigBlind) fire('bigpot', `Pote grande: ${fmt(total)}`, 'pot');
    if (hand.result) {
      const byLabel = new Map<string, string[]>();
      for (const [s, sd] of Object.entries(hand.result.showdown)) {
        if (!sd.category || !sd.best || !RARE.includes(sd.category)) continue;
        const label = handLabel(sd.category, sd.best);
        byLabel.set(label, [...(byLabel.get(label) ?? []), hand.result.names[Number(s)] ?? 'Jogador']);
      }
      byLabel.forEach((names, label) => fire(`rare${label}`, `${label}! ${joinNames(names)}`, 'rare'));
    }

    if (fresh.length) {
      setBadges((b) => [...b, ...fresh]);
      const ids = new Set(fresh.map((b) => b.id));
      later(BADGE_MS, () => setBadges((b) => b.filter((x) => !ids.has(x.id))));
    }
  }, [state]);

  return { flyers, badges, dealDelays };
}
