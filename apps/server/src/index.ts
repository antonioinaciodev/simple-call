import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { newRoomCode } from './rooms.js';
import { attachSignaling } from './signal.js';

// Carrega o .env da raiz do repositório, se existir (vale pra src/ e dist/).
try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'));
} catch {
  // Sem .env: usa as variáveis do ambiente e os padrões do modo dev.
}

const PORT = Number(process.env.PORT ?? 3001);

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

// Gera o código de uma call nova. A sala só existe enquanto tem alguém conectado
// na sinalização, então não precisamos guardar nada.
app.post('/api/rooms', (c) => c.json({ room: newRoomCode() }));

// Servidores ICE pras conexões P2P. STUN descobre o endereço público de cada um; o TURN (opcional,
// da Cloudflare) repassa a mídia quando a conexão direta não rola, comum no 4G e em CGNAT.
const STUN = { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] };
const TURN_KEY_ID = process.env.CF_TURN_KEY_ID;
const TURN_API_TOKEN = process.env.CF_TURN_API_TOKEN;

app.get('/api/ice', async (c) => {
  if (!TURN_KEY_ID || !TURN_API_TOKEN) return c.json({ iceServers: [STUN] });
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 6 * 3600 }),
    });
    if (!res.ok) throw new Error(`TURN ${res.status}`);
    const { iceServers } = (await res.json()) as { iceServers: unknown[] };
    return c.json({ iceServers: [STUN, ...iceServers] });
  } catch (err) {
    console.error('Não deu pra gerar credenciais do TURN:', err);
    return c.json({ iceServers: [STUN] });
  }
});

// Em produção o mesmo processo serve o front já buildado (apps/web/dist).
const webDist = resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: webDist }));
  // Qualquer rota que não seja arquivo (ex.: /kqx-mfta-pzr) cai no index.html do app.
  app.get('*', serveStatic({ root: webDist, path: 'index.html' }));
}

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`API ouvindo em http://localhost:${info.port}`);
});
attachSignaling(server as Server);
