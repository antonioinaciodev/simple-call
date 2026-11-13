import { isNamedRoom } from './api';

// Salas em que você entrou por último, guardadas só neste aparelho (localStorage). Aparecem na
// tela inicial pra ninguém precisar caçar o link de novo. As que ganharam alfinete vão pra seção
// "Fixos", ficam lá até você tirar o alfinete e não contam no limite das recentes.

export interface RecentRoom {
  room: string;
  // Nome da sala fixa (as calls rápidas não têm).
  name?: string;
  at: number;
  pinned?: boolean;
}

const KEY = 'simplecall:recent';
const MAX = 8;
const MAX_PINNED = 8;
// Call rápida some da lista depois de um mês sem uso; sala fixa (ou com alfinete) fica até você tirar.
const QUICK_TTL = 30 * 24 * 3600_000;

export function loadRecent(): RecentRoom[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentRoom[];
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    const valid = list.filter((r) => r && typeof r.room === 'string' && typeof r.at === 'number');
    const pinned = valid.filter((r) => r.pinned).slice(0, MAX_PINNED);
    const rest = valid.filter((r) => !r.pinned && (isNamedRoom(r.room) || now - r.at < QUICK_TTL)).slice(0, MAX);
    return [...pinned, ...rest];
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

// Coloca a sala no topo das recentes (ou atualiza o nome dela). Se tem alfinete, continua fixada.
export function rememberRoom(room: string, name?: string) {
  const list = loadRecent();
  const old = list.find((r) => r.room === room);
  // Fixada não muda de lugar: a ordem dos fixos é a que você escolheu.
  if (old?.pinned) return save(list.map((r) => (r.room === room ? { ...r, name: name ?? r.name, at: Date.now() } : r)));
  save([{ room, name: name ?? old?.name, at: Date.now() }, ...list.filter((r) => r.room !== room)]);
}

export function forgetRoom(room: string) {
  save(loadRecent().filter((r) => r.room !== room));
}

// Alfinete: fixada vai pro fim da lista de fixos; desafixada volta pras recentes.
export function setPinned(room: string, pinned: boolean) {
  const list = loadRecent();
  const old = list.find((r) => r.room === room);
  if (!old) return;
  const rest = list.filter((r) => r.room !== room);
  const entry: RecentRoom = { ...old, pinned: pinned || undefined };
  if (!entry.pinned) delete entry.pinned;
  save(pinned ? [...rest.filter((r) => r.pinned), entry, ...rest.filter((r) => !r.pinned)] : [entry, ...rest]);
}
