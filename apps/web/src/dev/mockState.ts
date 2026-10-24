import type {
  ChatMessage,
  ClientTableState,
  HandResult,
  HandView,
  LegalActions,
  ScoreRow,
  SeatView,
} from '@poker/engine';

export type MockVariant = 'play' | 'result';

const seat = (i: number, o: Partial<SeatView> & Pick<SeatView, 'name' | 'stack'>): SeatView => ({
  seat: i,
  playerId: `p${i}`,
  sittingOut: false,
  inHand: true,
  folded: false,
  allIn: false,
  committedThisStreet: 0,
  holeCards: null,
  hasCards: false,
  ...o,
});

const row = (name: string, stack: number, invested: number, handsPlayed: number, handsWon: number, biggestPot: number): ScoreRow => ({
  name,
  stack,
  invested,
  net: stack - invested,
  handsPlayed,
  handsWon,
  biggestPot,
});

const result: HandResult = {
  pots: [
    { amount: 340, winners: [1], handName: "Two Pair, K's & 7's" },
    { amount: 120, winners: [0, 1], handName: "One Pair, A's" },
  ],
  payouts: { 0: 60, 1: 400 },
  names: { 0: 'Ana', 1: 'Bruno' },
  showdown: {
    0: { cards: ['As', 'Td'], handName: "One Pair, A's" },
    1: { cards: ['Kh', 'Kc'], handName: "Two Pair, K's & 7's" },
  },
};

export function mockState(variant: MockVariant): ClientTableState {
  const finished = variant === 'result';
  const seats = [
    seat(0, { name: 'Ana', stack: 920, committedThisStreet: 40, holeCards: ['As', 'Td'], hasCards: true }),
    seat(1, { name: 'Bruno', stack: 1500, committedThisStreet: 200, hasCards: true, holeCards: finished ? ['Kh', 'Kc'] : null }),
    seat(2, { name: 'Carla', stack: 640, folded: true }),
    seat(3, { name: 'Diego', stack: 0, allIn: true, committedThisStreet: 120, hasCards: true, holeCards: finished ? ['Qd', 'Qs'] : null }),
    null,
    seat(5, { name: 'Elisa', stack: 1000, sittingOut: true, inHand: false }),
  ];

  const hand: HandView = {
    handNumber: 12,
    buttonSeat: 3,
    sbSeat: 0,
    bbSeat: 1,
    board: finished ? ['Ah', 'Kd', '7c', '2s', '9h'] : ['Ah', 'Kd', '7c'],
    street: finished ? 'showdown' : 'flop',
    toAct: finished ? null : 0,
    currentBet: 200,
    pots: [
      { amount: 340, eligibleSeats: [0, 1, 2, 3] },
      { amount: 120, eligibleSeats: [1, 2] },
    ],
    finished,
    result: finished ? result : null,
  };

  const legal: LegalActions | null =
    variant === 'play'
      ? { seat: 0, canFold: true, canCheck: false, callAmount: 160, canBet: false, canRaise: true, minTo: 400, maxTo: 960 }
      : null;

  const names = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa'];
  const scoreboard = Object.fromEntries(
    [
      row('Ana', 920, 1000, 12, 3, 180),
      row('Bruno', 1500, 1000, 12, 5, 340),
      row('Carla', 640, 1000, 12, 2, 120),
      row('Diego', 0, 1000, 12, 1, 260),
      row('Elisa', 1000, 1000, 4, 0, 0),
    ].map((r) => [r.name, r]),
  );

  return {
    tableId: 'mock',
    serverNow: Date.now(),
    config: { maxSeats: 6, smallBlind: 5, bigBlind: 10, startingStack: 1000, actionTimeoutSec: 30 },
    table: {
      config: { maxSeats: 6, smallBlind: 5, bigBlind: 10 },
      seats,
      hand,
    },
    you: { playerId: 'p0', name: 'Ana', seat: 0, isHost: true },
    legal,
    actionDeadline: variant === 'play' ? Date.now() + 18000 : null,
    started: true,
    scoreboard,
    online: [
      ...names.map((name, i) => ({ playerId: `p${i}`, name, seat: i === 4 ? null : i === 2 ? 2 : i, connected: name !== 'Elisa' })),
      { playerId: 'p9', name: 'Fábio', seat: null, connected: true },
    ],
  };
}

export function mockChat(): ChatMessage[] {
  const now = Date.now();
  return [
    { id: 1, playerId: 'p1', name: 'Bruno', at: now - 60_000, body: { kind: 'text', text: 'Hoje eu levo tudo' } },
    { id: 2, playerId: 'p0', name: 'Ana', at: now - 40_000, body: { kind: 'taunt', text: 'Vai pagar pra ver?' } },
    { id: 3, playerId: 'p3', name: 'Diego', at: now - 1000, body: { kind: 'sticker', id: '1f602' } },
    { id: 4, playerId: 'p1', name: 'Bruno', at: now - 500, body: { kind: 'taunt', text: 'Blefe!' } },
  ];
}
