import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/engine';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: AppSocket = io({ autoConnect: true });

/** The login proxy answers 401 when the session has expired; reload so the user is sent to sign in. */
socket.on('connect_error', (err: Error & { description?: unknown }) => {
  const desc = err.description;
  // Polling fallback reports the XMLHttpRequest, not the bare status code.
  const status = typeof desc === 'number' ? desc : (desc as { status?: unknown } | undefined)?.status;
  if (status === 401) window.location.reload();
});
