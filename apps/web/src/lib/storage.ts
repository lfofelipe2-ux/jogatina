export const NAME_KEY = 'poker:name';
export const rtKey = (tableId: string) => `poker:rt:${tableId}`;
export const hostKey = (tableId: string) => `poker:host:${tableId}`;

export function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the page still works for this visit */
  }
}

export function removeItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function moveTableKeys(from: string, to: string): void {
  for (const make of [rtKey, hostKey]) {
    const value = readItem(make(from));
    if (value !== null) {
      writeItem(make(to), value);
      removeItem(make(from));
    }
  }
}
