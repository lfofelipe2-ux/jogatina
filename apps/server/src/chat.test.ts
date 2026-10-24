import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import {
  STICKERS,
  TAUNTS,
  type ChatMessage,
  type ClientToServerEvents,
  type CreateTableResponse,
  type GifSearchResponse,
  type JoinTableResponse,
  type ServerToClientEvents,
  type SimpleResponse,
} from '@poker/engine';
import { createApp } from './app';
import { GifService } from './gifs';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

function ack<T>(send: (cb: (r: T) => void) => void): Promise<T> {
  return new Promise((resolve) => send(resolve));
}

const KLIPY_BODY = {
  results: [
    {
      id: 'g1',
      media_formats: {
        mediumgif: { url: 'https://static.klipy.com/g1.gif', dims: [320, 240] },
        tinygif: { url: 'https://static.klipy.com/g1-tiny.gif', dims: [120, 90] },
      },
    },
    { id: 'broken', media_formats: { mediumgif: { url: 'javascript:alert(1)', dims: [1, 1] } } },
  ],
};

describe('chat', () => {
  let app: ReturnType<typeof createApp>;
  let base: string;
  const clients: Client[] = [];
  const fetchMock = vi.fn();
  const realFetch = globalThis.fetch;
  let alice: Client;
  let bob: Client;
  let tableId: string;
  const aliceInbox: ChatMessage[] = [];

  const open = (): Promise<Client> =>
    new Promise((resolve, reject) => {
      const s: Client = connect(base, { transports: ['websocket'], forceNew: true });
      clients.push(s);
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });

  const send = (c: Client, req: Parameters<ClientToServerEvents['chat:send']>[0]) =>
    ack<SimpleResponse>((cb) => c.emit('chat:send', req, cb));

  const nextChat = (c: Client) => new Promise<ChatMessage>((resolve) => c.once('chat', resolve));

  beforeAll(async () => {
    // Requests to the real server under test go through; only KLIPY is faked.
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      String(url).startsWith('https://api.klipy.com/') ? fetchMock(url, init) : realFetch(url, init),
    );
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(KLIPY_BODY), { status: 200 }));
    app = createApp({ gifs: new GifService('secret-key') });
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
    base = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
    alice = await open();
    bob = await open();
    alice.on('chat', (m) => aliceInbox.push(m));
    const created = await ack<CreateTableResponse>((cb) =>
      alice.emit('createTable', { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 6, actionTimeoutSec: 30 }, cb),
    );
    if (!created.ok) throw new Error('create failed');
    tableId = created.tableId;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const c of clients) c.disconnect();
    app.manager.closeAll();
    await app.io.close();
  });

  it('refuses chat before joining a table', async () => {
    expect(await send(alice, { kind: 'text', text: 'oi' })).toEqual({ ok: false, error: 'Entre em uma mesa primeiro' });
  });

  it('broadcasts text and taunts to everyone at the table', async () => {
    await ack<JoinTableResponse>((cb) => alice.emit('joinTable', { tableId, name: 'Alice' }, cb));
    await ack<JoinTableResponse>((cb) => bob.emit('joinTable', { tableId, name: 'Bob' }, cb));

    const atBob = nextChat(bob);
    expect(await send(alice, { kind: 'text', text: '  boa sorte  ' })).toEqual({ ok: true });
    expect(await atBob).toMatchObject({ name: 'Alice', body: { kind: 'text', text: 'boa sorte' } });

    const taunt = nextChat(alice);
    expect(await send(bob, { kind: 'taunt', id: 1 })).toEqual({ ok: true });
    expect((await taunt).body).toEqual({ kind: 'taunt', text: TAUNTS[1] });
  });

  it('rejects invalid messages', async () => {
    expect(await send(bob, { kind: 'text', text: '   ' })).toEqual({ ok: false, error: 'Mensagem vazia' });
    expect((await send(bob, { kind: 'text', text: 'x'.repeat(201) })).ok).toBe(false);
    expect(await send(bob, { kind: 'taunt', id: 999 })).toEqual({ ok: false, error: 'Provocação inválida' });
    expect(await send(bob, { kind: 'sticker', id: '../etc' })).toEqual({ ok: false, error: 'Figurinha inválida' });
    expect((await send(bob, { kind: 'nope' } as never)).ok).toBe(false);
  });

  it('accepts catalog stickers', async () => {
    const id = STICKERS[0]![0];
    const atAlice = nextChat(alice);
    expect(await send(bob, { kind: 'sticker', id })).toEqual({ ok: true });
    expect((await atAlice).body).toEqual({ kind: 'sticker', id });
  });

  it('only posts GIFs signed by the server search, without leaking the key', async () => {
    const plain = { kind: 'gif', id: 'g1', url: 'https://static.klipy.com/g1.gif', width: 320, height: 240 } as const;
    expect(await send(alice, { ...plain, sig: 'forged' })).toEqual({ ok: false, error: 'GIF inválido, busque de novo' });

    const res = await realFetch(`${base}/api/gifs?q=${encodeURIComponent('all in')}`);
    const text = await res.text();
    expect(text).not.toContain('secret-key');
    const body = JSON.parse(text) as GifSearchResponse;
    if (!body.ok) throw new Error(body.error);
    expect(body.results).toHaveLength(1);
    const g = body.results[0]!;
    const { kind: _kind, ...media } = plain;
    expect(g).toMatchObject({ ...media, previewUrl: 'https://static.klipy.com/g1-tiny.gif' });
    const called = new URL(fetchMock.mock.calls.at(-1)![0] as string);
    expect(called.pathname).toBe('/v2/search');
    expect(called.searchParams.get('q')).toBe('all in');

    // The signature binds the URL: swapping it for another image is refused.
    expect((await send(alice, { ...plain, url: 'https://evil.example/x.gif', sig: g.sig })).ok).toBe(false);

    const atBob = nextChat(bob);
    expect(await send(alice, { kind: 'gif', id: g.id, url: g.url, width: g.width, height: g.height, sig: g.sig })).toEqual({ ok: true });
    expect((await atBob).body).toEqual({ ...plain });
  });

  it('caches searches and keys the GIF limit on the proxied client, not on a spoofable header', async () => {
    const calls = fetchMock.mock.calls.length;
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const r = await realFetch(`${base}/api/gifs?q=all%20in`, { headers: { 'cf-connecting-ip': `10.9.${i}.1` } });
      statuses.push(r.status);
    }
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(statuses).toContain(429);
  });

  it('sends recent history to a player who joins later', async () => {
    const carol = await open();
    const history = new Promise<ChatMessage[]>((resolve) => carol.once('chat:history', resolve));
    await ack<JoinTableResponse>((cb) => carol.emit('joinTable', { tableId, name: 'Carol' }, cb));
    const msgs = await history;
    expect(msgs.map((m) => m.name)).toEqual(['Alice', 'Bob', 'Bob', 'Alice']);
    expect(msgs.map((m) => m.id)).toEqual(aliceInbox.map((m) => m.id));
  });

  it('limits bursts per player', async () => {
    const dave = await open();
    await ack<JoinTableResponse>((cb) => dave.emit('joinTable', { tableId, name: 'Dave' }, cb));
    const results: SimpleResponse[] = [];
    for (let i = 0; i < 6; i++) results.push(await send(dave, { kind: 'text', text: `msg ${i}` }));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.at(-1)).toEqual({ ok: false, error: 'Calma, muitas mensagens seguidas' });
  });

  it('reports whether GIFs are enabled', async () => {
    expect(await (await realFetch(`${base}/api/config`)).json()).toEqual({ gifs: true });
    const off = createApp({ gifs: new GifService(undefined) });
    await new Promise<void>((resolve) => off.httpServer.listen(0, resolve));
    const offBase = `http://localhost:${(off.httpServer.address() as AddressInfo).port}`;
    expect(await (await realFetch(`${offBase}/api/config`)).json()).toEqual({ gifs: false });
    expect((await realFetch(`${offBase}/api/gifs?q=x`)).status).toBe(404);
    await off.io.close();
  });
});
