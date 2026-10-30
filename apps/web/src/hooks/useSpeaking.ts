import { useEffect, useState } from 'react';
import type { Mesh } from '../lib/mesh';

const THRESHOLD = 0.04;
const INTERVAL_MS = 150;
// Segura o contorno um pouco depois da última sílaba, pra ele não piscar entre as palavras.
const HOLD_MS = 500;

// Quem está falando agora ("local" = você), pro contorno no quadro. Dos outros, o navegador já
// informa o volume de cada pacote recebido; o seu vem de um analisador no próprio mic.
export function useSpeaking(mesh: Mesh | null) {
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!mesh) return;
    const ctx = new AudioContext();
    void ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const samples = new Float32Array(analyser.fftSize);
    let source: MediaStreamAudioSourceNode | null = null;
    let micTrack: MediaStreamTrack | null = null;
    let last = '';
    const lastHeard = new Map<string, number>();

    const id = setInterval(() => {
      if (mesh.mic !== micTrack) {
        source?.disconnect();
        micTrack = mesh.mic;
        source = micTrack ? ctx.createMediaStreamSource(new MediaStream([micTrack])) : null;
        source?.connect(analyser);
      }
      const t = performance.now();
      if (source) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        if (Math.sqrt(sum / samples.length) > THRESHOLD / 2) lastHeard.set('local', t);
      }
      for (const p of mesh.peers.values()) if (p.micOn && mesh.remoteAudioLevel(p) > THRESHOLD) lastHeard.set(p.id, t);
      const now = [...lastHeard].filter(([, at]) => t - at < HOLD_MS).map(([id]) => id).sort();
      const key = now.join(',');
      if (key !== last) {
        last = key;
        setSpeaking(new Set(now));
      }
    }, INTERVAL_MS);

    return () => {
      clearInterval(id);
      source?.disconnect();
      void ctx.close();
    };
  }, [mesh]);

  return speaking;
}
