import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Server } from 'socket.io';
import {
  REQUEST_MAX_LEN,
  REQUEST_MIN_LEN,
  REQUEST_REPLY_MAX_LEN,
  type ChangeRequest,
  type ClientToServerEvents,
  type RequestStatus,
  type ServerToClientEvents,
} from '@poker/engine';
import { ledgerIdentity } from "./ledger";
import { MAX_PENDING_PER_AUTHOR, type RequestStore } from './requests';
import type { TableManager } from './tableManager';
import { UserError, type AppSocket, type SocketData } from './tableRoom';

type Io = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface RequestsOptions {
  store: RequestStore;
  /** Lower-cased email of the only account that may approve; unset means nobody can. */
  adminEmail?: string;
  /** Bearer token the worker sends to the internal API; unset disables that API. */
  workerToken?: string;
  /** Where worker screenshots are written; served under /api/requests/shots. */
  shotsDir: string;
}

const WORKER_STATUSES = new Set<RequestStatus>(['working', 'preview', 'waiting_deploy', 'deployed', 'failed']);
const SHOT_NAME = /^[A-Za-z0-9_-]{1,64}\.png$/;
const MAX_SHOTS_PER_EVENT = 12;

function text(raw: unknown, min: number, max: number): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length < min) throw new UserError(`Escreva pelo menos ${min} caracteres`);
  if (value.length > max) throw new UserError(`Máximo de ${max} caracteres`);
  return value;
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createRequests(io: Io, manager: TableManager, opts: RequestsOptions) {
  const { store } = opts;
  const admin = opts.adminEmail?.trim().toLowerCase() || undefined;
  const isAdmin = (socket: AppSocket) => admin !== undefined && socket.data.email === admin;
  const publish = (r: ChangeRequest | undefined) => {
    if (r) io.emit('requests:update', r);
    return r;
  };

  /** Name and identity of a socket that has joined a table. */
  const who = (socket: AppSocket) => {
    const room = socket.data.room;
    const playerId = socket.data.playerId;
    const name = playerId ? room?.nameOf(playerId) : undefined;
    if (!name) throw new UserError('Entre em uma mesa primeiro');
    return { name, identity: socket.data.email ?? ledgerIdentity(name) };
  };

  const find = (id: unknown) => {
    const r = typeof id === 'number' ? store.get(id) : undefined;
    if (!r) throw new UserError('Pedido não encontrado');
    return r;
  };

  /** Registers the socket events; call inside io.on('connection'). */
  function attach(socket: AppSocket, invoke: <T extends { ok: boolean }>(ack: ((r: T) => void) | undefined, fn: () => T) => void) {
    socket.on('requests:list', (ack) =>
      invoke(ack, () => ({ ok: true as const, requests: store.list(), canApprove: isAdmin(socket) })),
    );

    socket.on('requests:create', (req, ack) => invoke(ack, () => {
      const { name, identity } = who(socket);
      const body = text(req?.text, REQUEST_MIN_LEN, REQUEST_MAX_LEN);
      if (store.pendingCount(identity) >= MAX_PENDING_PER_AUTHOR) {
        throw new UserError(`Você já tem ${MAX_PENDING_PER_AUTHOR} pedidos aguardando aprovação`);
      }
      publish(store.create(identity, name, body));
      return { ok: true as const };
    }));

    socket.on('requests:decide', (req, ack) => invoke(ack, () => {
      if (!isAdmin(socket)) throw new UserError('Só o administrador aprova pedidos');
      const { name } = who(socket);
      const r = find(req?.id);
      const approve = req?.approve === true;
      let next: RequestStatus;
      if (r.status === 'pending') next = approve ? 'approved' : 'rejected';
      else if (r.status === 'preview') next = approve ? 'merging' : 'rejected';
      else throw new UserError('Este pedido não está aguardando decisão');
      store.addEvent(r.id, 'admin', name, approve ? (r.status === 'preview' ? 'Aprovou a prévia para publicar' : 'Aprovou o pedido') : 'Recusou');
      publish(store.setStatus(r.id, next));
      return { ok: true as const };
    }));

    socket.on('requests:reply', (req, ack) => invoke(ack, () => {
      const { name, identity } = who(socket);
      const r = find(req?.id);
      const asAdmin = isAdmin(socket);
      if (!asAdmin && store.authorOf(r.id) !== identity) throw new UserError('Só quem pediu ou o administrador pode responder');
      const body = text(req?.text, 1, REQUEST_REPLY_MAX_LEN);
      store.addEvent(r.id, asAdmin ? 'admin' : 'player', name, body);
      // An adjustment from the admin on a preview sends it back to the worker for another round.
      publish(asAdmin && r.status === 'preview' ? store.setStatus(r.id, 'approved') : store.get(r.id));
      return { ok: true as const };
    }));
  }

  /** Screenshots for the panel; behind the login proxy like the rest of /api. */
  const shots = express.Router();
  shots.get('/api/requests/shots/:id/:file', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || !SHOT_NAME.test(req.params.file)) return void res.status(404).end();
    res.sendFile(path.join(path.resolve(opts.shotsDir), String(id), req.params.file), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  /** Worker API, served on a separate port that only the host reaches. */
  const internal = express();
  internal.use(express.json({ limit: '25mb' }));
  internal.use((req, res, next) => {
    const token = opts.workerToken;
    const given = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (!token || !sameToken(given, token)) return void res.status(401).json({ ok: false });
    next();
  });

  internal.post('/internal/jobs/next', (_req, res) => {
    const job = store.claimNext();
    if (!job) return void res.status(204).end();
    publish(job.request);
    res.json({ ok: true, ...job });
  });

  internal.get('/internal/requests/:id', (req, res) => {
    const r = store.get(Number(req.params.id));
    if (!r) return void res.status(404).json({ ok: false });
    res.json({ ok: true, request: r });
  });

  internal.get('/internal/activity', (_req, res) => {
    res.json({ ok: true, players: manager.connectedPlayers(), tables: manager.size });
  });

  internal.post('/internal/requests/:id/events', (req, res) => {
    const id = Number(req.params.id);
    const r = store.get(id);
    if (!r) return void res.status(404).json({ ok: false });
    const body = (req.body ?? {}) as { text?: unknown; status?: unknown; prUrl?: unknown; images?: unknown };
    const status = typeof body.status === 'string' ? (body.status as RequestStatus) : undefined;
    if (status !== undefined && !WORKER_STATUSES.has(status)) return void res.status(400).json({ ok: false, error: 'status' });
    const images: string[] = [];
    if (Array.isArray(body.images)) {
      const dir = path.join(path.resolve(opts.shotsDir), String(id));
      mkdirSync(dir, { recursive: true });
      for (const img of body.images.slice(0, MAX_SHOTS_PER_EVENT) as { name?: unknown; base64?: unknown }[]) {
        if (typeof img?.name !== 'string' || typeof img.base64 !== 'string') continue;
        const file = `${Date.now()}-${img.name}`;
        if (!SHOT_NAME.test(file)) continue;
        writeFileSync(path.join(dir, file), Buffer.from(img.base64, 'base64'));
        images.push(`/api/requests/shots/${id}/${file}`);
      }
    }
    const message = typeof body.text === 'string' ? body.text.slice(0, 4000) : '';
    if (message || images.length > 0) store.addEvent(id, 'worker', 'Worker', message, images);
    const prUrl = typeof body.prUrl === 'string' ? body.prUrl : undefined;
    publish(status ? store.setStatus(id, status, prUrl) : store.get(id));
    res.json({ ok: true });
  });

  return { attach, shots, internal };
}
