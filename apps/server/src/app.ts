import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { EngineError, type ClientToServerEvents, type ServerToClientEvents, type SimpleResponse } from '@poker/engine';
import { GifService, UpstreamBusy } from './gifs';
import { forwardedEmail } from './identity';
import type { Ledger } from './ledger';
import { createRequests, type RequestsOptions } from './requestsApi';
import { TableManager } from './tableManager';
import { UserError, type AppSocket, type SocketData, type TableRoom } from './tableRoom';

const RATE_WINDOW_MS = 1000;
const RATE_MAX = 10;
const GIF_WINDOW_MS = 10_000;
const GIF_MAX_PER_WINDOW = 20;
const GIF_IPS_MAX = 10_000;
const OK: SimpleResponse = { ok: true };

const REPLACED_MESSAGE = 'Sua conta entrou na mesa em outra aba ou aparelho. Esta sessão foi encerrada.';
const REPLACED_DISCONNECT_MS = 200;

type RotateResponse = { ok: true; tableId: string } | { ok: false; error: string };

function failureMessage(e: unknown): string {
  if (e instanceof UserError || e instanceof EngineError) return e.message;
  console.error('[server]', e);
  return 'Erro interno';
}

function allow(socket: AppSocket): boolean {
  const now = Date.now();
  socket.data.hits = socket.data.hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (socket.data.hits.length >= RATE_MAX) return false;
  socket.data.hits.push(now);
  return true;
}

function invoke<T extends { ok: boolean }>(
  socket: AppSocket,
  ack: ((r: T) => void) | undefined,
  fn: () => T,
): void {
  let res: T;
  if (!allow(socket)) {
    res = { ok: false, error: 'Devagar' } as unknown as T;
  } else {
    try {
      res = fn();
    } catch (e) {
      res = { ok: false, error: failureMessage(e) } as unknown as T;
    }
  }
  if (typeof ack === 'function') ack(res);
}

function roomOf(socket: AppSocket): { room: TableRoom; playerId: string } {
  const room = socket.data.room;
  const playerId = socket.data.playerId;
  if (!room || !playerId || !room.has(playerId)) throw new UserError('Entre em uma mesa primeiro');
  return { room, playerId };
}

export function createApp({
  gifs = new GifService(),
  ledger,
  requests: requestOpts,
}: { gifs?: GifService; ledger?: Ledger; requests?: RequestsOptions } = {}) {
  const app = express();
  // Caddy (loopback or the Docker network) appends the visitor to X-Forwarded-For after checking Cloudflare's ranges.
  app.set('trust proxy', 'loopback, uniquelocal');
  const httpServer = createServer(app);
  const manager = new TableManager(ledger);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer);
  const requests = requestOpts ? createRequests(io, manager, requestOpts) : undefined;

  app.get('/health', (_req, res) => {
    res.json({ ok: true, tables: manager.size, players: manager.connectedPlayers() });
  });

  /** Lobby: open tables, read-only. In production oauth2-proxy only lets signed-in users reach this. */
  app.get('/api/tables', (_req, res) => {
    res.json({ ok: true, tables: manager.list() });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ gifs: gifs.enabled });
  });

  const gifHits = new Map<string, number[]>();
  app.get('/api/gifs', async (req, res) => {
    if (!gifs.enabled) return void res.status(404).json({ ok: false, error: 'GIFs desativados' });
    const ip = req.ip ?? '';
    const now = Date.now();
    const hits = (gifHits.get(ip) ?? []).filter((t) => now - t < GIF_WINDOW_MS);
    if (hits.length >= GIF_MAX_PER_WINDOW) return void res.status(429).json({ ok: false, error: 'Devagar' });
    hits.push(now);
    gifHits.delete(ip);
    gifHits.set(ip, hits);
    if (gifHits.size > GIF_IPS_MAX) gifHits.delete(gifHits.keys().next().value!);
    try {
      res.json({ ok: true, results: await gifs.search(typeof req.query.q === 'string' ? req.query.q : '') });
    } catch (e) {
      if (e instanceof UpstreamBusy) return void res.status(429).json({ ok: false, error: e.message });
      console.error('[gifs]', e);
      res.status(502).json({ ok: false, error: 'Busca de GIFs indisponível' });
    }
  });

  if (requests) app.use(requests.shots);

  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  const indexHtml = path.join(webDist, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(indexHtml));
  }

  /** Single session per account: identity -> the socket that joined most recently. */
  const sessions = new Map<string, AppSocket>();
  const claimSession = (socket: AppSocket) => {
    const identity = socket.data.playerId ? socket.data.room?.identityOf(socket.data.playerId) : undefined;
    if (!identity) return;
    const old = sessions.get(identity);
    sessions.set(identity, socket);
    socket.data.identity = identity;
    if (!old || old === socket || !old.connected) return;
    old.data.identity = undefined;
    try {
      old.data.room?.detach(old);
    } catch (e) {
      console.error('[server]', e);
    }
    old.emit('sessionReplaced', { message: REPLACED_MESSAGE });
    setTimeout(() => old.disconnect(true), REPLACED_DISCONNECT_MS);
  };

  io.on('connection', (socket: AppSocket) => {
    socket.data.hits = [];
    socket.data.email = forwardedEmail(socket.handshake.headers);

    requests?.attach(socket, <T extends { ok: boolean }>(ack: ((r: T) => void) | undefined, fn: () => T) =>
      invoke(socket, ack, fn),
    );

    socket.on('createTable', (req, ack) => invoke(socket, ack, () => manager.create(req)));

    socket.on('joinTable', (req, ack) => invoke(socket, ack, () => {
      const room = manager.find(req?.tableId);
      if (!room) throw new UserError('Mesa não encontrada');
      if (socket.data.room && socket.data.room !== room) throw new UserError('Esta conexão já está em uma mesa');
      const res = room.join(socket, req);
      if (res.ok) claimSession(socket);
      return res;
    }));

    socket.on('profile:get', (req, ack) => invoke(socket, ack, () => {
      const { room } = roomOf(socket);
      return { ok: true as const, profile: room.profile(req?.playerId) };
    }));

    socket.on('sit', (req, ack) => invoke<SimpleResponse>(socket, ack, () => {
      const { room, playerId } = roomOf(socket);
      room.sit(playerId, req?.seat);
      return OK;
    }));

    socket.on('standUp', (ack) => invoke<SimpleResponse>(socket, ack, () => {
      const { room, playerId } = roomOf(socket);
      room.standUp(playerId);
      return OK;
    }));

    socket.on('action', (req, ack) => invoke<SimpleResponse>(socket, ack, () => {
      const { room, playerId } = roomOf(socket);
      room.action(playerId, req ?? {});
      return OK;
    }));

    socket.on('host:start', (ack) => invoke<SimpleResponse>(socket, ack, () => {
      const { room, playerId } = roomOf(socket);
      room.start(playerId);
      return OK;
    }));

    socket.on('host:kick', (req, ack) => invoke<SimpleResponse>(socket, ack, () => {
      const { room, playerId } = roomOf(socket);
      room.kick(playerId, req?.playerId);
      return OK;
    }));

    socket.on('host:rotateLink', (ack) => invoke<RotateResponse>(socket, ack, () => {
      const { room, playerId } = roomOf(socket);
      room.assertHost(playerId);
      const tableId = manager.rotate(room);
      room.announceLink();
      return { ok: true, tableId };
    }));

    socket.on('chat:send', (req, ack) => invoke<SimpleResponse>(socket, ack, () => {
      const { room, playerId } = roomOf(socket);
      room.chat(playerId, req, (raw) => gifs.verify(raw));
      return OK;
    }));

    socket.on('disconnect', () => {
      const identity = socket.data.identity;
      if (identity && sessions.get(identity) === socket) sessions.delete(identity);
      try {
        socket.data.room?.detach(socket);
      } catch (e) {
        console.error('[server]', e);
      }
    });
  });

  return { httpServer, io, manager, internalApp: requests?.internal };
}
