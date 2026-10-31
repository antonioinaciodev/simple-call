// Áudio do jogo sem as vozes da call.
// - Windows: o programa nativo simplecall-audio.exe (native/win-audio.cpp) captura só o processo
//   da janela escolhida, ou o PC inteiro menos o Simple Call.
// - Linux: o parec grava só o fluxo de áudio do app escolhido (PulseAudio ou PipeWire).
// Nos dois casos sai PCM float32, 2 canais, 48 kHz, que vai pro site em pedaços pelo IPC.
import { app, type WebContents } from 'electron';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type AudioChoice =
  | { mode: 'none' }
  // Windows: só o processo dono da janela escolhida.
  | { mode: 'app'; sourceId: string }
  // Windows: tudo que toca no PC, menos o Simple Call.
  | { mode: 'system' }
  // Linux: um fluxo de áudio (sink-input) da lista de apps tocando.
  | { mode: 'stream'; streamId: string };

export interface AudioApp {
  id: string;
  name: string;
}

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
    return { app: ok, system: ok, streams: false };
  }
  if (process.platform === 'linux') {
    const ok = await run('pactl', ['--version']).then(() => true, () => false);
    return { app: false, system: false, streams: ok };
  }
  return { app: false, system: false, streams: false };
}

// Processos do próprio Simple Call (pra não oferecer a própria call na lista).
const ownPids = () => new Set(app.getAppMetrics().map((m) => m.pid).concat(process.pid));

interface SinkInput {
  index: number;
  corked?: boolean;
  properties?: Record<string, string>;
}

// Linux: apps tocando som agora (sink-inputs do PulseAudio/PipeWire).
export async function audioApps(): Promise<AudioApp[]> {
  if (process.platform !== 'linux') return [];
  let list: SinkInput[];
  try {
    list = JSON.parse(await run('pactl', ['-f', 'json', 'list', 'sink-inputs']));
  } catch {
    return [];
  }
  const own = ownPids();
  const seen = new Map<string, AudioApp>();
  for (const s of list) {
    const p = s.properties ?? {};
    const pid = Number(p['application.process.id']);
    if (own.has(pid) || p['media.role'] === 'event') continue;
    const name = p['application.name'] || p['application.process.binary'] || `App ${s.index}`;
    const label = p['media.name'] && p['media.name'] !== name && seen.has(name) ? `${name} · ${p['media.name']}` : name;
    if (!seen.has(label)) seen.set(label, { id: String(s.index), name: label });
  }
  return [...seen.values()];
}

// Começa a mandar o áudio pro site. Resolve quando a captura confirmou que está rodando.
export async function startAudio(choice: AudioChoice, wc: WebContents): Promise<{ ok: boolean; error?: string }> {
  stopAudio();
  let cmd: string;
  let args: string[];
  if (process.platform === 'win32' && (choice.mode === 'app' || choice.mode === 'system')) {
    const helper = winHelper();
    if (!helper) return { ok: false, error: 'missing' };
    cmd = helper;
    if (choice.mode === 'system') {
      args = ['capture', 'exclude', String(process.pid)];
    } else {
      // Ids de janela do Electron no Windows são "window:<HWND>:0".
      const hwnd = choice.sourceId.split(':')[1];
      const pid = hwnd ? (await run(helper, ['pid', hwnd]).catch(() => '')).trim() : '';
      if (!/^\d+$/.test(pid)) return { ok: false, error: 'no-process' };
      args = ['capture', 'include', pid];
    }
  } else if (process.platform === 'linux' && choice.mode === 'stream' && /^\d+$/.test(choice.streamId)) {
    cmd = 'parec';
    args = [
      `--monitor-stream=${choice.streamId}`,
      '--format=float32le',
      '--rate=48000',
      '--channels=2',
      '--latency-msec=10',
      '--raw',
      '--client-name=Simple Call',
      '--stream-name=Transmissão',
    ];
  } else {
    return { ok: false, error: 'unsupported' };
  }

  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  proc = child;
  child.stdout!.on('data', (chunk: Buffer) => {
    if (proc === child && !wc.isDestroyed()) wc.send('audio:pcm', chunk);
  });
  child.on('exit', () => {
    if (proc !== child) return;
    proc = null;
    if (!wc.isDestroyed()) wc.send('audio:ended');
  });

  // O Windows avisa "ok" no stderr quando a captura abriu; o parec só morre se der errado.
  return new Promise((resolve) => {
    let stderr = '';
    const done = (r: { ok: boolean; error?: string }) => {
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: proc === child }), process.platform === 'win32' ? 3000 : 600);
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
