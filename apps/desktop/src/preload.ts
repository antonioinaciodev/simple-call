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
  // Guarda a escolha; o getDisplayMedia logo em seguida transmite ela.
  selectSource: (id: string, name: string, audio: boolean): Promise<boolean> =>
    ipcRenderer.invoke('sources:select', id, name, audio),
});
