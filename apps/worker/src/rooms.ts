// Códigos no estilo do Meet: "kqx-mfta-pzr". 26^10 combinações, impossível de adivinhar na prática.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const CODE_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

function chunk(size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  // 26 não divide 256: descartar o resto evita que algumas letras saiam mais que outras.
  let out = '';
  for (const b of bytes) out += b < 234 ? ALPHABET[b % 26] : chunk(1);
  return out;
}

export function newRoomCode(): string {
  return `${chunk(3)}-${chunk(4)}-${chunk(3)}`;
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_RE.test(value);
}

// Nome visível: até 32 caracteres, sem quebras de linha ou espaços nas pontas.
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= 32 ? name : null;
}
