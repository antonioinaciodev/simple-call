import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { cleanName } from './rooms';

// Sinalização de uma call: apresenta as pessoas e repassa oferta, resposta e candidatos ICE.
// Áudio, vídeo e chat vão direto entre os navegadores e nunca passam por aqui.
//
// Usa a "hibernação" de WebSockets: entre uma mensagem e outra o objeto sai da memória e
// a Cloudflare segura as conexões, então uma call parada não gasta nada do plano grátis.

const MAX_PEERS = 6;

interface Attachment {
  id: string;
  name: string;
}

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // O navegador manda um ping a cada 30 s pra conexão não ser derrubada por inatividade;
    // a resposta automática não acorda o objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  private peers() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, ...(ws.deserializeAttachment() as Attachment) }));
  }

  async fetch(req: Request): Promise<Response> {
    const name = cleanName(new URL(req.url).searchParams.get('name')) ?? 'Sem nome';
    const [client, server] = Object.values(new WebSocketPair());
    const others = this.peers();

    this.ctx.acceptWebSocket(server);
    if (others.length >= MAX_PEERS) {
      server.send(JSON.stringify({ type: 'full' }));
      server.close(1000, 'cheia');
      return new Response(null, { status: 101, webSocket: client });
    }

    const me: Attachment = { id: crypto.randomUUID().slice(0, 8), name };
    server.serializeAttachment(me);
    server.send(JSON.stringify({ type: 'welcome', id: me.id, peers: others.map(({ id, name }) => ({ id, name })) }));
    for (const o of others) o.ws.send(JSON.stringify({ type: 'join', ...me }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 64 * 1024) return;
    let msg: { type?: string; to?: string; data?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type !== 'signal' || typeof msg.to !== 'string') return;
    const from = ws.deserializeAttachment() as Attachment;
    const target = this.peers().find((p) => p.id === msg.to);
    target?.ws.send(JSON.stringify({ type: 'signal', from: from.id, data: msg.data }));
  }

  async webSocketClose(ws: WebSocket) {
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.leave(ws);
  }

  private leave(ws: WebSocket) {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me) return;
    for (const p of this.peers()) if (p.ws !== ws) p.ws.send(JSON.stringify({ type: 'leave', id: me.id }));
  }
}
