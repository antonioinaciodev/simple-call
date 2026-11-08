// Sons curtos da call (alguém entrou, mutou...), gerados na hora: sem arquivo pra baixar.
// O mesmo AudioContext serve pra aumentar o volume de alguém acima de 100% (RemoteAudio).

export type SoundKind =
  | 'join'
  | 'leave'
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'
  | 'stream'
  | 'camOn'
  | 'camOff'
  | 'shareOn'
  | 'shareOff'
  | 'message'
  | 'tap';

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

// Cada som: notas (Hz), duração de cada uma, volume relativo e timbre. Subindo = algo
// ligou/chegou, descendo = desligou/saiu. Tudo curto e baixo, pra não cansar.
interface Sound {
  notes: number[];
  note?: number;
  gain?: number;
  wave?: OscillatorType;
}

const SOUNDS: Record<SoundKind, Sound> = {
  join: { notes: [523, 784] },
  leave: { notes: [784, 523] },
  unmute: { notes: [440, 660] },
  mute: { notes: [660, 440] },
  undeafen: { notes: [392, 523, 659] },
  deafen: { notes: [659, 523, 392] },
  // Alguém começou a transmitir.
  stream: { notes: [587, 880] },
  camOn: { notes: [494, 740], gain: 0.8, wave: 'triangle' },
  camOff: { notes: [740, 494], gain: 0.8, wave: 'triangle' },
  shareOn: { notes: [523, 659, 784], note: 0.05, wave: 'triangle' },
  shareOff: { notes: [784, 659, 523], note: 0.05, wave: 'triangle' },
  // Mensagem nova no chat fechado.
  message: { notes: [880, 1175], note: 0.05, gain: 0.6 },
  // Clique em botão: um "tic" quase imperceptível.
  tap: { notes: [1500], note: 0.018, gain: 0.35, wave: 'triangle' },
};
const NOTE_S = 0.07;

export function playSound(kind: SoundKind, volume = 1) {
  const { notes, note = NOTE_S, gain = 1, wave = 'sine' } = SOUNDS[kind];
  const ac = audioContext();
  const out = ac.createGain();
  out.gain.value = 0.12 * volume * gain;
  out.connect(ac.destination);
  const start = ac.currentTime + 0.01;
  notes.forEach((freq, i) => {
    const t = start + i * note;
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    // Ataque e queda rápidos, sem estalo.
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + Math.min(0.008, note / 3));
    env.gain.exponentialRampToValueAtTime(0.001, t + note * 1.6);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + note * 1.7);
  });
  setTimeout(() => out.disconnect(), (notes.length * note + 0.3) * 1000);
}
