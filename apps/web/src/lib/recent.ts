import { isNamedRoom } from './api';

// Salas em que você entrou por último, guardadas só neste aparelho (localStorage). Aparecem na
// tela inicial pra ninguém precisar caçar o link de novo.

export interface RecentRoom {
  room: string;
  // Nome da sala fixa (as calls rápidas não têm).
  name?: string;
  at: number;
}

const KEY = 'simplecall:recent';
const MAX = 8;
// Call rápida some da lista depois de um mês sem uso; sala fixa fica até você tirar.
const QUICK_TTL = 30 * 24 * 3600_000;

export function loadRecent(): RecentRoom[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentRoom[];
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    return list
      .filter((r) => r && typeof r.room === 'string' && typeof r.at === 'number')
      .filter((r) => isNamedRoom(r.room) || now - r.at < QUICK_TTL)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function save(list: RecentRoom[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Sem espaço ou modo privado: a lista só não fica salva.
  }
}

// Coloca a sala no topo da lista (ou atualiza o nome dela).
export function rememberRoom(room: string, name?: string) {
  const list = loadRecent();
  const old = list.find((r) => r.room === room);
  save([{ room, name: name ?? old?.name, at: Date.now() }, ...list.filter((r) => r.room !== room)].slice(0, MAX));
}

export function forgetRoom(room: string) {
  save(loadRecent().filter((r) => r.room !== room));
}
