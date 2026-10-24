import type {
  ChatMessage,
  HandHistoryEntry,
  PlayerProfile,
  ClientTableState,
  HandResult,
  HandView,
  LegalActions,
  ScoreRow,
  SeatView,
} from '@poker/engine';

export type MockVariant = 'play' | 'result' | 'split';

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

// Diego's trips take the main pot; Ana beats Bruno's pair of jacks on the kicker for the side pot.
const result: HandResult = {
  pots: [
    { amount: 360, winners: [3], handName: "Three of a Kind, 8's", decision: { runnerUp: 0 } },
    { amount: 320, winners: [0], handName: "Pair, J's", decision: { runnerUp: 1, cardIndex: 2 } },
  ],
  payouts: { 0: 320, 3: 360 },
  names: { 0: 'Ana', 1: 'Bruno', 2: 'Carla', 3: 'Diego', 5: 'Elisa' },
  showdown: {
    0: { cards: ['Jh', 'Kd'], handName: "Pair, J's", category: 'pair', best: ['Jh', 'Jc', 'Kd', '8d', '5s'] },
    1: { cards: ['Js', 'Qd'], handName: "Pair, J's", category: 'pair', best: ['Js', 'Jc', 'Qd', '8d', '5s'] },
    3: { cards: ['8h', '8s'], handName: "Three of a Kind, 8's", category: 'trips', best: ['8h', '8s', '8d', 'Jc', '5s'] },
  },
};

// Both play the flush on the board.
const split: HandResult = {
  pots: [{ amount: 400, winners: [0, 1], handName: 'Flush, Ah High', decision: {} }],
  payouts: { 0: 200, 1: 200 },
  names: { 0: 'Ana', 1: 'Bruno', 2: 'Carla', 3: 'Diego', 5: 'Elisa' },
  showdown: {
    0: { cards: ['3c', '4d'], handName: 'Flush, Ah High', category: 'flush', best: ['Ah', 'Kh', '9h', '7h', '2h'] },
    1: { cards: ['Qs', 'Qd'], handName: 'Flush, Ah High', category: 'flush', best: ['Ah', 'Kh', '9h', '7h', '2h'] },
  },
};

export function mockState(variant: MockVariant): ClientTableState {
  const finished = variant !== 'play';
  const res = variant === 'result' ? result : variant === 'split' ? split : null;
  const shown = (i: number) => res?.showdown[i]?.cards ?? null;
  const bet = (n: number) => (finished ? 0 : n);
  const seats = [
    seat(0, { name: 'Ana', stack: variant === 'result' ? 1240 : 920, committedThisStreet: bet(40), holeCards: shown(0) ?? ['Jh', 'Kd'], hasCards: true }),
    seat(1, { name: 'Bruno', stack: 1500, committedThisStreet: bet(200), hasCards: true, holeCards: shown(1) }),
    seat(2, { name: 'Carla', stack: 640, folded: true }),
    seat(3, {
      name: 'Diego',
      stack: variant === 'result' ? 360 : 0,
      allIn: variant !== 'split',
      folded: variant === 'split',
      committedThisStreet: bet(120),
      hasCards: variant !== 'split',
      holeCards: shown(3),
    }),
    null,
    seat(5, { name: 'Elisa', stack: 1000, sittingOut: true, inHand: false }),
  ];

  const hand: HandView = {
    handNumber: 12,
    buttonSeat: 3,
    sbSeat: 0,
    bbSeat: 1,
    board: variant === 'split' ? ['Ah', 'Kh', '7h', '2h', '9h'] : finished ? ['Jc', '8d', '5s', '3h', '2c'] : ['Jc', '8d', '5s'],
    street: finished ? 'showdown' : 'flop',
    toAct: finished ? null : 0,
    currentBet: finished ? 0 : 200,
    pots: res
      ? res.pots.map((p) => ({ amount: p.amount, eligibleSeats: p.winners }))
      : [
          { amount: 340, eligibleSeats: [0, 1, 2, 3] },
          { amount: 120, eligibleSeats: [1, 2] },
        ],
    finished,
    result: res,
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
    tableName: 'Mesa K7QX',
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
    history: mockHistory(),
  };
}

export function mockHistory(): HandHistoryEntry[] {
  const now = Date.now();
  return [
    {
      handNumber: 11,
      at: now - 60_000,
      board: ['Ks', '9d', '4c', '4h', 'Ah'],
      pots: [{ amount: 480, winners: ['Bruno'] }],
      players: [
        { seat: 0, name: 'Ana', folded: false, net: -240, cards: ['Kh', 'Qd'], handName: "Two Pair, K's & 4's", category: 'two-pair', best: ['Kh', 'Ks', '4c', '4h', 'Ah'] },
        { seat: 1, name: 'Bruno', folded: false, net: 240, cards: ['As', 'Jc'], handName: "Two Pair, A's & 4's", category: 'two-pair', best: ['As', 'Ah', '4c', '4h', 'Ks'] },
        { seat: 2, name: 'Carla', folded: true, net: 0, cards: null, handName: null, category: null, best: null },
        { seat: 3, name: 'Diego', folded: true, net: -10, cards: null, handName: null, category: null, best: null },
      ],
    },
    {
      handNumber: 10,
      at: now - 150_000,
      board: ['7c', '7d', '2s'],
      pots: [{ amount: 60, winners: ['Diego'] }],
      players: [
        { seat: 0, name: 'Ana', folded: true, net: -20, cards: null, handName: null, category: null, best: null },
        { seat: 1, name: 'Bruno', folded: true, net: -10, cards: null, handName: null, category: null, best: null },
        { seat: 3, name: 'Diego', folded: false, net: 30, cards: null, handName: null, category: null, best: null },
      ],
    },
  ];
}

export function mockProfile(playerId: string): PlayerProfile {
  const names: Record<string, string> = { p0: 'Ana', p1: 'Bruno', p2: 'Carla', p3: 'Diego', p5: 'Elisa', p9: 'Fábio' };
  const day = 86_400_000;
  const now = Date.now();
  const amounts = [240, -120, 0, 75, -300, 410, -45, 30, -10, 160];
  return {
    name: names[playerId] ?? 'Jogador',
    month: new Date().toISOString().slice(0, 7),
    balance: playerId === 'p1' ? 1840 : -650,
    handsPlayed: 137,
    biggestPotWon: 1260,
    recent: amounts.map((amount, i) => ({ at: now - i * 0.37 * day, table: i < 4 ? 'Mesa K7QX' : 'Mesa P3MZ', amount })),
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
