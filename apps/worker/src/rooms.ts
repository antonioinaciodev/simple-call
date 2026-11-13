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

// ---------- salas fixas ----------

// Sala fixa: um nome legível que vale pra sempre, tipo /sala/galera-do-lol. Fica guardada no
// próprio Durable Object da sala (não precisa de banco à parte).
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/;
export const NAMED_PREFIX = 'sala/';

// "Galera do LoL" → "galera-do-lol" (sem acento, só letras, números e hífen, até 24 caracteres).
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 24)
    .replace(/-+$/, '');
}

export const isSlug = (value: string) => SLUG_RE.test(value);

// Toda sala tem uma "chave", que é o caminho dela no site sem a barra:
// "abc-defg-hij" (call rápida) ou "sala/galera" (sala fixa).
// Devolve o nome do Durable Object dela. Salas fixas ganham um prefixo pra nunca cair no
// mesmo objeto de um código.
export function roomObjectName(key: unknown): string | null {
  if (isRoomCode(key)) return key;
  if (typeof key !== 'string' || !key.startsWith(NAMED_PREFIX)) return null;
  const slug = key.slice(NAMED_PREFIX.length);
  return isSlug(slug) ? `sala:${slug}` : null;
}

export const isNamedRoom = (key: string) => key.startsWith(NAMED_PREFIX);
