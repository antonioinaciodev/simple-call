import type { Peer } from './mesh';

// Estatísticas de uma conexão P2P, lidas uma vez por segundo. O bitrate sai da diferença de bytes
// entre duas leituras, por isso guardamos a leitura anterior de cada conexão.

export interface PeerStats {
  rtt?: number;
  // host = mesma rede, srflx = direto pela internet, relay = passando pelo TURN.
  route?: string;
  sending?: string;
  receiving?: string;
}

interface Prev {
  ts: number;
  sent: number;
  received: number;
}

const prevByPeer = new WeakMap<RTCPeerConnection, Prev>();

const LIMITS: Record<string, string> = { cpu: 'limitado por CPU', bandwidth: 'limitado por banda' };
const ROUTES: Record<string, string> = { host: 'direto (mesma rede)', srflx: 'direto', prflx: 'direto', relay: 'via TURN' };

const mbps = (bps: number) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mbps` : `${Math.round(bps / 1e3)} kbps`);

export async function readStats(peer: Peer): Promise<PeerStats> {
  const report = await peer.pc.getStats();
  const byId = new Map<string, Record<string, unknown>>();
  report.forEach((s) => byId.set(s.id, s));

  const out: PeerStats = {};
  let sentBytes = 0;
  let receivedBytes = 0;
  let outVideo: Record<string, number | string> | undefined;
  let inVideo: Record<string, number | string> | undefined;

  report.forEach((s) => {
    if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') {
      if (typeof s.currentRoundTripTime === 'number') out.rtt = s.currentRoundTripTime;
      const local = byId.get(s.localCandidateId);
      const remote = byId.get(s.remoteCandidateId);
      const type = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : String(local?.candidateType ?? '');
      out.route = ROUTES[type] ?? type;
    }
    if (s.type === 'outbound-rtp' && s.kind === 'video' && (s.framesPerSecond ?? 0) > 0) {
      outVideo = s;
      sentBytes += s.bytesSent ?? 0;
    }
    if (s.type === 'inbound-rtp' && s.kind === 'video' && s.frameWidth) {
      inVideo = s;
      receivedBytes += s.bytesReceived ?? 0;
    }
  });

  const now = performance.now();
  const prev = prevByPeer.get(peer.pc);
  prevByPeer.set(peer.pc, { ts: now, sent: sentBytes, received: receivedBytes });
  const secs = prev ? (now - prev.ts) / 1000 : 0;
  const rate = (bytes: number, before: number) => (secs > 0 && bytes >= before ? ((bytes - before) * 8) / secs : 0);

  if (outVideo) {
    const limit = LIMITS[String(outVideo.qualityLimitationReason)];
    out.sending = [
      `${outVideo.frameWidth}×${outVideo.frameHeight}`,
      `${Math.round(Number(outVideo.framesPerSecond))} fps`,
      mbps(rate(sentBytes, prev?.sent ?? 0)),
      String(outVideo.encoderImplementation ?? ''),
      limit ?? '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (inVideo) {
    out.receiving = [
      `${inVideo.frameWidth}×${inVideo.frameHeight}`,
      `${Math.round(Number(inVideo.framesPerSecond ?? 0))} fps`,
      mbps(rate(receivedBytes, prev?.received ?? 0)),
      `${inVideo.packetsLost ?? 0} pacotes perdidos`,
    ].join(' · ');
  }
  return out;
}
