import { Code2, Download, Link2, MonitorPlay, Radio, Volume2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createRoom, parseRoomCode } from '../lib/api';
import { detectOs, inApp, type Os } from '../lib/native';

const REPO = 'https://github.com/antonioinaciodev/simple-call';
const latest = (file: string) => `${REPO}/releases/latest/download/${file}`;

const DOWNLOADS: { os: Os; name: string; short: string; note: string; files: { label: string; file: string }[] }[] = [
  {
    os: 'windows',
    name: 'Windows',
    short: 'Windows',
    note: 'Windows 10 ou 11. Manda só o áudio do jogo, sem as vozes da call.',
    files: [{ label: 'Baixar .exe', file: 'SimpleCall-Windows.exe' }],
  },
  {
    os: 'linux',
    name: 'Linux',
    short: 'Linux',
    note: 'AppImage roda em qualquer distro; o .deb é pra Ubuntu, Mint e Debian.',
    files: [
      { label: 'AppImage', file: 'SimpleCall-Linux.AppImage' },
      { label: '.deb', file: 'SimpleCall-Linux.deb' },
    ],
  },
  {
    os: 'android',
    name: 'Android',
    short: 'Android',
    note: 'Android 7 ou mais novo. Permita instalar apps de fontes desconhecidas.',
    files: [{ label: 'Baixar .apk', file: 'SimpleCall-Android.apk' }],
  },
  {
    os: 'ios',
    name: 'iPhone',
    short: 'iPhone',
    note: 'Sem assinatura da Apple: só com Sideloadly ou AltStore, e vale 7 dias. No Safari funciona direto.',
    files: [{ label: 'Baixar .ipa', file: 'SimpleCall-iOS-sem-assinatura.ipa' }],
  },
];

const FEATURES = [
  { icon: Link2, title: 'Só um link', text: 'Cria a call e manda o link. Sem conta e sem servidor pra configurar, até 6 pessoas.' },
  { icon: Radio, title: 'Direto entre vocês', text: 'Voz, vídeo e chat vão direto de um PC pro outro, sem passar por servidor no meio.' },
  { icon: MonitorPlay, title: 'Tela em 1080p 60', text: 'Transmissão leve pra jogo, com o codec que a placa de vídeo de cada um aguenta.' },
  { icon: Volume2, title: 'Só o som do jogo', text: 'No app de PC, quem assiste ouve o jogo sem ouvir as vozes da call de volta.' },
];

// Dentro dos apps a página é só a entrada da call; no navegador ela também apresenta o app.
export function Home({ navigate }: { navigate: (to: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [os] = useState(detectOs);

  async function newCall() {
    setBusy(true);
    setError('');
    try {
      navigate(`/${await createRoom()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a call.');
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const code = parseRoomCode(input);
    if (code) navigate(`/${code}`);
    else setError('Código inválido. Ele tem o formato abc-defg-hij.');
  }

  const mine = DOWNLOADS.find((d) => d.os === os);
  const ordered = mine ? [mine, ...DOWNLOADS.filter((d) => d !== mine)] : DOWNLOADS;

  return (
    <div className={inApp ? 'center-page' : 'landing'}>
      <section className={inApp ? undefined : 'landing-hero'}>
        <div className="home">
          <div className="wordmark">
            <span className="dot" /> simplecall
          </div>
          <h1>Chamadas leves pra jogar e transmitir com os amigos.</h1>
          <p className="muted">Sem servidor, sem canal, sem conta. Cria a call, manda o link.</p>

          <div className="home-actions">
            <button className="btn primary" onClick={newCall} disabled={busy}>
              {busy ? 'Criando…' : 'Nova call'}
            </button>
            <form className="join" onSubmit={join}>
              <input
                className="input"
                placeholder="Código ou link"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError('');
                }}
                aria-label="Código ou link da call"
              />
              <button className="btn" type="submit" disabled={!input.trim()}>
                Entrar
              </button>
            </form>
          </div>
          {error && <p className="error">{error}</p>}

          {!inApp && (
            <p className="hero-download muted">
              {mine && mine.os !== 'ios' ? (
                <>
                  Funciona aqui no navegador, ou{' '}
                  <a href={latest(mine.files[0].file)}>
                    <Download size={14} /> baixe o app pra {mine.short}
                  </a>
                  . <a href="#baixar">Outros sistemas</a>
                </>
              ) : (
                <>
                  Funciona aqui no navegador. <a href="#baixar">Baixar o app</a>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {!inApp && (
        <>
          <section className="landing-section">
            <div className="features">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="feature">
                  <Icon size={18} />
                  <h3>{title}</h3>
                  <p className="muted">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="landing-section" id="baixar">
            <h2>Baixar o app</h2>
            <p className="muted">
              O app abre o mesmo Simple Call do navegador e se atualiza sozinho. No PC ele tem o seletor de janelas e o
              áudio só do jogo; no celular, a escolha entre alto-falante e fone e o mic com o app em segundo plano.
            </p>
            <div className="downloads">
              {ordered.map((d) => (
                <div key={d.os} className={`download ${d === mine ? 'mine' : ''}`}>
                  <div className="download-head">
                    <strong>{d.name}</strong>
                    {d === mine && <span className="tag">seu sistema</span>}
                  </div>
                  <p className="muted">{d.note}</p>
                  <div className="download-files">
                    {d.files.map((f) => (
                      <a key={f.file} className={`btn small ${d === mine ? 'primary' : ''}`} href={latest(f.file)}>
                        {f.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="muted small-note">
              No Mac ainda não tem app: use no navegador. O Windows pode avisar "protegeu o computador" porque o instalador
              não tem certificado pago: <em>Mais informações → Executar assim mesmo</em>.
            </p>
          </section>

          <footer className="landing-footer muted">
            <span>simplecall v{__APP_VERSION__}</span>
            <a href={`${REPO}/blob/main/CHANGELOG.md`}>Novidades</a>
            <a href={REPO}>
              <Code2 size={14} /> Código aberto (MIT)
            </a>
          </footer>
        </>
      )}
    </div>
  );
}
