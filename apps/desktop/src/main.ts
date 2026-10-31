// Processo principal do app desktop. A interface é o próprio site do Simple Call
// (carregado da Cloudflare), então todo deploy do site já atualiza o app.
// Aqui fica só o que o navegador não faz: escolher tela ou janela sem o seletor
// do Chrome e mandar o áudio do PC junto com qualquer janela no Windows.
import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, type WebContents } from 'electron';
import path from 'node:path';

const PROD_URL = 'https://simplecall.antonioinaciodev.workers.dev';
// SIMPLECALL_URL só vale fora do instalador (pnpm start:local aponta pro Vite).
const APP_URL = new URL((!app.isPackaged && process.env.SIMPLECALL_URL) || PROD_URL);
const APP_ORIGIN = APP_URL.origin;

// O que o site pediu pra transmitir: escolhido no seletor do app logo antes do getDisplayMedia.
interface Pick {
  id: string;
  name: string;
  audio: boolean;
  at: number;
}
let pick: Pick | null = null;

// Desempenho: a call não pode engasgar quando a janela fica atrás do jogo ou minimizada.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const isAppUrl = (url: string) => {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
};

function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 480,
    show: false,
    title: 'Simple Call',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => (win = null));
  guard(win.webContents);
  void win.loadURL(APP_URL.href);
}

// Só o site do Simple Call roda dentro do app; qualquer outro link abre no navegador.
function guard(wc: WebContents) {
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (isAppUrl(url) || url.startsWith('file:')) return;
    e.preventDefault();
    openExternal(url);
  });
  // Sem internet ou com o site fora do ar: mostra uma tela com "tentar de novo".
  wc.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ABORTED */) return;
    void wc.loadFile(path.join(__dirname, '..', 'offline.html'), { query: { url: url || APP_URL.href } });
  });
  // Atalhos que o navegador teria: recarregar, tela cheia e ferramentas de desenvolvedor.
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (key === 'f5' || (ctrl && key === 'r')) {
      e.preventDefault();
      wc.reload();
    } else if (key === 'f11') {
      e.preventDefault();
      win?.setFullScreen(!win.isFullScreen());
    } else if (key === 'f12' || (ctrl && input.shift && key === 'i')) {
      e.preventDefault();
      wc.toggleDevTools();
    }
  });
}

const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'speaker-selection',
  'clipboard-sanitized-write',
  'fullscreen',
  'notifications',
  'screen-wake-lock',
]);

function setupSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(isAppUrl(wc.getURL()) && ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => origin === APP_ORIGIN && ALLOWED_PERMISSIONS.has(permission));

  // getDisplayMedia do site cai aqui. O site já mostrou o seletor do app e mandou a escolha antes.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.securityOrigin && new URL(request.securityOrigin).origin !== APP_ORIGIN) return callback(null);
    let chosen = pick && Date.now() - pick.at < 60_000 ? pick : null;
    pick = null;
    if (!chosen) {
      // Sem escolha (versão antiga do site): transmite a tela principal.
      const [screen] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!screen) return callback(null);
      chosen = { id: screen.id, name: screen.name, audio: request.audioRequested, at: Date.now() };
    }
    callback({
      video: { id: chosen.id, name: chosen.name },
      // "loopback" = áudio de tudo que toca no PC. Só existe no Windows.
      ...(chosen.audio && request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' as const } : {}),
    });
  });
}

function setupIpc() {
  // Lista rápida: sem miniaturas, só nomes. Abre na hora mesmo com muitas janelas.
  ipcMain.handle('sources:list', async (e) => {
    if (!isAppUrl(e.sender.getURL())) return [];
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    // A própria janela do Simple Call não entra na lista (transmitiria a call dentro da call).
    const own = win?.getMediaSourceId();
    const screens = sources.filter((s) => s.id.startsWith('screen:'));
    return sources
      .filter((s) => s.name && s.id !== own)
      .map((s) => {
        const screen = screens.indexOf(s);
        if (screen < 0) return { id: s.id, name: s.name, kind: 'window' };
        return { id: s.id, name: screens.length === 1 ? 'Tela inteira' : `Tela ${screen + 1}`, kind: 'screen' };
      });
  });
  ipcMain.handle('sources:select', (e, id: unknown, name: unknown, audio: unknown) => {
    if (!isAppUrl(e.sender.getURL()) || typeof id !== 'string' || typeof name !== 'string') return false;
    pick = { id, name, audio: audio === true, at: Date.now() };
    return true;
  });
}

// Um app só: abrir de novo traz a janela que já está aberta pra frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  void app.whenReady().then(() => {
    setupSession();
    setupIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
