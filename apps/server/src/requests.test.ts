import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  CreateTableResponse,
  JoinTableResponse,
  RequestsResponse,
  ServerToClientEvents,
  SimpleResponse,
} from '@poker/engine';
import { createApp } from './app';
import { openRequests } from './requests';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const ack = <T>(send: (cb: (r: T) => void) => void) => new Promise<T>((resolve) => send(resolve));

describe('request store', () => {
  it('hands out merges before new work, oldest first', () => {
    const s = openRequests(':memory:');
    const a = s.create('ana', 'Ana', 'Botão maior');
    const b = s.create('bia', 'Bia', 'Som novo');
    expect(s.claimNext()).toBeUndefined();
    s.setStatus(a.id, 'approved');
    s.setStatus(b.id, 'merging');
    expect(s.claimNext()).toMatchObject({ kind: 'merge', request: { id: b.id, status: 'waiting_deploy' } });
    expect(s.claimNext()).toMatchObject({ kind: 'work', request: { id: a.id, status: 'working' } });
    expect(s.claimNext()).toBeUndefined();
  });

  it('keeps events with their screenshots', () => {
    const s = openRequests(':memory:');
    const r = s.create('ana', 'Ana', 'Mesa azul');
    s.addEvent(r.id, 'worker', 'Worker', 'Prévia', ['/api/requests/shots/1/a.png']);
    expect(s.get(r.id)!.events).toEqual([
      expect.objectContaining({ author: 'worker', text: 'Prévia', images: ['/api/requests/shots/1/a.png'] }),
    ]);
  });
});

describe('requests over socket.io and the worker API', () => {
  const TOKEN = 'test-token';
  const ADMIN = 'luis@example.com';
  let app: ReturnType<typeof createApp>;
  let port: number;
  let internalPort: number;
  let shotsDir: string;
  const clients: Client[] = [];
  const prevTrust = process.env.TRUST_PROXY_EMAIL;

  const open = (email: string): Promise<Client> =>
    new Promise((resolve, reject) => {
      const s: Client = connect(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
        extraHeaders: { 'x-forwarded-email': email },
      });
      clients.push(s);
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });

  const worker = (route: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${internalPort}${route}`, {
      ...init,
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  beforeAll(async () => {
    process.env.TRUST_PROXY_EMAIL = '1';
    shotsDir = mkdtempSync(path.join(tmpdir(), 'shots-'));
    app = createApp({ requests: { store: openRequests(':memory:'), adminEmail: ADMIN, workerToken: TOKEN, shotsDir } });
    await new Promise<void>((r) => app.httpServer.listen(0, r));
    port = (app.httpServer.address() as AddressInfo).port;
    const internal = app.internalApp!.listen(0);
    await new Promise((r) => internal.once('listening', r));
    internalPort = (internal.address() as AddressInfo).port;
    afterAll(() => internal.close());
  });

  afterAll(() => {
    clients.forEach((c) => c.disconnect());
    app.io.close();
    app.manager.closeAll();
    rmSync(shotsDir, { recursive: true, force: true });
    process.env.TRUST_PROXY_EMAIL = prevTrust;
  });

  it('runs a request from suggestion to preview, adjustment and merge', async () => {
    const host = await open(ADMIN);
    const created = await ack<CreateTableResponse>((cb) =>
      host.emit('createTable', { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 6, actionTimeoutSec: 30 }, cb),
    );
    if (!created.ok) throw new Error(created.error);
    await ack<JoinTableResponse>((cb) => host.emit('joinTable', { tableId: created.tableId, name: 'Luis' }, cb));
    const friend = await open('bia@example.com');
    await ack<JoinTableResponse>((cb) => friend.emit('joinTable', { tableId: created.tableId, name: 'Bia' }, cb));

    expect(await ack<SimpleResponse>((cb) => friend.emit('requests:create', { text: 'oi' }, cb))).toMatchObject({ ok: false });
    expect(await ack<SimpleResponse>((cb) => friend.emit('requests:create', { text: 'Mesa com feltro azul' }, cb))).toEqual({ ok: true });

    const seen = await ack<RequestsResponse>((cb) => friend.emit('requests:list', cb));
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.canApprove).toBe(false);
    const id = seen.requests[0].id;
    expect(await ack<SimpleResponse>((cb) => friend.emit('requests:decide', { id, approve: true }, cb))).toMatchObject({ ok: false });

    expect((await worker('/internal/jobs/next', { method: 'POST' })).status).toBe(204);
    const asAdmin = await ack<RequestsResponse>((cb) => host.emit('requests:list', cb));
    expect(asAdmin.ok && asAdmin.canApprove).toBe(true);
    expect(await ack<SimpleResponse>((cb) => host.emit('requests:decide', { id, approve: true }, cb))).toEqual({ ok: true });

    const job = await (await worker('/internal/jobs/next', { method: 'POST' })).json();
    expect(job).toMatchObject({ kind: 'work', request: { id, status: 'working' } });

    const png = Buffer.from('fake').toString('base64');
    const posted = await worker(`/internal/requests/${id}/events`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Prévia', status: 'preview', prUrl: 'https://example.com/pr/1', images: [{ name: 'mobile.png', base64: png }] }),
    });
    expect(posted.status).toBe(200);
    const after = await ack<RequestsResponse>((cb) => host.emit('requests:list', cb));
    const req = after.ok ? after.requests[0] : undefined;
    expect(req).toMatchObject({ status: 'preview', prUrl: 'https://example.com/pr/1' });
    const shot = req!.events.at(-1)!.images[0];
    expect((await fetch(`http://localhost:${port}${shot}`)).status).toBe(200);

    // An adjustment from the admin goes back to the worker; one from someone else is only a comment.
    await ack<SimpleResponse>((cb) => friend.emit('requests:reply', { id, text: 'Mais escuro' }, cb));
    expect((await ack<RequestsResponse>((cb) => host.emit('requests:list', cb)) as { requests: { status: string }[] }).requests[0].status).toBe('preview');
    await ack<SimpleResponse>((cb) => host.emit('requests:reply', { id, text: 'Mais escuro, por favor' }, cb));
    expect((await (await worker('/internal/jobs/next', { method: 'POST' })).json()).kind).toBe('work');

    await worker(`/internal/requests/${id}/events`, { method: 'POST', body: JSON.stringify({ status: 'preview' }) });
    expect(await ack<SimpleResponse>((cb) => host.emit('requests:decide', { id, approve: true }, cb))).toEqual({ ok: true });
    expect(await (await worker('/internal/jobs/next', { method: 'POST' })).json()).toMatchObject({ kind: 'merge', request: { status: 'waiting_deploy' } });
  });

  it('refuses the worker API without the token and bad statuses', async () => {
    expect((await fetch(`http://localhost:${internalPort}/internal/activity`)).status).toBe(401);
    expect((await worker('/internal/activity')).status).toBe(200);
    const bad = await worker('/internal/requests/1/events', { method: 'POST', body: JSON.stringify({ status: 'merging' }) });
    expect(bad.status).toBe(400);
  });
});
