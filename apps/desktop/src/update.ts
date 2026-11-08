// Atualização do app de dentro dele: o site mostra "Atualização disponível" e, no clique, o app
// baixa o instalador novo da Release do GitHub, confere o hash e instala sozinho (sem perguntar
// nada) e abre de novo. O site só diz qual versão; endereço e hash vêm direto do GitHub.
import { app, net, type WebContents } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RELEASES = 'https://api.github.com/repos/antonioinaciodev/simple-call/releases/tags/v';
const ASSET = 'SimpleCall-Windows.exe';
const VERSION = /^\d+\.\d+\.\d+$/;

let busy = false;

interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
  digest?: string | null;
}

export async function installUpdate(version: unknown, wc: WebContents): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32' || !app.isPackaged) return { ok: false, error: 'unsupported' };
  if (typeof version !== 'string' || !VERSION.test(version)) return { ok: false, error: 'version' };
  if (busy) return { ok: false, error: 'busy' };
  busy = true;
  try {
    const res = await net.fetch(RELEASES + version, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`release ${res.status}`);
    const asset = ((await res.json()) as { assets?: Asset[] }).assets?.find((a) => a.name === ASSET);
    if (!asset) throw new Error('sem instalador nessa versão');

    const file = path.join(app.getPath('temp'), `SimpleCall-${version}.exe`);
    const sha256 = await download(asset, file, (pct) => !wc.isDestroyed() && wc.send('update:progress', pct));
    // O GitHub publica o hash de cada arquivo da Release: confere antes de rodar.
    if (asset.digest && asset.digest !== `sha256:${sha256}`) {
      fs.rmSync(file, { force: true });
      throw new Error('o arquivo baixado não confere');
    }

    // /S: instala sem mostrar nada · --force-run: abre o app no fim · --updated: é atualização.
    spawn(file, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    setTimeout(() => app.quit(), 300);
    return { ok: true };
  } catch (e) {
    busy = false;
    return { ok: false, error: e instanceof Error ? e.message : 'failed' };
  }
}

async function download(asset: Asset, file: string, onProgress: (pct: number) => void): Promise<string> {
  const res = await net.fetch(asset.browser_download_url);
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const hash = createHash('sha256');
  const out = fs.createWriteStream(file);
  const reader = res.body.getReader();
  let got = 0;
  let last = -1;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      got += value.length;
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== last) onProgress((last = pct));
    }
  } finally {
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  }
  return hash.digest('hex');
}
