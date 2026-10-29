import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { AccessToken } from 'livekit-server-sdk';
import { cleanName, isRoomCode, newRoomCode } from './rooms.js';

const PORT = Number(process.env.PORT ?? 3001);
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';
const API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'secret';
const TOKEN_TTL = '6h';

if (process.env.NODE_ENV === 'production' && API_SECRET === 'secret') {
  console.error('Defina LIVEKIT_API_KEY e LIVEKIT_API_SECRET de verdade em produção.');
  process.exit(1);
}

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

// Gera o código de uma call nova. A sala só passa a existir no LiveKit quando alguém entra,
// e some sozinha quando fica vazia, então não precisamos guardar nada.
app.post('/api/rooms', (c) => c.json({ room: newRoomCode() }));

app.post('/api/token', async (c) => {
  const body = await c.req.json().catch(() => null);
  const room = body?.room;
  const name = cleanName(body?.name);
  if (!isRoomCode(room)) return c.json({ error: 'Código de call inválido.' }, 400);
  if (!name) return c.json({ error: 'Nome precisa ter de 1 a 32 caracteres.' }, 400);

  // A identidade precisa ser única na sala; o nome pode repetir.
  const identity = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${crypto.randomUUID().slice(0, 6)}`;
  const at = new AccessToken(API_KEY, API_SECRET, { identity, name, ttl: TOKEN_TTL });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

  return c.json({ token: await at.toJwt(), url: LIVEKIT_URL, identity });
});

// Em produção o mesmo processo serve o front já buildado (apps/web/dist).
const webDist = resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: webDist }));
  // Qualquer rota que não seja arquivo (ex.: /kqx-mfta-pzr) cai no index.html do app.
  app.get('*', serveStatic({ root: webDist, path: 'index.html' }));
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`API ouvindo em http://localhost:${info.port} (LiveKit: ${LIVEKIT_URL})`);
});
