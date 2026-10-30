import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { cleanName, isRoomCode } from './rooms.js';

// Sinalização do modo P2P: o servidor só apresenta as pessoas da sala e repassa as mensagens
// de conexão (oferta, resposta e candidatos ICE). Áudio, vídeo e chat vão direto entre elas.

const MAX_PEERS = 6;
const PING_MS = 25_000;

interface Peer {
  id: string;
  name: string;
  ws: WebSocket;
  alive: boolean;
}

const rooms = new Map<string, Map<string, Peer>>();

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function join(ws: WebSocket, code: string, name: string) {
  const room = rooms.get(code) ?? new Map<string, Peer>();
  if (room.size >= MAX_PEERS) {
    send(ws, { type: 'full' });
    return ws.close();
  }
  rooms.set(code, room);

  const peer: Peer = { id: crypto.randomUUID().slice(0, 8), name, ws, alive: true };
  send(ws, { type: 'welcome', id: peer.id, peers: [...room.values()].map(({ id, name }) => ({ id, name })) });
  for (const other of room.values()) send(other.ws, { type: 'join', id: peer.id, name });
  room.set(peer.id, peer);

  ws.on('pong', () => (peer.alive = true));
  ws.on('message', (raw) => {
    let msg: { type?: string; to?: string; data?: unknown };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const target = msg.type === 'signal' && typeof msg.to === 'string' ? room.get(msg.to) : undefined;
    if (target) send(target.ws, { type: 'signal', from: peer.id, data: msg.data });
  });
  ws.on('close', () => {
    room.delete(peer.id);
    if (room.size === 0) rooms.delete(code);
    for (const other of room.values()) send(other.ws, { type: 'leave', id: peer.id });
  });
}

export function attachSignaling(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const code = url.searchParams.get('room');
    const name = cleanName(url.searchParams.get('name'));
    if (url.pathname !== '/api/signal' || !isRoomCode(code) || !name) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => join(ws, code, name));
  });

  // Proxies (como o do Render) derrubam conexões paradas; o ping mantém a sala viva
  // e detecta quem caiu sem avisar.
  setInterval(() => {
    for (const room of rooms.values()) {
      for (const peer of room.values()) {
        if (!peer.alive) peer.ws.terminate();
        peer.alive = false;
        peer.ws.ping();
      }
    }
  }, PING_MS).unref();
}
