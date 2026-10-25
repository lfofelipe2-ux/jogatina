import { describe, expect, it, vi } from 'vitest';
import { reloadIfLoggedOut } from './loginGuard';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('reloadIfLoggedOut', () => {
  it('reloads when the proxy answers 401', async () => {
    const reload = vi.fn();
    const done = await reloadIfLoggedOut({ fetch: async () => ({ status: 401 }), reload, now: () => 100_000, storage: memoryStorage() });
    expect(done).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does nothing while logged in or when the server is unreachable', async () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    await reloadIfLoggedOut({ fetch: async () => ({ status: 200 }), reload, now: () => 1, storage });
    await reloadIfLoggedOut({ fetch: async () => { throw new Error('offline'); }, reload, now: () => 1, storage });
    await reloadIfLoggedOut({ fetch: async () => ({ status: 502 }), reload, now: () => 1, storage });
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads at most once per 30 seconds', async () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    let t = 1_000_000;
    const deps = { fetch: async () => ({ status: 401 }), reload, now: () => t, storage };
    await reloadIfLoggedOut(deps);
    t += 10_000;
    await reloadIfLoggedOut(deps);
    expect(reload).toHaveBeenCalledTimes(1);
    t += 25_000;
    await reloadIfLoggedOut(deps);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when the guard cannot be recorded', async () => {
    const reload = vi.fn();
    const storage = { getItem: () => null, setItem: () => { throw new Error('blocked'); } };
    expect(await reloadIfLoggedOut({ fetch: async () => ({ status: 401 }), reload, now: () => 1e6, storage })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
