import { useSyncExternalStore } from 'react';
import { readItem, writeItem } from './storage';

// Kenney CC0 sounds, see assets/sounds/NOTICE.
const URLS = import.meta.glob<string>('../assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' });

export type SoundName = 'deal' | 'chips' | 'turn' | 'check' | 'fold' | 'raise' | 'win' | 'allin';

const VOLUME: Record<SoundName, number> = {
  deal: 0.5,
  chips: 0.6,
  turn: 0.7,
  check: 0.6,
  fold: 0.5,
  raise: 0.7,
  win: 0.6,
  allin: 0.8,
};

export const MUTE_KEY = 'poker:mute';

let muted = readItem(MUTE_KEY) === '1';
const listeners = new Set<() => void>();
const cache = new Map<SoundName, HTMLAudioElement>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  // writeItem swallows storage errors (private mode, blocked storage): mute then lasts for this visit only.
  writeItem(MUTE_KEY, next ? '1' : '0');
  listeners.forEach((l) => l());
}

export function useMuted(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    isMuted,
  );
}

export function play(name: SoundName): void {
  if (muted || typeof Audio === 'undefined') return;
  const url = URLS[`../assets/sounds/${name}.mp3`];
  if (!url) return;
  try {
    let base = cache.get(name);
    if (!base) {
      base = new Audio(url);
      base.preload = 'auto';
      cache.set(name, base);
    }
    // A clone lets the same sound overlap itself (several chips in a row).
    const a = base.cloneNode() as HTMLAudioElement;
    a.volume = VOLUME[name];
    // Browsers refuse playback before the first user gesture; that is fine, just stay silent.
    void a.play().catch(() => {});
  } catch {
    /* audio unavailable */
  }
}
