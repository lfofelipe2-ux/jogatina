import type { GifResult, GifSearchResponse } from '@poker/engine';

let enabled: Promise<boolean> | null = null;

/** Only a successful answer is remembered, so a failure during a reconnect does not hide GIFs until reload. */
export function gifsEnabled(): Promise<boolean> {
  enabled ??= fetch('/api/config')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((c: { gifs?: boolean }) => c.gifs === true)
    .catch(() => {
      enabled = null;
      return false;
    });
  return enabled;
}

export async function searchGifs(q: string, signal: AbortSignal): Promise<GifResult[]> {
  const res = await fetch(`/api/gifs?q=${encodeURIComponent(q)}`, { signal });
  const body = res.headers.get('content-type')?.includes('application/json')
    ? ((await res.json()) as GifSearchResponse)
    : null;
  if (!body) throw new Error('Busca de GIFs indisponível');
  if (!body.ok) throw new Error(body.error);
  return body.results;
}
