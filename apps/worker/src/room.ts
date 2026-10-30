import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { cleanName } from './rooms';

// Sinalização de uma call: apresenta as pessoas e repassa oferta, resposta e candidatos ICE.
// Áudio, vídeo e chat vão direto entre os navegadores e nunca passam por aqui.
//
// Usa a "hibernação" de WebSockets: entre uma mensagem e outra o objeto sai da memória e
// a Cloudflare segura as conexões, então uma call parada não gasta nada do plano grátis.

const MAX_PEERS = 6;
// Quanto tempo quem caiu sem sair (internet piscou, trocou de Wi-Fi pro 4G) continua na call
// esperando reconectar. Só depois disso os outros ficam sabendo que a pessoa saiu.
const GRACE_MS = 15_000;

interface Attachment {
  id: string;
  name: string;
  // Segredo que só o navegador da pessoa conhece: prova que é ela voltando com o mesmo id.
  token: string;
  // Essa conexão foi trocada por uma nova da mesma pessoa e não conta mais.
  replaced?: boolean;
}

// Quem caiu e ainda pode voltar, guardado no armazenamento do objeto (sobrevive à hibernação).
interface Away extends Attachment {
  until: number;
}

const AWAY = 'away:';

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // O navegador manda um ping a cada 10 s pra conexão não ser derrubada por inatividade e pra
    // perceber logo quando ela morreu; a resposta automática não acorda o objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  private online() {
    return this.ctx
      .getWebSockets()
      .map((ws) => ({ ws, ...(ws.deserializeAttachment() as Attachment | null) }))
      .filter((p): p is { ws: WebSocket } & Attachment => !!p.id && !p.replaced);
  }

  private async away() {
    return [...(await this.ctx.storage.list<Away>({ prefix: AWAY })).values()];
  }

  async fetch(req: Request): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const name = cleanName(params.get('name')) ?? 'Sem nome';
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);

    const back = await this.resume(params.get('id'), params.get('token'));
    const online = this.online();
    const away = (await this.away()).filter((a) => a.id !== back?.id);
    // Quem está fora esperando reconectar continua na call: entra na lista e ocupa vaga.
    const others = [...online.map(({ id, name }) => ({ id, name })), ...away.map(({ id, name }) => ({ id, name }))];

    if (!back && others.length >= MAX_PEERS) {
      server.send(JSON.stringify({ type: 'full' }));
      server.close(1000, 'cheia');
      return new Response(null, { status: 101, webSocket: client });
    }

    const me: Attachment = back ?? { id: crypto.randomUUID().slice(0, 8), name, token: crypto.randomUUID() };
    server.serializeAttachment(me);
    server.send(JSON.stringify({ type: 'welcome', id: me.id, token: me.token, peers: others }));
    // Quem voltou já era conhecido de todo mundo: ninguém precisa saber que entrou de novo.
    if (!back) for (const o of online) send(o.ws, { type: 'join', id: me.id, name: me.name });
    return new Response(null, { status: 101, webSocket: client });
  }

  // A pessoa voltando com o mesmo id: ou já caiu e está na espera, ou o servidor ainda nem percebeu
  // que a conexão antiga morreu (comum no celular, que troca de rede sem fechar nada).
  private async resume(id: string | null, token: string | null): Promise<Attachment | null> {
    if (!id || !token) return null;
    const away = await this.ctx.storage.get<Away>(AWAY + id);
    const old = this.online().find((p) => p.id === id);
    const known = away ?? old;
    if (!known || known.token !== token) return null;
    if (away) await this.ctx.storage.delete(AWAY + id);
    if (old) {
      const { ws, ...attachment } = old;
      try {
        ws.serializeAttachment({ ...attachment, replaced: true });
        ws.close(1000, 'reconectou');
      } catch {
        // Já estava fechada.
      }
    }
    return { id: known.id, name: known.name, token: known.token };
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
    if (from.replaced) return;
    const target = this.online().find((p) => p.id === msg.to);
    if (target) send(target.ws, { type: 'signal', from: from.id, data: msg.data });
  }

  // 1000 é o "Sair" do app e 1001 é fechar ou recarregar a aba: aí a pessoa saiu mesmo.
  // Qualquer outro jeito de fechar é queda e ela ganha um tempo pra voltar.
  async webSocketClose(ws: WebSocket, code: number) {
    // Responde o fechamento pra completar o "aperto de mão": sem isso o navegador fica esperando.
    try {
      ws.close(1000);
    } catch {
      // Já fechada.
    }
    await this.drop(ws, code === 1000 || code === 1001);
  }

  async webSocketError(ws: WebSocket) {
    await this.drop(ws, false);
  }

  private async drop(ws: WebSocket, left: boolean) {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me || me.replaced) return;
    try {
      ws.serializeAttachment({ ...me, replaced: true });
    } catch {
      // Já fechada: o getWebSockets não lista mais ela.
    }
    if (left) return this.announceLeave(me.id);
    const until = Date.now() + GRACE_MS;
    await this.ctx.storage.put<Away>(AWAY + me.id, { ...me, until });
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || alarm > until) await this.ctx.storage.setAlarm(until);
  }

  // Acabou o tempo de quem caiu e não voltou: agora sim avisa que a pessoa saiu.
  async alarm() {
    const now = Date.now();
    let next = Infinity;
    for (const a of await this.away()) {
      if (a.until > now) next = Math.min(next, a.until);
      else {
        await this.ctx.storage.delete(AWAY + a.id);
        this.announceLeave(a.id);
      }
    }
    if (next !== Infinity) await this.ctx.storage.setAlarm(next);
  }

  private announceLeave(id: string) {
    for (const p of this.online()) send(p.ws, { type: 'leave', id });
  }
}

// Mandar pra uma conexão que acabou de morrer dá erro; quem estiver nela vai reconectar.
function send(ws: WebSocket, msg: unknown) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Ignora.
  }
}
