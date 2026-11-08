// "Atualização disponível" dentro dos apps. A versão mais nova vem da Release mais recente do
// GitHub; a instalada vem do próprio app. Instalar fica com o app (desktop: update.ts do Electron;
// Android: AppUpdatePlugin), que baixa e confere o arquivo direto do GitHub. Apps antigos, sem
// isso, só abrem o download no navegador.
import { desktop, mobilePlatform } from './native';

const REPO = 'antonioinaciodev/simple-call';
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_KEY = 'simplecall:update';
// Confere de novo no máximo a cada 6 horas (a API do GitHub limita os pedidos sem login).
const CACHE_MS = 6 * 60 * 60 * 1000;
// Apps sem como dizer a versão são os anteriores à atualização dentro do app.
const OLD_APP = '0.5.1';

export interface Update {
  version: string;
  // O app instala sozinho; senão (app antigo) abre o download.
  canInstall: boolean;
  download: string;
}

type ProgressFn = (pct: number) => void;

interface AppUpdatePlugin {
  getInfo(): Promise<{ version: string }>;
  install(opts: { version: string }): Promise<{ status: 'installing' | 'permission' }>;
  addListener(event: 'progress', fn: (e: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

// Mesmo cuidado do withCallAudio: o plugin é um Proxy, fica guardado dentro de um objeto.
let plugin: Promise<{ p: AppUpdatePlugin } | null> | null = null;
function androidPlugin() {
  plugin ??= import('@capacitor/core')
    .then(({ registerPlugin }) => ({ p: registerPlugin<AppUpdatePlugin>('AppUpdate') }))
    .catch(() => null);
  return plugin;
}

const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);

function newer(a: string, b: string) {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// Versão instalada e se o app sabe se atualizar. null: não dá pra saber (app antigo).
async function installed(): Promise<{ version: string | null; canInstall: boolean }> {
  if (desktop) {
    const version = (await desktop.appVersion?.().catch(() => null)) ?? null;
    return { version, canInstall: !!desktop.installUpdate && !!version };
  }
  const ref = await androidPlugin();
  const version = ref ? await ref.p.getInfo().then((i) => i.version, () => null) : null;
  return { version, canInstall: !!version };
}

async function latestVersion(): Promise<string | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { v: string; at: number } | null;
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.v;
  } catch {
    // sem cache
  }
  const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } }).catch(() => null);
  if (!res?.ok) return null;
  const tag = ((await res.json()) as { tag_name?: string }).tag_name ?? '';
  const v = tag.replace(/^v/, '');
  if (!parse(v)) return null;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v, at: Date.now() }));
  } catch {
    // sem espaço: confere de novo da próxima vez
  }
  return v;
}

let checked: Promise<Update | null> | null = null;

// Uma conferência por vez que o app abre. Fora dos apps não tem o que atualizar.
export function findUpdate(): Promise<Update | null> {
  if (!desktop && !mobilePlatform) return Promise.resolve(null);
  checked ??= (async () => {
    const [mine, latest] = await Promise.all([installed(), latestVersion()]);
    // Versão de teste (0.0.0-teste) não tem com o que comparar.
    if (!latest || (mine.version && !parse(mine.version))) return null;
    if (!newer(latest, mine.version ?? OLD_APP)) return null;
    const file = desktop ? 'SimpleCall-Windows.exe' : 'SimpleCall-Android.apk';
    return { version: latest, canInstall: mine.canInstall, download: `https://github.com/${REPO}/releases/latest/download/${file}` };
  })().catch(() => null);
  return checked;
}

// Instala (o app baixa, confere e instala) ou, em app antigo, abre o download no navegador.
// 'permission': no Android, a pessoa precisa permitir instalar apps do Simple Call e tocar de novo.
export async function installUpdate(update: Update, onProgress: ProgressFn): Promise<'installing' | 'permission' | 'opened'> {
  if (!update.canInstall) {
    // O app desktop abre links de fora no navegador; o do Android também, saindo do WebView.
    if (desktop) window.open(update.download, '_blank');
    else location.href = update.download;
    return 'opened';
  }
  if (desktop?.installUpdate) {
    const off = desktop.onUpdateProgress?.(onProgress);
    try {
      const r = await desktop.installUpdate(update.version);
      if (!r.ok) throw new Error(r.error ?? 'failed');
      return 'installing';
    } finally {
      off?.();
    }
  }
  const ref = await androidPlugin();
  if (!ref) throw new Error('unsupported');
  const sub = await ref.p.addListener('progress', (e) => onProgress(e.percent));
  try {
    return (await ref.p.install({ version: update.version })).status;
  } finally {
    void sub.remove();
  }
}
