import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { EngineError, type ClientToServerEvents, type ServerToClientEvents, type SimpleResponse } from '@poker/engine';
import { TableManager } from './tableManager';
import { UserError, type AppSocket, type SocketData, type TableRoom } from './tableRoom';

const RATE_WINDOW_MS = 1000;
const RATE_MAX = 10;
const OK: SimpleResponse = { ok: true };

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

export function createApp() {
  const app = express();
  const httpServer = createServer(app);
  const manager = new TableManager();
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, tables: manager.size, players: manager.connectedPlayers() });
  });

  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  const indexHtml = path.join(webDist, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(indexHtml));
  }

  io.on('connection', (socket: AppSocket) => {
    socket.data.hits = [];

    socket.on('createTable', (req, ack) => invoke(socket, ack, () => manager.create(req)));

    socket.on('joinTable', (req, ack) => invoke(socket, ack, () => {
      const room = manager.find(req?.tableId);
      if (!room) throw new UserError('Mesa não encontrada');
      if (socket.data.room && socket.data.room !== room) throw new UserError('Esta conexão já está em uma mesa');
      return room.join(socket, req);
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

    socket.on('disconnect', () => {
      try {
        socket.data.room?.detach(socket);
      } catch (e) {
        console.error('[server]', e);
      }
    });
  });

  return { httpServer, io, manager };
}
