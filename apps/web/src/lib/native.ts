// O que muda quando o site roda dentro dos apps (desktop com Electron, celular com Capacitor).
// No navegador nada disso existe e o site segue como sempre.

export interface DesktopSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
}

// Áudio da transmissão no app desktop.
// none: sem áudio · app: só o programa da janela escolhida (Windows) · system: PC inteiro menos a call
// (Windows) · stream: um app da lista de apps tocando (Linux).
export type DesktopAudioChoice = { mode: 'none' } | { mode: 'app' } | { mode: 'system' } | { mode: 'stream'; streamId: string };

export interface DesktopAudioSupport {
  app: boolean;
  system: boolean;
  streams: boolean;
}

interface DesktopBridge {
  platform: string;
  listSources: () => Promise<DesktopSource[]>;
  // Da versão 0.3 do app em diante: miniatura de cada fonte (id → imagem).
  listThumbnails?: () => Promise<Record<string, string>>;
  // audio: true = áudio do PC inteiro junto com o vídeo (versão 0.1 do app).
  selectSource: (id: string, name: string, audio: boolean | DesktopAudioChoice) => Promise<boolean>;
  // Da versão 0.2 do app em diante (instalações antigas não têm).
  audioSupport?: () => Promise<DesktopAudioSupport | null>;
  audioApps?: () => Promise<{ id: string; name: string }[]>;
  startAudio?: () => Promise<{ ok: boolean; error?: string }>;
  stopAudio?: () => Promise<void>;
  onAudio?: (onData: (chunk: Uint8Array) => void, onEnd: () => void) => () => void;
}

// Exposto pelo preload do app desktop (apps/desktop/src/preload.ts).
export const desktop = (globalThis as { simplecallDesktop?: DesktopBridge }).simplecallDesktop ?? null;

// ---------- celular ----------

export type AudioOutputId = 'speaker' | 'earpiece' | 'headset';

export interface AudioOutput {
  id: AudioOutputId;
  label: string;
}

interface CallAudioPlugin {
  getOutputs(): Promise<{ outputs: AudioOutput[]; current: AudioOutputId | null }>;
  setOutput(opts: { id: AudioOutputId }): Promise<void>;
  startCall(): Promise<void>;
  endCall(): Promise<void>;
  addListener(event: 'outputsChanged', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

// O Capacitor injeta window.Capacitor na página quando ela abre dentro do app.
const capPlatform = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
export const mobilePlatform = capPlatform === 'android' || capPlatform === 'ios' ? capPlatform : null;

// O plugin do Capacitor é um Proxy que responde a qualquer método, inclusive "then":
// por isso ele fica guardado dentro de um objeto, nunca resolvido direto numa Promise.
let loaded: Promise<{ plugin: CallAudioPlugin } | null> | null = null;

// Plugin nativo do app (apps/mobile): saída de áudio e manter a call viva em segundo plano.
// O @capacitor/core só é baixado dentro do app.
export async function withCallAudio<T>(fn: (plugin: CallAudioPlugin) => Promise<T>): Promise<T | undefined> {
  if (!mobilePlatform) return undefined;
  loaded ??= import('@capacitor/core')
    .then(({ registerPlugin }) => ({ plugin: registerPlugin<CallAudioPlugin>('CallAudio') }))
    .catch(() => null);
  const ref = await loaded;
  return ref ? fn(ref.plugin) : undefined;
}
