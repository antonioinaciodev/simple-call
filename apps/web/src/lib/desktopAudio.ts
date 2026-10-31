// Transforma o PCM que o app desktop manda (áudio só do jogo) numa faixa de áudio normal,
// que entra na transmissão como se tivesse vindo do getDisplayMedia.
import { desktop } from './native';

const RATE = 48000;
const FRAME_BYTES = 8; // float32 × 2 canais

// Roda na thread de áudio: fila curta de amostras, completando com silêncio quando falta.
// Guarda ~20 ms antes de começar e descarta o que passar de ~120 ms, pra latência ficar baixa.
const WORKLET = `
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(${RATE} * 2);
    this.read = 0;
    this.size = 0;
    this.started = false;
    this.port.onmessage = (e) => this.push(e.data);
  }
  push(samples) {
    const cap = this.buf.length;
    for (let i = 0; i < samples.length; i++) this.buf[(this.read + this.size + i) % cap] = samples[i];
    this.size = Math.min(cap, this.size + samples.length);
    const max = ${Math.round(RATE * 0.12)} * 2;
    if (this.size > max) {
      this.read = (this.read + this.size - max) % cap;
      this.size = max;
    }
  }
  process(_inputs, outputs) {
    const [l, r] = outputs[0];
    const n = l.length;
    if (!this.started && this.size < ${Math.round(RATE * 0.02)} * 2) return true;
    this.started = this.size > 0;
    const cap = this.buf.length;
    for (let i = 0; i < n; i++) {
      if (this.size >= 2) {
        l[i] = this.buf[this.read];
        r[i] = this.buf[(this.read + 1) % cap];
        this.read = (this.read + 2) % cap;
        this.size -= 2;
      } else {
        l[i] = r[i] = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-player', PcmPlayer);
`;

export interface AppAudio {
  track: MediaStreamTrack;
  stop: () => void;
}

// Liga a captura no app e devolve a faixa. Lança erro com o motivo se não der.
export async function startAppAudio(onEnded: () => void): Promise<AppAudio> {
  if (!desktop?.startAudio || !desktop.onAudio) throw new Error('unsupported');
  const ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(ctx, 'pcm-player', { numberOfInputs: 0, outputChannelCount: [2] });
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 2;
  node.connect(dest);

  // Os pedaços chegam em qualquer tamanho; sobra de quadro incompleto fica pro próximo.
  let rest = new Uint8Array(0);
  const off = desktop.onAudio(
    (chunk) => {
      let bytes = chunk;
      if (rest.length) {
        bytes = new Uint8Array(rest.length + chunk.length);
        bytes.set(rest);
        bytes.set(chunk, rest.length);
      }
      const usable = bytes.length - (bytes.length % FRAME_BYTES);
      rest = bytes.slice(usable);
      if (!usable) return;
      const samples = new Float32Array(bytes.slice(0, usable).buffer);
      node.port.postMessage(samples, [samples.buffer]);
    },
    () => onEnded(),
  );

  const result = await desktop.startAudio();
  if (!result?.ok) {
    off();
    void ctx.close();
    throw new Error(result?.error ?? 'failed');
  }
  void ctx.resume();

  const track = dest.stream.getAudioTracks()[0];
  return {
    track,
    stop: () => {
      off();
      void desktop!.stopAudio?.();
      track.stop();
      void ctx.close();
    },
  };
}
