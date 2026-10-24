import type { ActionType, ChatInput, ProfileResponse, SimpleResponse } from '@poker/engine';
import { socket, type AppSocket } from './socket';

export type RotateResponse = { ok: true; tableId: string } | { ok: false; error: string };

export interface GameApi {
  sit(seat: number): Promise<SimpleResponse>;
  standUp(): Promise<SimpleResponse>;
  action(type: ActionType, amount?: number): Promise<SimpleResponse>;
  start(): Promise<SimpleResponse>;
  kick(playerId: string): Promise<SimpleResponse>;
  rotateLink(): Promise<RotateResponse>;
  chat(input: ChatInput): Promise<SimpleResponse>;
  profile(playerId: string): Promise<ProfileResponse>;
}

const TIMEOUT_MS = 10_000;
const FAIL = { ok: false, error: 'Sem resposta do servidor.' } as const;
const OFFLINE = { ok: false, error: 'Sem conexão com o servidor.' } as const;

function call<T>(s: AppSocket, run: (ack: (res: T) => void) => void, fallback: T, offline: T): Promise<T> {
  if (!s.connected) return Promise.resolve(offline);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), TIMEOUT_MS);
    run((res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export function createSocketApi(s: AppSocket): GameApi {
  const simple = (run: (ack: (res: SimpleResponse) => void) => void) =>
    call<SimpleResponse>(s, run, FAIL, OFFLINE);

  return {
    sit: (seat) => simple((ack) => s.emit('sit', { seat }, ack)),
    standUp: () => simple((ack) => s.emit('standUp', ack)),
    action: (type, amount) => simple((ack) => s.emit('action', { type, amount }, ack)),
    start: () => simple((ack) => s.emit('host:start', ack)),
    kick: (playerId) => simple((ack) => s.emit('host:kick', { playerId }, ack)),
    rotateLink: () => call<RotateResponse>(s, (ack) => s.emit('host:rotateLink', ack), FAIL, OFFLINE),
    chat: (input) => simple((ack) => s.emit('chat:send', input, ack)),
    profile: (playerId) => call<ProfileResponse>(s, (ack) => s.emit('profile:get', { playerId }, ack), FAIL, OFFLINE),
  };
}

export const socketApi = createSocketApi(socket);
