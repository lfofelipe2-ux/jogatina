const KEY = 'jogatina:loginReloadAt';
const MIN_INTERVAL_MS = 30_000;

interface Deps {
  fetch: (url: string) => Promise<{ status: number }>;
  reload: () => void;
  now: () => number;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/**
 * Behind the Google login proxy, a tab whose login expired (or that was opened before the login existed)
 * keeps failing to reconnect with 401. A full page load goes through the proxy and lands on the login page.
 * At most one reload per 30 s, so a broken proxy cannot put the tab in a reload loop.
 */
export async function reloadIfLoggedOut(deps: Deps): Promise<boolean> {
  let status: number;
  try {
    status = (await deps.fetch('/api/config')).status;
  } catch {
    return false;
  }
  if (status !== 401) return false;
  const now = deps.now();
  // Without storage the loop guard cannot work, so the tab stays put and the user reloads by hand.
  try {
    if (!deps.storage || now - Number(deps.storage.getItem(KEY) ?? 0) < MIN_INTERVAL_MS) return false;
    deps.storage.setItem(KEY, String(now));
  } catch {
    return false;
  }
  deps.reload();
  return true;
}
