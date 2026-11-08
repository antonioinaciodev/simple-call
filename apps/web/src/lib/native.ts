// O que muda quando o site roda dentro dos apps (desktop com Electron, celular com Capacitor).
// No navegador nada disso existe e o site segue como sempre.

export interface DesktopSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
}

// Áudio da transmissão no app desktop.
// none: sem áudio · app: só o programa da janela escolhida · system: PC inteiro menos a call.
export type DesktopAudioChoice = { mode: 'none' } | { mode: 'app' } | { mode: 'system' };

export interface DesktopAudioSupport {
  app: boolean;
  system: boolean;
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
  startAudio?: () => Promise<{ ok: boolean; error?: string }>;
  stopAudio?: () => Promise<void>;
  onAudio?: (onData: (chunk: Uint8Array) => void, onEnd: () => void) => () => void;
  // Da versão 0.6 do app em diante: atualizar de dentro do app (apps/desktop/src/update.ts).
  appVersion?: () => Promise<string | null>;
  installUpdate?: (version: string) => Promise<{ ok: boolean; error?: string }>;
  onUpdateProgress?: (fn: (pct: number) => void) => () => void;
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
export const mobilePlatform = capPlatform === 'android' ? capPlatform : null;

// ---------- barras do sistema (celular) ----------

// Plugin SystemBars, que já vem no Capacitor 8 (funciona nos apps já instalados).
type CapacitorCore = typeof import('@capacitor/core');
let bars: Promise<{ plugin: CapacitorCore['SystemBars']; type: CapacitorCore['SystemBarType'] } | null> | null = null;
let barsFullscreen = false;

// No app do celular a barra de cima (hora, bateria) fica escondida o tempo todo; na tela cheia
// da transmissão some também a de baixo (navegação).
// Puxando da borda elas aparecem por um instante.
function applyBars() {
  if (!mobilePlatform) return;
  bars ??= import('@capacitor/core')
    .then(({ SystemBars, SystemBarType }) => ({ plugin: SystemBars, type: SystemBarType }))
    .catch(() => null);
  const full = barsFullscreen;
  void bars.then(async (ref) => {
    if (!ref) return;
    try {
      if (full) await ref.plugin.hide();
      else await Promise.all([ref.plugin.hide({ bar: ref.type.StatusBar }), ref.plugin.show({ bar: ref.type.NavigationBar })]);
    } catch {
      // App antigo sem o plugin: fica como está.
    }
  });
}

export function setFullscreenBars(full: boolean) {
  barsFullscreen = full;
  applyBars();
}

if (mobilePlatform) {
  applyBars();
  // Voltando de outro app, o sistema pode ter mostrado as barras de novo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) applyBars();
  });
}

// ---------- site no navegador ----------

// Aberto dentro de um dos apps (desktop ou celular)?
export const inApp = !!desktop || !!mobilePlatform;

// Sistemas que têm app. Nos outros (Linux, iPhone, Mac) o Simple Call funciona no navegador.
export type Os = 'windows' | 'android';

// Sistema de quem está vendo a página, pra oferecer o app certo.
export function detectOs(): Os | null {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/.test(ua)) return 'windows';
  return null;
}

// Início do app: no navegador a raiz é a página de apresentação e o app fica em /app; dentro dos
// apps instalados (que abrem a raiz do site) a raiz já é o app.
export const APP_HOME = inApp ? '/' : '/app';

// Endereço que abre a call no app instalado (o app registra o simplecall:// no sistema).
// Do navegador, é o único jeito de abrir o app de PC; no Android o link https já abre sozinho.
export const appLink = (code: string) => `simplecall://${code}`;

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
