import type { ScreenPreset } from './screen';

// Malha P2P: cada pessoa da call tem uma conexão WebRTC direta com cada uma das outras.
// O servidor só apresenta as pessoas e repassa as mensagens de conexão; áudio, vídeo e chat
// vão direto entre os navegadores (ou pelo TURN, quando a conexão direta não rola).

export type VideoCodec = 'h264' | 'vp9' | 'av1' | 'vp8';
export type MediaKind = 'mic' | 'camera' | 'screen' | 'screenAudio';

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  isLocal: boolean;
  text: string;
  timestamp: number;
}

export interface Peer {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  // "Perfect negotiation": quando os dois lados oferecem ao mesmo tempo, o educado cede.
  polite: boolean;
  ignoreOffer: boolean;
  // Ofertas e mensagens recebidas dessa pessoa rodam uma de cada vez, na ordem: duas operações
  // de negociação ao mesmo tempo na mesma conexão embaralham o estado dela.
  queue: Promise<void>;
  // O que eu mando pra essa pessoa, um transceiver por tipo, reaproveitado a cada liga/desliga.
  sending: Partial<Record<MediaKind, RTCRtpTransceiver>>;
  // O que ela me manda: o tipo de cada faixa (pelo mid), se o mic dela está ligado e se ela
  // desligou o som da call. stateKnown: já recebi o estado dela pelo menos uma vez.
  remoteKinds: Record<string, MediaKind>;
  micOn: boolean;
  deafened: boolean;
  stateKnown: boolean;
  // Já chegou a conectar alguma vez (pra saber se "conectando" é reconexão) e a próxima espera
  // pra tentar reconectar o ICE, que dobra a cada tentativa sem sucesso.
  wasConnected: boolean;
  restartDelay: number;
  restartTimer?: ReturnType<typeof setTimeout>;
  lastRestart: number;
}

// Mudanças nas outras pessoas que viram som na call.
export type PeerEvent = 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen';

export interface RemoteMedia {
  mic?: MediaStreamTrack;
  camera?: MediaStreamTrack;
  screen?: MediaStreamTrack;
  screenAudio?: MediaStreamTrack;
}

export interface AudioSettings {
  maxBitrate: number;
  dtx: boolean;
}

interface Options {
  room: string;
  name: string;
  iceServers: RTCIceServer[];
  codec: VideoCodec;
  audio: AudioSettings;
  onChange: () => void;
  onChat: (m: ChatMessage) => void;
  onPeerEvent: (e: PeerEvent) => void;
  onClose: (reason: string) => void;
}

type ServerMsg =
  | { type: 'welcome'; id: string; token: string; peers: { id: string; name: string }[] }
  | { type: 'join'; id: string; name: string }
  | { type: 'leave'; id: string }
  | { type: 'full' }
  | { type: 'signal'; from: string; data: SignalData };

// reset: a conexão comigo travou e recomecei do zero; feche a sua e espere minha nova oferta.
// restart: a conexão comigo caiu; quem cuida de reconectar (o lado não educado) tenta agora.
type SignalData = { description: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit } | { reset: true } | { restart: true };

type PeerMsg =
  | { type: 'state'; micOn: boolean; deafened?: boolean; kinds: Record<string, MediaKind> }
  | { type: 'chat'; id: string; text: string; timestamp: number };

const CAMERA_ENCODING: RTCRtpEncodingParameters = { maxBitrate: 1_200_000, maxFramerate: 30 };
const SCREEN_AUDIO_BITRATE = 128_000;
// Uma conexão normal fecha em menos de 1 s (uns 3 s pelo TURN).
const STUCK_MS = 10_000;
// Sinal ruim por esse tempo e a conexão tenta outro caminho (reinício do ICE), sem esperar o
// navegador declarar que falhou, o que leva de 15 a 30 s. A espera dobra até o máximo.
const RESTART_MS = 3_000;
const RESTART_MAX_MS = 30_000;
// Ping no servidor de tempos em tempos; sem resposta nenhuma por DEAD_MS, a conexão morreu sem
// avisar (o celular trocou de rede) e abrimos outra. Reconectar espera de 1 a 8 s entre tentativas.
const PING_MS = 10_000;
const DEAD_MS = 25_000;
const RETRY_MS = 1_000;
const RETRY_MAX_MS = 8_000;

export class Mesh {
  readonly peers = new Map<string, Peer>();
  mic: MediaStreamTrack | null = null;
  camera: MediaStreamTrack | null = null;
  screen: MediaStream | null = null;
  screenPreset: ScreenPreset | null = null;
  // Som da call desligado (e o mic junto), como o "ensurdecer" do Discord.
  deafened = false;
  // Sem conexão com o servidor agora, tentando voltar. A call continua direto entre as pessoas,
  // mas sem servidor não dá pra reconectar com ninguém nem entrar gente nova.
  serverDown = false;
  private ws!: WebSocket;
  // Meu id na call e o segredo pra voltar com ele se a conexão com o servidor cair.
  private self: { id: string; token: string } | null = null;
  private closed = false;
  private joined = false;
  private lastSeen = 0;
  private retryDelay = RETRY_MS;
  private retry?: ReturnType<typeof setTimeout>;
  private ping: ReturnType<typeof setInterval>;

  constructor(private opts: Options) {
    this.connect();
    // Mantém a sinalização viva (conexões paradas são derrubadas por inatividade no caminho)
    // e percebe quando ela morreu sem fechar.
    this.ping = setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastSeen > DEAD_MS) this.reconnect();
      else this.ws.send('{"type":"ping"}');
    }, PING_MS);
    window.addEventListener('online', this.onOnline);
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = new URLSearchParams({ room: this.opts.room, name: this.opts.name });
    if (this.self) {
      qs.set('id', this.self.id);
      qs.set('token', this.self.token);
    }
    const ws = new WebSocket(`${proto}://${location.host}/api/signal?${qs}`);
    this.ws = ws;
    this.lastSeen = Date.now();
    ws.onmessage = (e) => {
      this.lastSeen = Date.now();
      this.onServer(JSON.parse(e.data) as ServerMsg);
    };
    ws.onclose = (e) => {
      if (ws !== this.ws || this.closed) return;
      // Sem ter entrado ainda, não tem call pra continuar.
      if (!this.joined) return this.opts.onClose(e.code === 1006 ? 'Não deu pra conectar ao servidor.' : 'A conexão com o servidor caiu.');
      this.serverDown = true;
      this.opts.onChange();
      this.retry = setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
    };
  }

  // Abandona a conexão atual (que pode estar morta sem saber) e abre outra na hora.
  private reconnect() {
    const ws = this.ws;
    ws.onclose = ws.onmessage = null;
    // Código de queda (não 1000): se ela ainda chegar no servidor, ele me espera voltar.
    ws.close(4000);
    clearTimeout(this.retry);
    this.serverDown = true;
    this.opts.onChange();
    this.connect();
  }

  // A internet voltou (ou trocou de rede): não espera a próxima tentativa nem o próximo ping.
  private onOnline = () => {
    if (this.closed || !this.joined) return;
    this.reconnect();
  };

  get name() {
    return this.opts.name;
  }

  leave() {
    this.closed = true;
    clearInterval(this.ping);
    clearTimeout(this.retry);
    window.removeEventListener('online', this.onOnline);
    // 1000: saí de propósito, o servidor avisa todo mundo na hora em vez de esperar eu voltar.
    this.ws.close(1000);
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
    for (const t of [this.mic, this.camera, ...(this.screen?.getTracks() ?? [])]) t?.stop();
  }

  // ---------- o que eu envio ----------

  // Trocar ou desligar o mic não precisa renegociar: o transceiver fica e só a faixa muda.
  setMic(track: MediaStreamTrack | null) {
    if (this.mic !== track) this.mic?.stop();
    this.mic = track;
    for (const p of this.peers.values()) this.attach(p, 'mic');
    this.broadcastState();
    this.opts.onChange();
  }

  // Liga ou desliga o som da call junto com o mic, num aviso só pras outras pessoas.
  setDeafened(deafened: boolean, mic: MediaStreamTrack | null) {
    this.deafened = deafened;
    if (this.mic !== mic) this.mic?.stop();
    this.mic = mic;
    for (const p of this.peers.values()) this.attach(p, 'mic');
    this.broadcastState();
    this.opts.onChange();
  }

  setCamera(track: MediaStreamTrack | null) {
    if (this.camera !== track) this.camera?.stop();
    this.camera = track;
    for (const p of this.peers.values()) this.attach(p, 'camera');
    this.opts.onChange();
  }

  async startScreen(preset: ScreenPreset, withAudio: boolean) {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: preset.width, height: preset.height, frameRate: preset.fps },
      // Áudio do jogo sem cancelamento de eco nem supressão de ruído, que estragam música e efeitos.
      audio: withAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      // @ts-expect-error opções do Chrome ainda fora dos tipos do TS
      systemAudio: withAudio ? 'include' : 'exclude',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
    const video = stream.getVideoTracks()[0];
    // "motion" avisa o encoder que é jogo; "detail" que é texto e precisa de nitidez.
    video.contentHint = preset.contentHint;
    video.addEventListener('ended', () => this.stopScreen());
    this.screen?.getTracks().forEach((t) => t.stop());
    this.screen = stream;
    this.screenPreset = preset;
    for (const p of this.peers.values()) {
      this.attach(p, 'screen');
      this.attach(p, 'screenAudio');
    }
    this.opts.onChange();
  }

  stopScreen() {
    if (!this.screen) return;
    this.screen.getTracks().forEach((t) => t.stop());
    this.screen = null;
    this.screenPreset = null;
    for (const p of this.peers.values()) {
      this.attach(p, 'screen');
      this.attach(p, 'screenAudio');
    }
    this.opts.onChange();
  }

  setCodec(codec: VideoCodec) {
    this.opts.codec = codec;
  }

  // Bitrate vale na hora; DTX só depois de renegociar, porque vai na descrição da conexão.
  setAudio(audio: AudioSettings) {
    const dtxChanged = audio.dtx !== this.opts.audio.dtx;
    this.opts.audio = audio;
    for (const p of this.peers.values()) {
      void this.tune(p, 'mic');
      if (dtxChanged) this.enqueue(p, () => this.offer(p));
    }
  }

  sendChat(text: string) {
    const msg = { type: 'chat' as const, id: crypto.randomUUID(), text, timestamp: Date.now() };
    for (const p of this.peers.values()) this.sendPeer(p, msg);
    this.opts.onChat({ id: msg.id, from: 'local', name: this.opts.name, isLocal: true, text, timestamp: msg.timestamp });
  }

  // ---------- o que eu recebo ----------

  remoteMedia(peer: Peer): RemoteMedia {
    const out: RemoteMedia = {};
    for (const tx of peer.pc.getTransceivers()) {
      if (tx.currentDirection !== 'recvonly' && tx.currentDirection !== 'sendrecv') continue;
      const track = tx.receiver.track;
      const kind = (tx.mid && peer.remoteKinds[tx.mid]) || (track.kind === 'audio' ? 'mic' : 'camera');
      // Vídeo "mudo" é faixa sem quadros ainda (acabou de ligar): não vale mostrar tela preta.
      if (track.kind === 'video' && track.muted) continue;
      out[kind] = track;
    }
    return out;
  }

  // Volume de 0 a 1 do último pacote de áudio do mic, sem custo extra: o navegador já calcula.
  remoteAudioLevel(peer: Peer) {
    const tx = peer.pc.getTransceivers().find((t) => t.mid && peer.remoteKinds[t.mid] === 'mic');
    return tx?.receiver.getSynchronizationSources()[0]?.audioLevel ?? 0;
  }

  // ---------- internos ----------

  private sendServer(to: string, data: SignalData) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'signal', to, data }));
  }

  private sendPeer(peer: Peer, msg: PeerMsg) {
    if (peer.dc?.readyState === 'open') peer.dc.send(JSON.stringify(msg));
  }

  private broadcastState() {
    for (const p of this.peers.values()) this.sendState(p);
  }

  private sendState(peer: Peer) {
    const kinds: Record<string, MediaKind> = {};
    for (const [kind, tx] of Object.entries(peer.sending)) if (tx.mid) kinds[tx.mid] = kind as MediaKind;
    this.sendPeer(peer, { type: 'state', micOn: !!this.mic, deafened: this.deafened, kinds });
  }

  private onServer(msg: ServerMsg) {
    switch (msg.type) {
      case 'welcome':
        this.onWelcome(msg);
        break;
      case 'join':
        this.addPeer(msg.id, msg.name, false);
        this.opts.onPeerEvent('join');
        break;
      case 'leave':
        {
          const peer = this.peers.get(msg.id);
          if (!peer) break;
          peer.pc.close();
          this.peers.delete(msg.id);
          this.opts.onPeerEvent('leave');
          this.opts.onChange();
        }
        break;
      case 'full':
        this.closed = true;
        this.opts.onClose('A call está cheia.');
        break;
      case 'signal':
        {
          const peer = this.peers.get(msg.from);
          // Recomeçar não entra na fila: o que chegar depois já é da conexão nova.
          if (peer && 'reset' in msg.data) this.recreate(peer, STUCK_MS);
          else if (peer && 'restart' in msg.data) this.restart(peer);
          else if (peer) this.enqueue(peer, () => this.onSignal(peer, msg.data));
        }
        break;
    }
  }

  private onWelcome(msg: Extract<ServerMsg, { type: 'welcome' }>) {
    const back = this.self?.id === msg.id;
    this.self = { id: msg.id, token: msg.token };
    this.serverDown = false;
    this.retryDelay = RETRY_MS;
    if (this.joined && back) return this.onBack(msg.peers);
    // Primeira entrada, ou voltei depois do tempo de espera e pra todo mundo eu já tinha saído:
    // começo do zero como quem acabou de chegar.
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
    this.joined = true;
    // Quem chega é o "educado" com quem já estava: as conexões ficam simétricas e sem impasse.
    for (const p of msg.peers) this.addPeer(p.id, p.name, true);
    this.opts.onChange();
  }

  // Voltei pro servidor a tempo e continuo na call com o mesmo id. O que aconteceu enquanto eu
  // estava fora se perdeu, então confiro a lista de quem está na call.
  private onBack(list: { id: string; name: string }[]) {
    const ids = new Set(list.map((p) => p.id));
    for (const peer of [...this.peers.values()]) {
      if (ids.has(peer.id)) continue;
      peer.pc.close();
      this.peers.delete(peer.id);
      this.opts.onPeerEvent('leave');
    }
    // Quem entrou nesse meio tempo me viu na lista e espera minha oferta, como com qualquer novato.
    for (const p of list) {
      if (this.peers.has(p.id)) continue;
      this.addPeer(p.id, p.name, false);
      this.opts.onPeerEvent('join');
    }
    // As conexões que caíram junto tentam voltar agora, que já dá pra trocar mensagens de novo.
    for (const peer of this.peers.values()) {
      if (peer.pc.connectionState !== 'connected' && peer.wasConnected) {
        if (peer.polite) this.sendServer(peer.id, { restart: true });
        else this.restart(peer);
      }
    }
    this.opts.onChange();
  }

  private addPeer(id: string, name: string, polite: boolean, retry = STUCK_MS) {
    const pc = new RTCPeerConnection({ iceServers: this.opts.iceServers, bundlePolicy: 'max-bundle' });
    const peer: Peer = { id, name, pc, dc: null, polite, ignoreOffer: false, queue: Promise.resolve(), sending: {}, remoteKinds: {}, micOn: true, deafened: false, stateKnown: false, wasConnected: false, restartDelay: RESTART_MS, lastRestart: 0 };
    this.peers.set(id, peer);

    // Canal de dados (estado e chat): só quem já estava na call cria; quem chega recebe pronto.
    // Se os dois criassem, a primeira negociação cruzada derrubaria o canal de um dos lados.
    const setupChannel = (dc: RTCDataChannel) => {
      peer.dc = dc;
      dc.onopen = () => this.sendState(peer);
      dc.onmessage = (e) => this.onPeerMsg(peer, JSON.parse(e.data) as PeerMsg);
    };
    if (polite) pc.ondatachannel = (e) => setupChannel(e.channel);
    else setupChannel(pc.createDataChannel('simplecall'));

    for (const kind of ['mic', 'camera', 'screen', 'screenAudio'] as const) this.attach(peer, kind);

    pc.onnegotiationneeded = () => this.enqueue(peer, () => this.offer(peer));
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.sendServer(id, { candidate: candidate.toJSON() });
    };
    pc.ontrack = ({ track }) => {
      track.onunmute = track.onmute = () => this.opts.onChange();
      this.opts.onChange();
    };
    pc.onsignalingstatechange = () => {
      // Os mids só existem depois da negociação; avisa a outra pessoa o que é cada faixa.
      if (pc.signalingState === 'stable') this.sendState(peer);
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        peer.wasConnected = true;
        peer.restartDelay = RESTART_MS;
        clearTimeout(peer.restartTimer);
      } else if ((state === 'disconnected' || state === 'failed') && !peer.restartTimer) {
        this.watchSignal(peer);
      }
      this.opts.onChange();
    };
    if (!polite) this.watch(peer, retry);
    this.opts.onChange();
  }

  // Rede de segurança: negociou e a conexão nem começou a testar caminhos (um dos lados ficou sem
  // candidatos ICE). Ela nunca vai dar "failed" e reiniciar o ICE não destrava, então quem já
  // estava recomeça do zero e avisa a outra pessoa. A espera dobra a cada nova tentativa.
  private watch(peer: Peer, delay: number) {
    setTimeout(() => {
      const { pc } = peer;
      if (pc.connectionState !== 'new') return;
      if (pc.signalingState !== 'stable') return this.watch(peer, delay);
      this.sendServer(peer.id, { reset: true });
      this.recreate(peer, delay * 2);
    }, delay);
  }

  // Sinal ruim: espera um pouco (muitas vezes volta sozinho) e, se não voltou, tenta reconectar.
  // Só o lado não educado reinicia, pra que as duas pontas não mandem ofertas cruzadas; o educado
  // pede pra ele, caso ele não tenha percebido. Continua tentando, com esperas cada vez maiores.
  private watchSignal(peer: Peer) {
    peer.restartTimer = setTimeout(() => {
      peer.restartTimer = undefined;
      const state = peer.pc.connectionState;
      if (this.peers.get(peer.id) !== peer || state === 'connected' || state === 'closed') return;
      if (peer.polite) this.sendServer(peer.id, { restart: true });
      else this.restart(peer);
      peer.restartDelay = Math.min(peer.restartDelay * 2, RESTART_MAX_MS);
      this.watchSignal(peer);
    }, peer.restartDelay);
  }

  // Reinício do ICE: procura caminhos de novo sem derrubar nada (faixas e canal de dados ficam).
  private restart(peer: Peer) {
    if (peer.polite || Date.now() - peer.lastRestart < RESTART_MS) return;
    peer.lastRestart = Date.now();
    this.enqueue(peer, async () => {
      const { pc } = peer;
      if (pc.connectionState === 'connected' || pc.connectionState === 'closed') return;
      // A oferta anterior (ou a resposta dela) se perdeu com o servidor fora: desfaz e manda outra.
      if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
      pc.restartIce();
    });
  }

  // A conexão com essa pessoa está caída ou tentando voltar.
  reconnecting(peer: Peer) {
    const state = peer.pc.connectionState;
    return state === 'disconnected' || state === 'failed' || (peer.wasConnected && (state === 'connecting' || state === 'new'));
  }

  private recreate(peer: Peer, retry: number) {
    peer.pc.close();
    this.addPeer(peer.id, peer.name, peer.polite, retry);
  }

  private onPeerMsg(peer: Peer, msg: PeerMsg) {
    if (msg.type === 'state') {
      const deafened = !!msg.deafened;
      // O primeiro estado só diz como a pessoa chegou: não é mudança, não toca som.
      // Ensurdecer desliga o mic junto, e aí toca só o som de ensurdecer.
      if (peer.stateKnown && deafened !== peer.deafened) this.opts.onPeerEvent(deafened ? 'deafen' : 'undeafen');
      else if (peer.stateKnown && msg.micOn !== peer.micOn) this.opts.onPeerEvent(msg.micOn ? 'unmute' : 'mute');
      peer.stateKnown = true;
      peer.micOn = msg.micOn;
      peer.deafened = deafened;
      peer.remoteKinds = msg.kinds;
      this.opts.onChange();
    } else if (msg.type === 'chat' && typeof msg.text === 'string') {
      this.opts.onChat({
        id: msg.id,
        from: peer.id,
        name: peer.name,
        isLocal: false,
        text: msg.text.slice(0, 1000),
        timestamp: msg.timestamp,
      });
    }
  }

  private enqueue(peer: Peer, task: () => Promise<void>) {
    peer.queue = peer.queue.then(task).catch((err) => console.error('negociação', err));
  }

  private async offer(peer: Peer) {
    const { pc } = peer;
    // Já tem oferta minha esperando resposta: quando ela chegar, o navegador pede outra se precisar.
    if (pc.signalingState !== 'stable' || pc.connectionState === 'closed') return;
    // Quem chega espera a primeira oferta de quem já estava, que sempre manda uma (por causa do
    // canal de dados). Se as duas cruzassem, o educado desfaria a dele no meio da coleta de ICE e
    // às vezes o Chrome não gera mais nenhum candidato: a conexão fica parada pra sempre. Depois
    // de responder, o navegador pede a negociação de novo pro que ficou faltando.
    if (peer.polite && !pc.remoteDescription) return;
    await pc.setLocalDescription();
    if (pc.localDescription) this.sendServer(peer.id, { description: pc.localDescription.toJSON() });
  }

  private async onSignal(peer: Peer, data: SignalData) {
    const { pc } = peer;
    if ('description' in data) {
      const { description } = data;
      // Como tudo passa pela fila, "não estável" aqui quer dizer que mandei uma oferta e ela
      // cruzou com a da outra pessoa no caminho.
      const collision = description.type === 'offer' && pc.signalingState !== 'stable';
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      // Resposta atrasada de uma oferta que eu já desfiz: não vale mais.
      if (description.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription({ type: description.type, sdp: tuneSdp(description.sdp ?? '', this.opts.audio.dtx) });
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        if (pc.localDescription) this.sendServer(peer.id, { description: pc.localDescription.toJSON() });
      }
      // Os parâmetros do encoder só valem depois que a negociação cria as camadas.
      for (const kind of ['mic', 'camera', 'screen', 'screenAudio'] as const) void this.tune(peer, kind);
      this.opts.onChange();
    } else if ('candidate' in data) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        if (!peer.ignoreOffer) throw err;
      }
    }
  }

  private localTrack(kind: MediaKind) {
    if (kind === 'mic') return this.mic;
    if (kind === 'camera') return this.camera;
    if (kind === 'screen') return this.screen?.getVideoTracks()[0] ?? null;
    return this.screen?.getAudioTracks()[0] ?? null;
  }

  // Liga, troca ou desliga o envio de um tipo de mídia pra uma pessoa.
  private attach(peer: Peer, kind: MediaKind) {
    const track = this.localTrack(kind);
    const tx = peer.sending[kind];
    const usable = tx && tx.currentDirection !== 'stopped';

    if (!track) {
      if (!usable || tx.direction === 'inactive') return;
      void tx.sender.replaceTrack(null);
      // O mic só fica mudo (sem renegociar); vídeo e áudio da tela param de vez, e quem assiste
      // fica sabendo pela renegociação que a faixa acabou.
      if (kind !== 'mic') tx.direction = 'inactive';
      return;
    }

    if (usable) {
      void tx.sender.replaceTrack(track);
      tx.direction = 'sendonly';
      if (kind === 'screen') preferCodec(tx, this.opts.codec);
    } else {
      const sendEncodings = kind === 'camera' ? [CAMERA_ENCODING] : kind === 'screen' && this.screenPreset ? [screenEncoding(this.screenPreset)] : undefined;
      const created = peer.pc.addTransceiver(track, { direction: 'sendonly', sendEncodings });
      if (kind === 'screen') preferCodec(created, this.opts.codec);
      peer.sending[kind] = created;
    }
    void this.tune(peer, kind);
  }

  private async tune(peer: Peer, kind: MediaKind) {
    const sender = peer.sending[kind]?.sender;
    if (!sender?.track) return;
    const params = sender.getParameters();
    const enc = params.encodings?.[0];
    if (!enc) return;
    if (kind === 'mic') enc.maxBitrate = this.opts.audio.maxBitrate;
    else if (kind === 'screenAudio') enc.maxBitrate = SCREEN_AUDIO_BITRATE;
    else if (kind === 'camera') Object.assign(enc, CAMERA_ENCODING);
    else if (this.screenPreset) {
      Object.assign(enc, screenEncoding(this.screenPreset));
      // Jogo: sem banda, cai a nitidez e não o FPS. Texto: o contrário.
      (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
        this.screenPreset.contentHint === 'motion' ? 'maintain-framerate' : 'maintain-resolution';
    }
    await sender.setParameters(params).catch((err) => console.warn('setParameters', err));
  }
}

const screenEncoding = (p: ScreenPreset): RTCRtpEncodingParameters => ({ maxBitrate: p.maxBitrate, maxFramerate: p.fps });

// Coloca o codec escolhido na frente da lista. H.264 costuma ter encoder de hardware (placa de vídeo),
// o que pesa menos no PC de quem transmite enquanto joga.
function preferCodec(tx: RTCRtpTransceiver, codec: VideoCodec) {
  const caps = RTCRtpReceiver.getCapabilities('video')?.codecs;
  if (!caps) return;
  const mime = `video/${codec}`;
  const first = caps.filter((c) => c.mimeType.toLowerCase() === mime);
  if (!first.length) return;
  try {
    tx.setCodecPreferences([...first, ...caps.filter((c) => c.mimeType.toLowerCase() !== mime)]);
  } catch {
    // Navegador sem suporte: fica com a ordem padrão.
  }
}

// O Chrome começa todo vídeo a ~300 kbps e sobe devagar: a transmissão ficaria uns 20 segundos
// borrada até chegar no bitrate certo. Esse parâmetro (não oficial, mas suportado há anos) faz
// ele começar mais alto; se a rede não aguentar, o controle de banda desce normalmente.
const START_KBPS = 2500;

// Ajusta a descrição recebida, que é o que define como EU envio: início rápido do vídeo,
// Opus em estéreo (pro áudio do jogo) e DTX (não enviar nada no silêncio) se ligado.
export function tuneSdp(sdp: string, dtx: boolean) {
  const lines = sdp.split('\r\n');
  const video = new Set<string>();
  const opus = new Set<string>();
  for (const line of lines) {
    const m = /^a=rtpmap:(\d+) ([\w-]+)\//.exec(line);
    if (!m) continue;
    if (/^(H264|VP8|VP9|AV1)$/i.test(m[2])) video.add(m[1]);
    if (/^opus$/i.test(m[2])) opus.add(m[1]);
  }
  const withFmtp = new Set<string>();
  const extra = (pt: string) => {
    if (video.has(pt)) return [`x-google-start-bitrate=${START_KBPS}`];
    if (opus.has(pt)) return ['stereo=1', 'sprop-stereo=1', `usedtx=${dtx ? 1 : 0}`];
    return [];
  };
  const out = lines.map((line) => {
    const m = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (!m || !(video.has(m[1]) || opus.has(m[1]))) return line;
    withFmtp.add(m[1]);
    const params = m[2].split(';').filter((p) => !/^(x-google-start-bitrate|stereo|sprop-stereo|usedtx)=/.test(p));
    return `a=fmtp:${m[1]} ${[...params, ...extra(m[1])].join(';')}`;
  });
  // Codecs sem linha fmtp (o VP8, por exemplo) ganham uma logo depois do rtpmap.
  return out
    .flatMap((line) => {
      const m = /^a=rtpmap:(\d+) /.exec(line);
      return m && (video.has(m[1]) || opus.has(m[1])) && !withFmtp.has(m[1]) ? [line, `a=fmtp:${m[1]} ${extra(m[1]).join(';')}`] : [line];
    })
    .join('\r\n');
}
