import type { MediaKind, Peer } from './mesh';

// Estatísticas de uma conexão P2P, lidas uma vez por segundo. O bitrate sai da diferença de bytes
// entre duas leituras, por isso guardamos a leitura anterior de cada faixa.

export interface PeerStats {
  rtt?: number;
  // host = mesma rede, srflx = direto pela internet, relay = passando pelo TURN.
  route?: string;
  lines: string[];
}

const prevBytes = new Map<string, { ts: number; bytes: number }>();

const LIMITS: Record<string, string> = { cpu: 'limitado por CPU', bandwidth: 'limitado por banda' };
const ROUTES: Record<string, string> = { host: 'direto (mesma rede)', srflx: 'direto', prflx: 'direto', relay: 'via TURN' };
const KIND_LABEL: Record<MediaKind, string> = { mic: 'mic', camera: 'câmera', screen: 'tela', screenAudio: 'áudio da tela' };

const mbps = (bps: number) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mbps` : `${Math.round(bps / 1e3)} kbps`);

function bitrate(key: string, bytes: number, ts: number) {
  const prev = prevBytes.get(key);
  prevBytes.set(key, { ts, bytes });
  return prev && ts > prev.ts && bytes >= prev.bytes ? ((bytes - prev.bytes) * 8 * 1000) / (ts - prev.ts) : 0;
}

export async function readStats(peer: Peer): Promise<PeerStats> {
  const report = await peer.pc.getStats();
  const byId = new Map<string, Record<string, unknown>>();
  report.forEach((s) => byId.set(s.id, s));

  // mid de cada faixa enviada, pra saber se o outbound-rtp é câmera ou tela.
  const sendingKinds = new Map<string, MediaKind>();
  for (const [kind, tx] of Object.entries(peer.sending)) if (tx.mid) sendingKinds.set(tx.mid, kind as MediaKind);

  const out: PeerStats = { lines: [] };
  report.forEach((s) => {
    if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') {
      if (typeof s.currentRoundTripTime === 'number') out.rtt = s.currentRoundTripTime;
      const local = byId.get(s.localCandidateId);
      const remote = byId.get(s.remoteCandidateId);
      const type = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : String(local?.candidateType ?? '');
      out.route = ROUTES[type] ?? type;
    }
    if (s.type === 'outbound-rtp' && s.kind === 'video' && (s.framesPerSecond ?? 0) > 0) {
      const kind = sendingKinds.get(s.mid) ?? 'camera';
      const limit = LIMITS[s.qualityLimitationReason];
      out.lines.push(
        [
          `enviando ${KIND_LABEL[kind]}`,
          `${s.frameWidth}×${s.frameHeight}`,
          `${Math.round(s.framesPerSecond)} fps`,
          mbps(bitrate(`${peer.id}:${s.id}`, s.bytesSent ?? 0, s.timestamp)),
          s.encoderImplementation ?? '',
          limit ?? '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
    }
    if (s.type === 'inbound-rtp' && s.kind === 'video' && s.frameWidth) {
      const kind = peer.remoteKinds[s.mid] ?? 'camera';
      out.lines.push(
        [
          `recebendo ${KIND_LABEL[kind]}`,
          `${s.frameWidth}×${s.frameHeight}`,
          `${Math.round(s.framesPerSecond ?? 0)} fps`,
          mbps(bitrate(`${peer.id}:${s.id}`, s.bytesReceived ?? 0, s.timestamp)),
          `${s.packetsLost ?? 0} pacotes perdidos`,
        ].join(' · '),
      );
    }
  });
  return out;
}
