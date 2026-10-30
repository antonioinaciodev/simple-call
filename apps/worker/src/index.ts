import { cleanName, isRoomCode, newRoomCode } from './rooms';

export { Room } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace;
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/health') return Response.json({ ok: true });

    // Gera o código de uma call nova. A sala só existe enquanto tem alguém na sinalização.
    if (url.pathname === '/api/rooms' && req.method === 'POST') return Response.json({ room: newRoomCode() });

    if (url.pathname === '/api/ice') return Response.json({ iceServers: await iceServers(env) });

    // Cada call é um Durable Object: todo mundo da mesma call cai na mesma instância,
    // que guarda os WebSockets e repassa as mensagens de conexão.
    if (url.pathname === '/api/signal') {
      const room = url.searchParams.get('room');
      if (!isRoomCode(room) || !cleanName(url.searchParams.get('name'))) return new Response('Call ou nome inválido.', { status: 400 });
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Esperava um WebSocket.', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }

    if (url.pathname.startsWith('/api/')) return new Response('Não encontrado.', { status: 404 });
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
