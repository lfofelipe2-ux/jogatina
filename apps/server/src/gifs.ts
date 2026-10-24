import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GifMedia, GifResult } from '@poker/engine';

const KLIPY_URL = 'https://api.klipy.com/v2';
const PAGE_SIZE = 24;
const QUERY_MAX = 60;
const TIMEOUT_MS = 5000;
const RESULT_TTL_MS = 5 * 60_000;
const RESULT_CACHE_MAX = 300;
/** Whole-server budget of upstream calls, so no visitor mix can burn the key's quota. */
const UPSTREAM_PER_SEC = 3;

interface KlipyFormat {
  url?: unknown;
  dims?: unknown;
}

function media(f: KlipyFormat | undefined): GifMedia | null {
  if (!f || typeof f.url !== 'string' || !f.url.startsWith('https://')) return null;
  const [width, height] = Array.isArray(f.dims) ? f.dims : [];
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return null;
  return { url: f.url, width, height };
}

export class UpstreamBusy extends Error {}

/** KLIPY speaks the old Tenor v2 format. Each result is signed so chat only posts GIFs this server handed out. */
export class GifService {
  private readonly secret = randomBytes(32);
  private readonly results = new Map<string, { at: number; results: GifResult[] }>();
  private tokens = UPSTREAM_PER_SEC;
  private refilledAt = Date.now();

  constructor(private readonly apiKey: string | undefined = process.env.KLIPY_API_KEY) {}

  get enabled(): boolean {
    return !!this.apiKey;
  }

  /** The media of a GIF the client picked, or undefined when it was not signed by this server. */
  verify(raw: unknown): (GifMedia & { id: string }) | undefined {
    const r = (raw ?? {}) as Record<string, unknown>;
    const { id, url, width, height, sig } = r;
    if (typeof id !== 'string' || typeof url !== 'string' || typeof sig !== 'string') return undefined;
    if (typeof width !== 'number' || typeof height !== 'number') return undefined;
    const want = Buffer.from(this.sign({ id, url, width, height }));
    const got = Buffer.from(sig);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return undefined;
    return { id, url, width, height };
  }

  async search(query: string): Promise<GifResult[]> {
    if (!this.apiKey) throw new Error('GIFs desativados');
    const q = query.trim().slice(0, QUERY_MAX).toLocaleLowerCase();
    const hit = this.results.get(q);
    if (hit && Date.now() - hit.at < RESULT_TTL_MS) return hit.results;
    this.take();
    const params = new URLSearchParams({
      key: this.apiKey,
      limit: String(PAGE_SIZE),
      contentfilter: 'medium',
      media_filter: 'tinygif,mediumgif',
      locale: 'pt_BR',
      country: 'BR',
    });
    if (q) params.set('q', q);
    const res = await fetch(`${KLIPY_URL}/${q ? 'search' : 'featured'}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`KLIPY ${res.status}`);
    const body = (await res.json()) as { results?: { id?: unknown; media_formats?: Record<string, KlipyFormat> }[] };
    const out: GifResult[] = [];
    for (const r of body.results ?? []) {
      const full = media(r.media_formats?.mediumgif);
      const preview = media(r.media_formats?.tinygif);
      if (typeof r.id !== 'string' || !full || !preview) continue;
      const gif = { id: r.id, ...full };
      out.push({ ...gif, previewUrl: preview.url, sig: this.sign(gif) });
    }
    this.results.delete(q);
    this.results.set(q, { at: Date.now(), results: out });
    if (this.results.size > RESULT_CACHE_MAX) this.results.delete(this.results.keys().next().value!);
    return out;
  }

  private sign(g: GifMedia & { id: string }): string {
    return createHmac('sha256', this.secret).update(`${g.id}|${g.url}|${g.width}|${g.height}`).digest('base64url');
  }

  private take(): void {
    const now = Date.now();
    this.tokens = Math.min(UPSTREAM_PER_SEC, this.tokens + ((now - this.refilledAt) / 1000) * UPSTREAM_PER_SEC);
    this.refilledAt = now;
    if (this.tokens < 1) throw new UpstreamBusy('Muitas buscas agora, tente de novo');
    this.tokens -= 1;
  }
}
