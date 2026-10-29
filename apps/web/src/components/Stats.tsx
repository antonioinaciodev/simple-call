import { useRoomContext } from '@livekit/components-react';
import { LocalAudioTrack, LocalVideoTrack, RemoteVideoTrack, Track, type Room } from 'livekit-client';
import { useEffect, useState } from 'react';

interface Line {
  title: string;
  detail: string;
}

const mbps = (bps: number) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mbps` : `${Math.round(bps / 1e3)} kbps`);
const codec = (mime?: string) => mime?.split('/')[1]?.toUpperCase() ?? '';
const what = (source: Track.Source) =>
  source === Track.Source.ScreenShare ? 'tela' : source === Track.Source.ScreenShareAudio ? 'áudio da tela' : source === Track.Source.Microphone ? 'mic' : 'câmera';
const LIMITS: Record<string, string> = { cpu: 'CPU', bandwidth: 'banda' };

// Ping até o servidor: lê o par de candidatos ICE ativo de qualquer faixa (enviada ou recebida).
async function iceRtt(room: Room): Promise<number | undefined> {
  const tracks = [
    ...[...room.localParticipant.trackPublications.values()].map((p) => p.track),
    ...[...room.remoteParticipants.values()].flatMap((p) => [...p.trackPublications.values()].map((pub) => pub.track)),
  ];
  for (const t of tracks) {
    const report = await t?.getRTCStatsReport();
    for (const s of report?.values() ?? []) {
      if (s.type === 'candidate-pair' && s.nominated && typeof s.currentRoundTripTime === 'number') {
        return s.currentRoundTripTime;
      }
    }
  }
}

export function Stats() {
  const room = useRoomContext();
  const [rtt, setRtt] = useState<number>();
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    let alive = true;
    const prevFrames = new Map<string, { frames: number; ts: number }>();

    async function tick() {
      const out: Line[] = [];
      for (const pub of room.localParticipant.trackPublications.values()) {
        const t = pub.track;
        if (t instanceof LocalVideoTrack) {
          const layers = await t.getSenderStats();
          // Com simulcast há várias camadas; mostramos a maior que está de fato sendo enviada
          // (o dynacast pausa camadas que ninguém está assistindo).
          const active = layers.filter((l) => (l.framesPerSecond ?? 0) > 0);
          const top = (active.length ? active : layers).reduce<(typeof layers)[number] | undefined>(
            (best, l) => (!best || (l.frameWidth ?? 0) > (best.frameWidth ?? 0) ? l : best),
            undefined,
          );
          if (!top) continue;
          const limit = top.qualityLimitationReason && LIMITS[top.qualityLimitationReason];
          out.push({
            title: `Enviando ${what(pub.source)}`,
            detail: [
              `${top.frameWidth}×${top.frameHeight}`,
              `${Math.round(top.framesPerSecond ?? 0)} fps`,
              mbps(t.currentBitrate),
              codec(pub.mimeType),
              limit ? `limitado por ${limit}` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          });
        } else if (t instanceof LocalAudioTrack) {
          out.push({ title: `Enviando ${what(pub.source)}`, detail: `${mbps(t.currentBitrate)} · ${codec(pub.mimeType) || 'OPUS'}` });
        }
      }
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          const t = pub.track;
          if (!(t instanceof RemoteVideoTrack)) continue;
          const s = await t.getReceiverStats();
          if (!s) continue;
          const key = pub.trackSid;
          const prev = prevFrames.get(key);
          const fps = prev && s.timestamp > prev.ts ? ((s.framesDecoded - prev.frames) * 1000) / (s.timestamp - prev.ts) : 0;
          prevFrames.set(key, { frames: s.framesDecoded, ts: s.timestamp });
          out.push({
            title: `${p.name || p.identity}: ${what(pub.source)}`,
            detail: [
              s.frameWidth ? `${s.frameWidth}×${s.frameHeight}` : '',
              `${Math.round(fps)} fps`,
              mbps(t.currentBitrate),
              codec(s.mimeType),
              `${s.packetsLost ?? 0} pacotes perdidos`,
            ]
              .filter(Boolean)
              .join(' · '),
          });
        }
      }
      const r = await iceRtt(room);
      if (!alive) return;
      setLines(out);
      setRtt(r);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [room]);

  return (
    <div className="stats" aria-live="off">
      <div className="stats-row">
        <span>Ping</span>
        <strong>{rtt !== undefined ? `${Math.round(rtt * 1000)} ms` : '—'}</strong>
      </div>
      {lines.map((l) => (
        <div key={l.title} className="stats-row col">
          <span>{l.title}</span>
          <strong>{l.detail}</strong>
        </div>
      ))}
      {lines.length === 0 && <p className="muted small">Nada sendo enviado ou recebido ainda.</p>}
    </div>
  );
}
