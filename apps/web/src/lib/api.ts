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

// Aceita o código puro ("kqx-mfta-pzr"), sem hífens, ou o link inteiro.
export function parseRoomCode(input: string): string | null {
  const last = input.trim().toLowerCase().split('/').filter(Boolean).pop() ?? '';
  const letters = last.replace(/[^a-z]/g, '');
  const code = letters.length === 10 ? `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}` : last;
  return CODE_RE.test(code) ? code : null;
}
