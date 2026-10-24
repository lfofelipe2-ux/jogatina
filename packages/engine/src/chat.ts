import { STICKERS } from './stickers';

export const CHAT_TEXT_MAX = 200;
export const CHAT_HISTORY_MAX = 50;

export const TAUNTS: readonly string[] = [
  'Vai pagar pra ver?',
  'Blefe!',
  'Tá com medo?',
  'All-in, covarde',
  'Volta pra casa',
  'Sorte de principiante',
  'Nem eu acreditei',
  'Chora não',
  'Essa doeu',
  'Pode vir quente',
  'Foi sem querer 😇',
  'GG',
];

/** What a client sends. A GIF must carry the signature the server's own search attached to it. */
export type ChatInput =
  | { kind: 'text'; text: string }
  | { kind: 'taunt'; id: number }
  | { kind: 'sticker'; id: string }
  | ({ kind: 'gif'; id: string; sig: string } & GifMedia);

export interface GifMedia {
  url: string;
  width: number;
  height: number;
}

export type ChatBody =
  | { kind: 'text'; text: string }
  | { kind: 'taunt'; text: string }
  | { kind: 'sticker'; id: string }
  | ({ kind: 'gif'; id: string } & GifMedia);

export interface ChatMessage {
  id: number;
  playerId: string;
  name: string;
  at: number;
  body: ChatBody;
}

export interface GifResult extends GifMedia {
  id: string;
  previewUrl: string;
  sig: string;
}

export type GifSearchResponse = { ok: true; results: GifResult[] } | { ok: false; error: string };

const STICKER_IDS = new Set(STICKERS.map(([cp]) => cp));

export function isSticker(id: unknown): id is string {
  return typeof id === 'string' && STICKER_IDS.has(id);
}

export function stickerUrl(id: string, animated = true): string {
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${id}/${animated ? '512.webp' : 'emoji.svg'}`;
}

/** Portuguese search words mapped to the English Noto tags they should find. */
const PT_WORDS: Record<string, string[]> = {
  rindo: ['joy', 'rofl', 'laugh', 'grin'],
  risada: ['joy', 'rofl', 'laugh'],
  kkk: ['joy', 'rofl', 'laugh'],
  chorando: ['cry', 'sob', 'tear'],
  triste: ['sad', 'cry', 'frown', 'pensive'],
  bravo: ['angry', 'rage', 'steam', 'cursing'],
  raiva: ['angry', 'rage', 'steam', 'cursing'],
  dinheiro: ['money', 'dollar', 'coin'],
  grana: ['money', 'dollar', 'coin'],
  fogo: ['fire'],
  palhaco: ['clown'],
  caveira: ['skull'],
  morto: ['skull', 'dead', 'x-eyes'],
  coco: ['poop'],
  bomba: ['bomb', 'explod'],
  coracao: ['heart'],
  amor: ['heart', 'kiss', 'love'],
  beijo: ['kiss'],
  joinha: ['thumbs-up'],
  medo: ['scream', 'fear', 'anxious', 'cold-sweat'],
  susto: ['scream', 'shock', 'mouth-open'],
  pensando: ['thinking', 'monocle'],
  olhos: ['eyes', 'eye'],
  festa: ['party', 'confetti', 'tada'],
  vitoria: ['trophy', 'medal', 'party', 'muscle'],
  forte: ['muscle'],
  diabo: ['devil', 'imp'],
  anjo: ['halo', 'angel'],
  tchau: ['wave'],
  palmas: ['clap'],
  oculos: ['sunglasses', 'cool'],
  vomito: ['vomit', 'nausea'],
  sono: ['sleep', 'yawn', 'zzz'],
  fantasma: ['ghost'],
  cartas: ['cards', 'joker', 'spade', 'club', 'diamond'],
  sorte: ['clover', 'crossed-fingers', 'slot'],
  azar: ['broken', 'sad', 'skull'],
  segredo: ['shush', 'zipper'],
  silencio: ['shush', 'zipper'],
  ironia: ['smirk', 'upside-down', 'eye-roll'],
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function searchStickers(query: string): string[] {
  const q = normalize(query);
  if (!q) return STICKERS.map(([cp]) => cp);
  const terms = [q, ...Object.entries(PT_WORDS).filter(([w]) => w.startsWith(q)).flatMap(([, en]) => en)];
  return STICKERS.filter(([, tags]) => terms.some((t) => tags.includes(t))).map(([cp]) => cp);
}
