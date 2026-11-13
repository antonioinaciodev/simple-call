import type { Room } from './room';
import { cleanName, NAMED_PREFIX, newRoomCode, roomObjectName, slugify, isSlug } from './rooms';

export { Room } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  // TURN da Cloudflare (opcional), configurado como segredo do Worker.
  CF_TURN_KEY_ID?: string;
  CF_TURN_API_TOKEN?: string;
}

// STUN descobre o endereço público de cada um; o TURN repassa a mídia quando a conexão
// direta não rola, comum no 4G e em CGNAT.
const STUN = { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] };

async function iceServers(env: Env) {
  if (!env.CF_TURN_KEY_ID || !env.CF_TURN_API_TOKEN) return [STUN];
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 6 * 3600 }),
    });
    if (!res.ok) throw new Error(`TURN ${res.status}`);
    const { iceServers } = (await res.json()) as { iceServers: unknown[] };
    return [STUN, ...iceServers];
  } catch (err) {
    console.error('Não deu pra gerar credenciais do TURN:', err);
    return [STUN];
  }
}

// Prova pro Android que o app é deste site: com ela, o link de convite abre direto no app
// em vez do navegador (App Links). É a impressão digital (SHA-256) da chave que assina o APK.
const ASSET_LINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'dev.antonioinacio.simplecall',
      sha256_cert_fingerprints: ['66:27:14:6A:86:F3:D5:7E:06:DB:2A:2A:E7:28:47:7C:A2:4A:4C:44:3E:C0:5F:D6:CB:87:A6:7E:D7:9D:8C:87'],
    },
  },
];

const roomStub = (env: Env, objectName: string) => env.ROOMS.get(env.ROOMS.idFromName(objectName));

async function createNamedRoom(env: Env, value: unknown) {
  const name = cleanName(value);
  const slug = name ? slugify(name) : '';
  if (!name || !isSlug(slug)) {
    return Response.json({ error: 'Escolha um nome com pelo menos 3 letras ou números.' }, { status: 400 });
  }
  const room = NAMED_PREFIX + slug;
  const taken = !(await roomStub(env, roomObjectName(room)!).claim(name));
  if (taken) return Response.json({ error: `Já existe a sala /${room}. Escolha outro nome.`, room }, { status: 409 });
  return Response.json({ room, name });
}

// Cada sala da lista é um Durable Object; perguntar a ele é rápido e não acorda nada que
// esteja em call (as conexões continuam hibernando). Limite pra ninguém pedir mil de uma vez.
const STATUS_MAX = 12;

async function roomsStatus(env: Env, list: string | null) {
  const keys = [...new Set((list ?? '').split(',').filter(Boolean))].slice(0, STATUS_MAX);
  const entries = await Promise.all(
    keys.map(async (key) => {
      const objectName = roomObjectName(key);
      if (!objectName) return null;
      try {
        return [key, await roomStub(env, objectName).status()] as const;
      } catch {
        return null;
      }
    }),
  );
  return Response.json(
    { rooms: Object.fromEntries(entries.filter((e) => e !== null)) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/.well-known/assetlinks.json') {
      return Response.json(ASSET_LINKS, { headers: { 'Cache-Control': 'public, max-age=3600' } });
    }

    if (url.pathname === '/api/health') return Response.json({ ok: true });

    // Sem corpo: gera o código de uma call rápida. Com { name }: cria uma sala fixa com esse nome.
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
      if (body?.name === undefined) return Response.json({ room: newRoomCode() });
      return createNamedRoom(env, body.name);
    }

    // Quantas pessoas estão em cada sala (a lista de recentes da tela inicial pergunta isso).
    if (url.pathname === '/api/rooms/status') return roomsStatus(env, url.searchParams.get('rooms'));

    if (url.pathname === '/api/ice') return Response.json({ iceServers: await iceServers(env) });

    // Cada call é um Durable Object: todo mundo da mesma call cai na mesma instância,
    // que guarda os WebSockets e repassa as mensagens de conexão.
    if (url.pathname === '/api/signal') {
      const room = roomObjectName(url.searchParams.get('room'));
      if (!room || !cleanName(url.searchParams.get('name'))) return new Response('Call ou nome inválido.', { status: 400 });
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Esperava um WebSocket.', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }

    if (url.pathname.startsWith('/api/')) return new Response('Não encontrado.', { status: 404 });
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
