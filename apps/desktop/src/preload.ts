// Ponte entre o site e o app: o site só enxerga estas funções, nada do Node.
// Fica como script simples (require, sem import/export) porque o preload roda isolado (sandbox).
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

interface DesktopSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
}

contextBridge.exposeInMainWorld('simplecallDesktop', {
  platform: process.platform,
  // Telas e janelas abertas, só com o nome (rápido).
  listSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke('sources:list'),
  // Miniatura de cada tela e janela (id → imagem), mais lenta: vem depois da lista.
  listThumbnails: (): Promise<Record<string, string>> => ipcRenderer.invoke('sources:thumbnails'),
  // Guarda a escolha; o getDisplayMedia logo em seguida transmite ela.
  // audio: true (áudio do PC inteiro) ou { mode: 'none' | 'app' | 'system' | 'stream', streamId? }.
  selectSource: (id: string, name: string, audio: unknown): Promise<boolean> =>
    ipcRenderer.invoke('sources:select', id, name, audio),
  // Áudio só do jogo: o que dá pra capturar, apps tocando (Linux), começar e parar.
  audioSupport: () => ipcRenderer.invoke('audio:support'),
  audioApps: () => ipcRenderer.invoke('audio:apps'),
  startAudio: () => ipcRenderer.invoke('audio:start'),
  stopAudio: () => ipcRenderer.invoke('audio:stop'),
  // Pedaços de PCM float32 (2 canais, 48 kHz). Devolve a função que para de ouvir.
  onAudio: (onData: (chunk: Uint8Array) => void, onEnd: () => void) => {
    const data = (_e: unknown, chunk: Uint8Array) => onData(chunk);
    const end = () => onEnd();
    ipcRenderer.on('audio:pcm', data);
    ipcRenderer.on('audio:ended', end);
    return () => {
      ipcRenderer.removeListener('audio:pcm', data);
      ipcRenderer.removeListener('audio:ended', end);
    };
  },
});
