// Sons curtos da call (alguém entrou, mutou...), gerados na hora: sem arquivo pra baixar.
// O mesmo AudioContext serve pra aumentar o volume de alguém acima de 100% (RemoteAudio).

export type SoundKind = 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen';

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

let ctx: SinkContext | null = null;
let sinkId = '';

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' }) as SinkContext;
    if (sinkId) ctx.setSinkId?.(sinkId).catch(() => {});
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// Segue a saída de áudio escolhida nos ajustes, como as vozes.
export function setSoundOutput(id: string) {
  if (id === sinkId) return;
  sinkId = id;
  ctx?.setSinkId?.(id).catch(() => {});
}

// Notas (Hz) de cada som: subindo = algo ligou/chegou, descendo = desligou/saiu.
const NOTES: Record<SoundKind, number[]> = {
  join: [523, 784],
  leave: [784, 523],
  unmute: [440, 660],
  mute: [660, 440],
  undeafen: [392, 523, 659],
  deafen: [659, 523, 392],
};
const NOTE_S = 0.07;

export function playSound(kind: SoundKind, volume = 1) {
  const ac = audioContext();
  const out = ac.createGain();
  out.gain.value = 0.12 * volume;
  out.connect(ac.destination);
  const start = ac.currentTime + 0.01;
  NOTES[kind].forEach((freq, i) => {
    const t = start + i * NOTE_S;
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Ataque e queda rápidos, sem estalo.
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, t + NOTE_S * 1.6);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + NOTE_S * 1.7);
  });
  setTimeout(() => out.disconnect(), (NOTES[kind].length * NOTE_S + 0.3) * 1000);
}
