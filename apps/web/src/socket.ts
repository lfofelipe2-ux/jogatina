import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/engine';
import { reloadIfLoggedOut } from './lib/loginGuard';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: AppSocket = io({ autoConnect: true });

let checking = false;
socket.on('connect_error', () => {
  if (checking) return;
  checking = true;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Blocked storage: reloadIfLoggedOut then leaves the tab alone.
  }
  void reloadIfLoggedOut({
    fetch: (url) => fetch(url, { cache: 'no-store' }),
    reload: () => window.location.reload(),
    now: () => Date.now(),
    storage,
  }).finally(() => {
    checking = false;
  });
});
