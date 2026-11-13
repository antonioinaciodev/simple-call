async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data as T;
}

export const createRoom = () => post<{ room: string }>('/api/rooms').then((r) => r.room);

// STUN (e TURN, se o servidor tiver) pra montar as conexões P2P.
export async function getIceServers(): Promise<RTCIceServer[]> {
  const res = await fetch('/api/ice');
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return ((await res.json()) as { iceServers: RTCIceServer[] }).iceServers;
}

const CODE_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/;
const NAMED_PREFIX = 'sala/';

// Cada sala tem uma "chave", que é o caminho dela no site sem a barra:
// "abc-defg-hij" (call rápida, código aleatório) ou "sala/galera" (sala fixa, com nome).

export const isNamedRoom = (room: string) => room.startsWith(NAMED_PREFIX);
export const roomSlug = (room: string) => (isNamedRoom(room) ? room.slice(NAMED_PREFIX.length) : room);

// "Galera do LoL" → "galera-do-lol": igual ao que o servidor faz ao criar a sala.
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 24)
    .replace(/-+$/, '');
}

export const isSlug = (value: string) => SLUG_RE.test(value);

function codeFrom(segment: string): string | null {
  const letters = segment.replace(/[^a-z]/g, '');
  const code = letters.length === 10 ? `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}` : segment;
  return CODE_RE.test(code) ? code : null;
}

// Endereço da página → sala. Só aceita /abc-defg-hij e /sala/nome.
export function roomFromPath(path: string): string | null {
  const parts = path.toLowerCase().split('/').filter(Boolean);
  if (parts.length === 1) return CODE_RE.test(parts[0]) ? parts[0] : null;
  if (parts.length === 2 && `${parts[0]}/` === NAMED_PREFIX && isSlug(parts[1])) return NAMED_PREFIX + parts[1];
  return null;
}

// O que a pessoa digitou no "Entrar": o código ("kqx-mfta-pzr", com ou sem hífens), o link
// inteiro de qualquer sala, ou o nome de uma sala fixa ("galera" ou "Galera do LoL").
export function parseRoomInput(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const parts = text.replace(/[?#].*$/, '').split('/').filter(Boolean);
  const at = parts.lastIndexOf('sala');
  if (at >= 0 && at === parts.length - 2) return isSlug(parts[at + 1]) ? NAMED_PREFIX + parts[at + 1] : null;
  const code = codeFrom(parts[parts.length - 1] ?? '');
  if (code) return code;
  if (text.includes('/')) return null;
  const slug = slugify(text);
  return isSlug(slug) ? NAMED_PREFIX + slug : null;
}

// ---------- salas fixas e status ----------

export class RoomTakenError extends Error {}

export async function createNamedRoom(name: string): Promise<{ room: string; name: string }> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = (await res.json().catch(() => ({}))) as { room?: string; name?: string; error?: string };
  if (res.status === 409) throw new RoomTakenError(data.error ?? 'Já existe uma sala com esse nome.');
  if (!res.ok || !data.room) throw new Error(data.error ?? `Erro ${res.status}`);
  return { room: data.room, name: data.name ?? name };
}

export interface RoomStatus {
  count: number;
  names: string[];
  max: number;
  name?: string;
  exists?: boolean;
}

export async function getRoomsStatus(rooms: string[]): Promise<Record<string, RoomStatus>> {
  if (!rooms.length) return {};
  const res = await fetch(`/api/rooms/status?rooms=${encodeURIComponent(rooms.join(','))}`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return ((await res.json()) as { rooms: Record<string, RoomStatus> }).rooms;
}
