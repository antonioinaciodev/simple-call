// Malha P2P: cada pessoa da sala tem uma conexão WebRTC direta com cada uma das outras.
// O servidor só repassa as mensagens de conexão; a mídia nunca passa por ele (salvo pelo TURN).

export interface ScreenPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  maxBitrate: number;
}

export const P2P_SCREEN_PRESETS: ScreenPreset[] = [
  { id: '1080p60', label: '1080p · 60 fps', width: 1920, height: 1080, fps: 60, maxBitrate: 8_000_000 },
  { id: '720p60', label: '720p · 60 fps', width: 1280, height: 720, fps: 60, maxBitrate: 4_500_000 },
  { id: '1080p30', label: '1080p · 30 fps', width: 1920, height: 1080, fps: 30, maxBitrate: 5_000_000 },
  { id: '720p30', label: '720p · 30 fps', width: 1280, height: 720, fps: 30, maxBitrate: 2_500_000 },
];

export type VideoCodecPref = 'h264' | 'vp9' | 'av1' | 'vp8';

export interface Peer {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  // "Perfect negotiation": quando os dois lados oferecem ao mesmo tempo, o educado cede.
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  screenVideo?: RTCRtpTransceiver;
  screenAudio?: RTCRtpTransceiver;
}

type ServerMsg =
  | { type: 'welcome'; id: string; peers: { id: string; name: string }[] }
  | { type: 'join'; id: string; name: string }
  | { type: 'leave'; id: string }
  | { type: 'full' }
  | { type: 'signal'; from: string; data: SignalData };

type SignalData = { description: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit };

interface Options {
  room: string;
  name: string;
  iceServers: RTCIceServer[];
  mic: MediaStream | null;
  codec: VideoCodecPref;
  onChange: () => void;
  onClose: (reason: string) => void;
}

export class Mesh {
  readonly peers = new Map<string, Peer>();
  screen: MediaStream | null = null;
  screenPreset: ScreenPreset | null = null;
  private ws: WebSocket;
  private closed = false;
  // As mensagens de conexão são tratadas uma de cada vez e na ordem em que chegaram:
  // um candidato processado antes da oferta dele seria descartado.
  private signals = Promise.resolve();

  constructor(private opts: Options) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = new URLSearchParams({ room: opts.room, name: opts.name });
    this.ws = new WebSocket(`${proto}://${location.host}/api/signal?${qs}`);
    this.ws.onmessage = (e) => this.onServer(JSON.parse(e.data) as ServerMsg);
    this.ws.onclose = () => {
      if (!this.closed) this.opts.onClose('A conexão com o servidor caiu.');
    };
  }

  leave() {
    this.closed = true;
    this.ws.close();
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
    this.screen?.getTracks().forEach((t) => t.stop());
    this.opts.mic?.getTracks().forEach((t) => t.stop());
  }

  setMicEnabled(on: boolean) {
    this.opts.mic?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  async startScreen(preset: ScreenPreset, withAudio: boolean) {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: preset.width, height: preset.height, frameRate: preset.fps },
      // Áudio do jogo sem cancelamento de eco nem supressão de ruído, que estragam música e efeitos.
      audio: withAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      // @ts-expect-error opções do Chrome ainda fora dos tipos do TS
      systemAudio: withAudio ? 'include' : 'exclude',
      selfBrowserSurface: 'exclude',
    });
    const video = stream.getVideoTracks()[0];
    // "motion" diz ao encoder que é jogo: na falta de banda ele segura o FPS e baixa a nitidez.
    video.contentHint = 'motion';
    video.addEventListener('ended', () => this.stopScreen());
    this.stopScreen();
    this.screen = stream;
    this.screenPreset = preset;
    for (const p of this.peers.values()) this.sendScreen(p);
    this.opts.onChange();
  }

  stopScreen() {
    if (!this.screen) return;
    this.screen.getTracks().forEach((t) => t.stop());
    this.screen = null;
    this.screenPreset = null;
    for (const p of this.peers.values()) {
      for (const tx of [p.screenVideo, p.screenAudio]) {
        if (!tx || tx.currentDirection === 'stopped') continue;
        void tx.sender.replaceTrack(null);
        tx.direction = 'inactive';
      }
    }
    this.opts.onChange();
  }

  private send(to: string, data: SignalData) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'signal', to, data }));
  }

  private onServer(msg: ServerMsg) {
    switch (msg.type) {
      case 'welcome':
        // Quem chega é o "educado" com quem já estava: as conexões ficam simétricas e sem impasse.
        for (const p of msg.peers) this.addPeer(p.id, p.name, true);
        break;
      case 'join':
        this.addPeer(msg.id, msg.name, false);
        break;
      case 'leave':
        this.peers.get(msg.id)?.pc.close();
        this.peers.delete(msg.id);
        this.opts.onChange();
        break;
      case 'full':
        this.closed = true;
        this.opts.onClose('A call está cheia.');
        break;
      case 'signal':
        this.signals = this.signals.then(() => this.onSignal(msg.from, msg.data));
        break;
    }
  }

  private addPeer(id: string, name: string, polite: boolean) {
    const pc = new RTCPeerConnection({ iceServers: this.opts.iceServers, bundlePolicy: 'max-bundle' });
    const peer: Peer = { id, name, pc, polite, makingOffer: false, ignoreOffer: false };
    this.peers.set(id, peer);

    const mic = this.opts.mic;
    mic?.getAudioTracks().forEach((t) => pc.addTrack(t, mic));
    if (this.screen) this.sendScreen(peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) this.send(id, { description: pc.localDescription.toJSON() });
      } catch (err) {
        console.error('negociação', err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(id, { candidate: candidate.toJSON() });
    };
    pc.ontrack = ({ track }) => {
      track.onunmute = track.onmute = () => this.opts.onChange();
      this.opts.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      this.opts.onChange();
    };
    this.opts.onChange();
  }

  private async onSignal(from: string, data: SignalData) {
    const peer = this.peers.get(from);
    if (!peer) return;
    const { pc } = peer;
    try {
      if ('description' in data) {
        const { description } = data;
        const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription({ type: description.type, sdp: withStartBitrate(description.sdp ?? '') });
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          if (pc.localDescription) this.send(from, { description: pc.localDescription.toJSON() });
        }
        // Os parâmetros do encoder só valem depois que a negociação define as camadas.
        await this.tuneScreenSender(peer);
        this.opts.onChange();
      } else {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.error('sinalização', err);
    }
  }

  // Manda a tela pra uma pessoa, reaproveitando o mesmo transceiver a cada nova transmissão.
  private sendScreen(peer: Peer) {
    const stream = this.screen;
    const preset = this.screenPreset;
    if (!stream || !preset) return;
    const video = stream.getVideoTracks()[0];
    const audio = stream.getAudioTracks()[0];

    if (peer.screenVideo && peer.screenVideo.currentDirection !== 'stopped') {
      void peer.screenVideo.sender.replaceTrack(video);
      peer.screenVideo.sender.setStreams(stream);
      peer.screenVideo.direction = 'sendonly';
    } else {
      peer.screenVideo = peer.pc.addTransceiver(video, {
        direction: 'sendonly',
        streams: [stream],
        sendEncodings: [{ maxBitrate: preset.maxBitrate, maxFramerate: preset.fps }],
      });
      preferCodec(peer.screenVideo, this.opts.codec);
    }

    if (audio) {
      if (peer.screenAudio && peer.screenAudio.currentDirection !== 'stopped') {
        void peer.screenAudio.sender.replaceTrack(audio);
        peer.screenAudio.sender.setStreams(stream);
        peer.screenAudio.direction = 'sendonly';
      } else {
        peer.screenAudio = peer.pc.addTransceiver(audio, { direction: 'sendonly', streams: [stream] });
      }
    }
    void this.tuneScreenSender(peer);
  }

  private async tuneScreenSender(peer: Peer) {
    const sender = peer.screenVideo?.sender;
    const preset = this.screenPreset;
    if (!sender?.track || !preset) return;
    const params = sender.getParameters();
    if (!params.encodings?.length) return;
    params.encodings[0].maxBitrate = preset.maxBitrate;
    params.encodings[0].maxFramerate = preset.fps;
    // Sem banda suficiente, cai a resolução e não o FPS: jogo travado incomoda mais que jogo menos nítido.
    (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-framerate';
    await sender.setParameters(params).catch((err) => console.warn('setParameters', err));
  }
}

// O Chrome começa todo vídeo a ~300 kbps e sobe devagar: a transmissão levaria uns 20 segundos
// borrada até chegar no bitrate certo. Esse parâmetro (não oficial, mas suportado há anos) faz
// ele começar mais alto; se a rede não aguentar, o controle de banda desce normalmente.
const START_KBPS = 2500;

function withStartBitrate(sdp: string) {
  const lines = sdp.split('\r\n');
  const videoPts = new Set<string>();
  for (const line of lines) {
    const m = /^a=rtpmap:(\d+) (H264|VP8|VP9|AV1)\//i.exec(line);
    if (m) videoPts.add(m[1]);
  }
  const hasFmtp = new Set<string>();
  const out = lines.map((line) => {
    const m = /^a=fmtp:(\d+) /.exec(line);
    if (!m || !videoPts.has(m[1])) return line;
    hasFmtp.add(m[1]);
    return line.includes('x-google-start-bitrate') ? line : `${line};x-google-start-bitrate=${START_KBPS}`;
  });
  // Codecs sem linha fmtp (o VP8, por exemplo) ganham uma logo depois do rtpmap.
  return out
    .flatMap((line) => {
      const m = /^a=rtpmap:(\d+) /.exec(line);
      return m && videoPts.has(m[1]) && !hasFmtp.has(m[1]) ? [line, `a=fmtp:${m[1]} x-google-start-bitrate=${START_KBPS}`] : [line];
    })
    .join('\r\n');
}

// O que a pessoa está mandando agora, lido direto dos transceivers: é a fonte mais confiável,
// já que os MediaStreams remotos não acompanham bem uma transmissão que para e volta.
export function remoteMedia(peer: Peer) {
  const active = peer.pc
    .getTransceivers()
    .filter((tx) => tx.currentDirection === 'recvonly' || tx.currentDirection === 'sendrecv')
    .map((tx) => tx.receiver.track);
  return {
    // No protótipo não tem câmera: todo vídeo recebido é tela.
    screens: active.filter((t) => t.kind === 'video' && !t.muted),
    audios: active.filter((t) => t.kind === 'audio'),
  };
}

// Coloca o codec escolhido na frente da lista. H.264 costuma ter encoder de hardware (placa de vídeo),
// o que pesa menos no PC de quem transmite enquanto joga.
function preferCodec(tx: RTCRtpTransceiver, codec: VideoCodecPref) {
  const caps = RTCRtpReceiver.getCapabilities('video')?.codecs;
  if (!caps || !('setCodecPreferences' in tx)) return;
  const mime = `video/${codec}`.toLowerCase();
  const first = caps.filter((c) => c.mimeType.toLowerCase() === mime);
  if (!first.length) return;
  tx.setCodecPreferences([...first, ...caps.filter((c) => c.mimeType.toLowerCase() !== mime)]);
}
