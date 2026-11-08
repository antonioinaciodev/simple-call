// Áudio do jogo sem as vozes da call (Windows).
// O programa nativo simplecall-audio.exe (native/win-audio.cpp) captura só o processo da janela
// escolhida, ou o PC inteiro menos o Simple Call. Sai PCM float32, 2 canais, 48 kHz, que vai pro
// site em pedaços pelo IPC.
import { app, type WebContents } from 'electron';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type AudioChoice =
  | { mode: 'none' }
  // Windows: só o processo dono da janela escolhida.
  | { mode: 'app'; sourceId: string }
  // Windows: tudo que toca no PC, menos o Simple Call.
  | { mode: 'system' };

let proc: ChildProcess | null = null;

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { timeout: 4000, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );

function winHelper(): string | null {
  const file = app.isPackaged
    ? path.join(process.resourcesPath, 'simplecall-audio.exe')
    : path.join(__dirname, '..', 'native', 'bin', 'simplecall-audio.exe');
  return fs.existsSync(file) ? file : null;
}

// O que dá pra capturar neste PC.
export async function audioSupport() {
  if (process.platform === 'win32') {
    const ok = !!winHelper();
    return { app: ok, system: ok };
  }
  return { app: false, system: false };
}

// Começa a mandar o áudio pro site. Resolve quando a captura confirmou que está rodando.
export async function startAudio(choice: AudioChoice, wc: WebContents): Promise<{ ok: boolean; error?: string }> {
  stopAudio();
  let args: string[];
  const helper = process.platform === 'win32' ? winHelper() : null;
  if (choice.mode === 'app' || choice.mode === 'system') {
    if (!helper) return { ok: false, error: 'missing' };
    if (choice.mode === 'system') {
      args = ['capture', 'exclude', String(process.pid)];
    } else {
      // Ids de janela do Electron no Windows são "window:<HWND>:0".
      const hwnd = choice.sourceId.split(':')[1];
      const pid = hwnd ? (await run(helper, ['pid', hwnd]).catch(() => '')).trim() : '';
      if (!/^\d+$/.test(pid)) return { ok: false, error: 'no-process' };
      args = ['capture', 'include', pid];
    }
  } else {
    return { ok: false, error: 'unsupported' };
  }

  const child = spawn(helper, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  proc = child;
  child.stdout!.on('data', (chunk: Buffer) => {
    if (proc === child && !wc.isDestroyed()) wc.send('audio:pcm', chunk);
  });
  child.on('exit', () => {
    if (proc !== child) return;
    proc = null;
    if (!wc.isDestroyed()) wc.send('audio:ended');
  });

  // O programa avisa "ok" no stderr quando a captura abriu.
  return new Promise((resolve) => {
    let stderr = '';
    const done = (r: { ok: boolean; error?: string }) => {
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: proc === child }), 3000);
    child.stderr!.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (/^ok$/m.test(stderr)) done({ ok: true });
    });
    child.on('error', () => done({ ok: false, error: 'spawn' }));
    child.on('exit', () => done({ ok: false, error: stderr.trim().split('\n').pop() || 'exit' }));
  });
}

export function stopAudio() {
  const child = proc;
  proc = null;
  if (!child) return;
  // Fechar a entrada faz o programa do Windows sair sozinho; o kill garante.
  child.stdin?.end();
  setTimeout(() => child.kill(), 500);
}
