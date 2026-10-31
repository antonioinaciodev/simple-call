import type { MediaKind, VideoCodec } from './mesh';

// Ajuste fino do encoder: o que cada faixa pede ao navegador pra ir leve e nítida.
// Ideias tiradas do Vcall (github.com/victor-kauan-coder/Vcall), adaptadas pra cá.

// ---------- prioridade ----------

// Quando a banda aperta, o navegador reparte entre as faixas da mesma conexão por essa ordem:
// a voz e a transmissão ganham da câmera. networkPriority marca os pacotes pro roteador (DSCP).
type Priority = 'very-low' | 'low' | 'medium' | 'high';
export const PRIORITY: Record<MediaKind, Priority> = { mic: 'high', screen: 'high', screenAudio: 'medium', camera: 'low' };

export type Encoding = RTCRtpEncodingParameters & { priority?: Priority; networkPriority?: Priority };

// ---------- codec ----------

type Codec = Exclude<VideoCodec, 'auto'>;

// O que a placa de vídeo DESTE aparelho codifica e decodifica sem pesar (powerEfficient),
// em 1080p60. Pergunta uma vez só: a placa não muda no meio da call.
export interface HardwareCodecs {
  encode: Codec[];
  decode: Codec[];
}

let hardware: Promise<HardwareCodecs> | null = null;

export function hardwareCodecs(): Promise<HardwareCodecs> {
  hardware ??= (async () => {
    const out: HardwareCodecs = { encode: [], decode: [] };
    const caps = navigator.mediaCapabilities;
    if (!caps) return out;
    const video = (codec: Codec) => ({ contentType: `video/${codec.toUpperCase()}`, width: 1920, height: 1080, framerate: 60, bitrate: 8_000_000 });
    // H.264 fica de fora da pergunta: o Chrome no Windows responde "não" mesmo com encoder de
    // hardware, e quase toda placa tem. Ele entra pela regra em pickCodec.
    await Promise.all(
      (['av1', 'vp9'] as const).map(async (codec) => {
        if (!supports(codec)) return;
        const [enc, dec] = await Promise.all([
          caps.encodingInfo({ type: 'webrtc', video: video(codec) }).catch(() => null),
          caps.decodingInfo({ type: 'webrtc', video: video(codec) }).catch(() => null),
        ]);
        if (enc?.supported && enc.powerEfficient) out.encode.push(codec);
        if (dec?.supported && dec.powerEfficient) out.decode.push(codec);
      }),
    );
    return out;
  })();
  return hardware;
}

const supports = (codec: Codec) =>
  !!RTCRtpReceiver.getCapabilities?.('video')?.codecs.some((c) => c.mimeType.toLowerCase() === `video/${codec}`);

// "Automático": o codec mais eficiente que eu codifico na placa E a pessoa decodifica na placa dela
// (AV1 e depois VP9). Sem nenhum em comum: H.264 pra jogo (toda placa codifica, quase nada de CPU)
// e VP9 pra texto (tela parada custa pouco e o VP9 deixa a letra bem mais nítida).
export function pickCodec(choice: VideoCodec, motion: boolean, mine: HardwareCodecs | null, theirs: string[] | undefined): Codec {
  if (choice !== 'auto') return choice;
  const both = (['av1', 'vp9'] as const).find((c) => mine?.encode.includes(c) && theirs?.includes(c));
  if (both) return both;
  return motion || !supports('vp9') ? 'h264' : 'vp9';
}

// Coloca o codec escolhido na frente; os outros (e o rtx/red, que fazem a retransmissão)
// continuam na lista, senão a imagem congela na primeira perda de pacote.
export function preferCodec(tx: RTCRtpTransceiver, codec: Codec) {
  const caps = RTCRtpReceiver.getCapabilities?.('video')?.codecs;
  if (!caps) return;
  const mime = `video/${codec}`;
  // VP9: só o perfil 0 (8 bits), o rápido. O 10 bits custa caro sem ganho aqui.
  const first = caps.filter((c) => c.mimeType.toLowerCase() === mime && !(codec === 'vp9' && c.sdpFmtpLine && !/profile-id=0/.test(c.sdpFmtpLine)));
  if (!first.length) return;
  try {
    tx.setCodecPreferences([...first, ...caps.filter((c) => !first.includes(c))]);
  } catch {
    // Navegador sem suporte: fica com a ordem padrão.
  }
}

// Voz com redundância (RED): cada pacote leva junto uma cópia do anterior, então um pacote perdido
// é refeito pelo seguinte, sem esperar reenvio. É o que segura a voz em Wi-Fi ruim e 4G (o Meet usa).
// Custa o dobro de uma banda pequena, e só enquanto a pessoa fala (com DTX o silêncio é quase zero).
// O Opus puro continua logo atrás pra quem não tem RED.
export function preferRed(tx: RTCRtpTransceiver) {
  const caps = RTCRtpReceiver.getCapabilities?.('audio')?.codecs;
  if (!caps) return;
  const red = caps.filter((c) => c.mimeType.toLowerCase() === 'audio/red');
  const opus = caps.filter((c) => c.mimeType.toLowerCase() === 'audio/opus');
  if (!red.length || !opus.length) return;
  try {
    tx.setCodecPreferences([...red, ...opus, ...caps.filter((c) => !red.includes(c) && !opus.includes(c))]);
  } catch {
    // Sem RED: Opus puro.
  }
}

// ---------- descrição da conexão (SDP) ----------

// O Chrome começa todo vídeo a ~300 kbps e sobe devagar: a transmissão ficaria uns 20 segundos
// borrada até chegar no bitrate certo. Esse parâmetro (não oficial, mas suportado há anos) faz
// ele começar mais alto; se a rede não aguentar, o controle de banda desce normalmente.
const START_KBPS = 2500;

// O que o Opus de cada faixa usa. FEC: perda isolada some sem ninguém notar.
// Mic: DTX (silêncio vira quase nada) e mono, a não ser na qualidade "Música".
// Áudio da tela: estéreo e sem DTX, que corta o fim das notas e dos efeitos.
function opusParams(kind: MediaKind | undefined, audio: { dtx: boolean; stereo: boolean }): Record<string, number> {
  if (kind === 'screenAudio') return { useinbandfec: 1, usedtx: 0, stereo: 1, 'sprop-stereo': 1, maxaveragebitrate: 128_000 };
  const stereo = kind === 'mic' ? Number(audio.stereo) : 1;
  return { useinbandfec: 1, usedtx: Number(audio.dtx), stereo, 'sprop-stereo': stereo };
}

// Ajusta a descrição recebida, que é o que define como EU envio, seção por seção (cada faixa é uma):
// início rápido do vídeo e o Opus certo pra voz ou pro áudio do jogo.
// kindOf: o que eu envio em cada seção (pelo mid).
export function tuneSdp(sdp: string, kindOf: (mid: string | undefined) => MediaKind | undefined, audio: { dtx: boolean; stereo: boolean }) {
  const [head, ...sections] = sdp.split('\r\nm=');
  const tuned = sections.map((section) => {
    const lines = section.split('\r\n');
    const mid = lines.find((l) => l.startsWith('a=mid:'))?.slice(6);
    const extra = new Map<string, Record<string, number | string>>();
    for (const line of lines) {
      const m = /^a=rtpmap:(\d+) ([\w-]+)\//.exec(line);
      if (!m) continue;
      if (/^(H264|VP8|VP9|AV1)$/i.test(m[2])) extra.set(m[1], { 'x-google-start-bitrate': START_KBPS });
      else if (/^opus$/i.test(m[2])) extra.set(m[1], opusParams(kindOf(mid), audio));
    }
    if (!extra.size) return section;
    const done = new Set<string>();
    const out = lines.map((line) => {
      const m = /^a=fmtp:(\d+) (.*)$/.exec(line);
      const add = m && extra.get(m[1]);
      if (!m || !add) return line;
      done.add(m[1]);
      const params = new Map(m[2].split(';').map((p) => p.split('=') as [string, string]));
      for (const [k, v] of Object.entries(add)) params.set(k, String(v));
      return `a=fmtp:${m[1]} ${[...params].map(([k, v]) => (v === undefined ? k : `${k}=${v}`)).join(';')}`;
    });
    // Codecs sem linha fmtp (o VP8, por exemplo) ganham uma logo depois do rtpmap.
    return out
      .flatMap((line) => {
        const m = /^a=rtpmap:(\d+) /.exec(line);
        const add = m && !done.has(m[1]) && extra.get(m[1]);
        return add ? [line, `a=fmtp:${m![1]} ${Object.entries(add).map(([k, v]) => `${k}=${v}`).join(';')}`] : [line];
      })
      .join('\r\n');
  });
  return [head, ...tuned].join('\r\nm=');
}

// ---------- resolução conforme a banda ----------

// Jogo com pouca banda pra imagem cheia: o encoder estoura a meta e joga quadros fora aos trancos
// (o Vcall mediu 14 a 50 fps chegando, com travadas a cada 2 s). Jogo a 60 fps pede perto de
// 0,06 bit por pixel; abaixo disso vale mais a imagem um pouco menor com todos os quadros.
const STEPS = [1, 1.25, 1.5, 2, 2.5, 3];
const BITS_PER_PIXEL = 0.06;
// Diminuir é na hora (pra não travar); voltar a crescer só com 30% de folga por 15 s seguidos,
// porque cada troca de resolução gera um quadro-chave (um soluço na imagem).
const GROW_MARGIN = 1.3;
export const GROW_AFTER_MS = 15_000;

export function scaleForBitrate(bps: number, pixels: number, fps: number, current: number) {
  if (!bps || !pixels || !fps) return current;
  const fits = (s: number, margin = 1) => bps >= (pixels / (s * s)) * fps * BITS_PER_PIXEL * margin;
  const needed = STEPS.find((s) => fits(s)) ?? STEPS[STEPS.length - 1];
  if (needed >= current) return needed;
  const grow = STEPS.find((s) => s >= needed && fits(s, GROW_MARGIN));
  return grow !== undefined && grow < current ? grow : current;
}
