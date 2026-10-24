const EXACT: Record<string, string> = {
  'amount must be a positive integer': 'O valor precisa ser um inteiro positivo.',
  'blinds must be integers with 0 < smallBlind <= bigBlind': 'Blinds inválidos.',
  'cannot check': 'Não é possível passar agora.',
  'cannot start a hand now': 'Não é possível começar uma mão agora.',
  'fold before adding chips': 'Desista da mão antes de receber fichas.',
  'fold before sitting out': 'Desista da mão antes de sair do jogo.',
  'fold before standing up': 'Desista da mão antes de levantar.',
  'maxSeats must be 2..9': 'Os lugares devem estar entre 2 e 9.',
  'no hand in progress': 'Nenhuma mão em andamento.',
  'not this seat\'s turn': 'Não é a sua vez.',
  'nothing to call': 'Não há aposta para pagar.',
  'player is already seated': 'Você já está sentado.',
  'seat is empty': 'Este lugar está vazio.',
  'seat is occupied': 'Lugar ocupado.',
  'seat is still part of the current hand': 'Este lugar ainda está na mão atual.',
  'stack must be positive': 'As fichas precisam ser positivas.',
  'Erro interno': 'Erro interno do servidor.',
};

const ACTION_PT: Record<string, string> = {
  fold: 'desistir',
  check: 'passar',
  call: 'pagar',
  bet: 'apostar',
  raise: 'aumentar',
  allIn: 'ir all-in',
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\w+) amount must be between (\d+) and (\d+)$/, (m) => `O valor deve estar entre ${m[2]} e ${m[3]}.`],
  [/^cannot (\w+)$/, (m) => `Não é possível ${ACTION_PT[m[1]!] ?? m[1]} agora.`],
  [/^seat (\d+) is out of range$/, () => 'Lugar inválido.'],
  [/^not this seat/, () => 'Não é a sua vez.'],
  [/^unknown action/, () => 'Ação inválida.'],
];

/** Translates English engine messages into Portuguese; other text is returned unchanged. */
export function failureMessage(raw: string): string {
  const text = raw.trim();
  const exact = EXACT[text];
  if (exact) return exact;
  for (const [re, fmt] of PATTERNS) {
    const m = text.match(re);
    if (m) return fmt(m);
  }
  return text;
}
