import type { Street } from '@poker/engine';

export const fmt = (n: number) => n.toLocaleString('pt-BR');

export const signed = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('pt-BR')}`;

export const STREET_LABEL: Record<Street, string> = {
  preflop: 'Pré-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

export const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
