// Roda o LiveKit em modo dev sem instalar nada no sistema: na primeira vez baixa o binário
// oficial pra tools/livekit/.bin, confere o SHA-256 e reaproveita nas próximas.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = '1.13.11';
const RELEASE = `https://github.com/livekit/livekit/releases/download/v${VERSION}`;
// Copiados de checksums.txt da release.
const CHECKSUMS = {
  'windows-amd64': '5d071ea43339f0140d24a66f0b2ff8a7bf6c4d0dceb19b30abca835670213667',
  'windows-arm64': '47ebfaa1ef6de546bf17a6699d4d9be59693bd5c3ffbec14d0749bd396ea3875',
  'linux-amd64': '1e9ee90ca301e1842b2887fc77cb122759756a9c8aeb4334ee91de3325ec43fb',
  'linux-arm64': '2af6ce091d6b3c79d1677f8ff1bbb91a8007f40b2325c059b52d38383c0830b6',
};

const os = { win32: 'windows', linux: 'linux' }[process.platform];
const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
const exeName = process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server';
const binDir = join(import.meta.dirname, '.bin', VERSION);
const exe = join(binDir, exeName);
const args = ['--dev', ...process.argv.slice(2)];

function fail(msg) {
  console.error(`[livekit] ${msg}`);
  process.exit(1);
}

async function download() {
  const key = `${os}-${arch}`;
  if (!os || !CHECKSUMS[key]) {
    // A release não traz binário pra macOS; lá o caminho é o Homebrew.
    if (process.platform === 'darwin') fail('No macOS instale com "brew install livekit" e rode "livekit-server --dev".');
    fail(`Sem binário do LiveKit pra ${process.platform}/${process.arch}.`);
  }
  const file = `livekit_${VERSION}_${os}_${arch}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
  console.log(`[livekit] Baixando ${file} (só na primeira vez)...`);
  const res = await fetch(`${RELEASE}/${file}`);
  if (!res.ok) fail(`Download falhou: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha !== CHECKSUMS[key]) fail(`Checksum não confere (${sha}). Download corrompido?`);

  mkdirSync(binDir, { recursive: true });
  const archive = join(binDir, file);
  writeFileSync(archive, data);
  // O tar do Windows 10+ também abre .zip.
  const tar = spawnSync('tar', ['-xf', archive, '-C', binDir], { stdio: 'inherit' });
  rmSync(archive);
  if (tar.status !== 0 || !readdirSync(binDir).includes(exeName)) {
    rmSync(binDir, { recursive: true, force: true });
    fail('Não consegui extrair o livekit-server.');
  }
}

if (!existsSync(exe)) await download();

console.log(`[livekit] Rodando LiveKit ${VERSION} em modo dev (chaves devkey/secret) em ws://localhost:7880`);
const child = spawn(exe, args, { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
