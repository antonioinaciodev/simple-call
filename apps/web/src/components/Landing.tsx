import { ArrowRight, Code2, Download, Eye, Gauge, Globe, Link2, MonitorPlay, Radio, Smartphone, Volume2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { APP_HOME, detectOs, type Os } from '../lib/native';

const REPO = 'https://github.com/antonioinaciodev/simple-call';
const latest = (file: string) => `${REPO}/releases/latest/download/${file}`;

const APPS: Record<Os, { name: string; file: string; ext: string; note: string }> = {
  windows: { name: 'Windows', file: 'SimpleCall-Windows.exe', ext: '.exe', note: 'instala sem pedir administrador' },
  android: { name: 'Android', file: 'SimpleCall-Android.apk', ext: '.apk', note: 'Android 7 ou mais novo' },
};

const FEATURES = [
  { icon: Link2, title: 'Só um link', text: 'Cria a call e manda o link. Sem conta, sem servidor pra configurar, até 6 pessoas.' },
  { icon: Radio, title: 'Direto entre vocês', text: 'Voz, vídeo e chat vão de um PC pro outro, sem servidor de mídia no meio.' },
  { icon: MonitorPlay, title: 'Tela em 1080p 60', text: 'Transmissão leve pra jogo, no codec que a placa de vídeo de cada um aguenta.' },
  { icon: Volume2, title: 'Só o som do jogo', text: 'No app de Windows, quem assiste ouve o jogo sem ouvir as vozes da call de volta.' },
  { icon: Eye, title: 'Só assiste quem quer', text: 'A transmissão só chega pra quem clicar em Assistir, sem gastar a internet de ninguém à toa.' },
  { icon: Gauge, title: 'Não pesa no jogo', text: 'Interface simples, sem anúncio nem nada rodando por trás. Abre na hora.' },
];

// Página de apresentação (só no navegador): o que é o Simple Call, baixar o app ou abrir no
// navegador. O app em si fica em /app (e é o que os apps instalados abrem).
export function Landing({ navigate }: { navigate: (to: string) => void }) {
  const os = detectOs();
  const mine = os ? APPS[os] : null;

  // Link de verdade (abre em outra aba com o botão do meio), mas sem recarregar a página.
  const openApp = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(APP_HOME);
  };

  return (
    <div className="site">
      <header className="site-nav">
        <a className="wordmark" href="/" aria-label="Simple Call">
          <span className="dot" /> simplecall
        </a>
        <nav>
          <a href="#recursos">Recursos</a>
          <a href="#baixar">Baixar</a>
          <a className="btn small" href={APP_HOME} onClick={openApp}>
            Abrir no navegador
          </a>
        </nav>
      </header>

      <main>
        <section className="site-hero">
          <p className="eyebrow muted">Grátis · código aberto · sem conta</p>
          <h1>Chamadas leves pra jogar e transmitir com os amigos.</h1>
          <p className="lead muted">
            Cria a call, manda o link e pronto. Voz, chat e transmissão de tela em 1080p 60, direto entre vocês.
          </p>
          <div className="hero-ctas">
            {mine ? (
              <>
                <a className="btn primary" href={latest(mine.file)}>
                  <Download size={16} /> Baixar pra {mine.name}
                </a>
                <a className="btn" href={APP_HOME} onClick={openApp}>
                  Abrir no navegador
                </a>
              </>
            ) : (
              <>
                <a className="btn primary" href={APP_HOME} onClick={openApp}>
                  Abrir no navegador <ArrowRight size={16} />
                </a>
                <a className="btn" href="#baixar">
                  Baixar o app
                </a>
              </>
            )}
          </div>
          <p className="hero-note muted small">
            v{__APP_VERSION__}
            {mine ? ` · ${mine.ext}, ${mine.note}` : ' · apps pra Windows e Android'}
          </p>
          <figure className="hero-shot">
            <img
              src="/landing/transmissao.webp"
              width={1440}
              height={860}
              alt="Uma call do Simple Call com a transmissão de um jogo, as pessoas ao lado e o chat aberto"
              decoding="async"
              fetchPriority="high"
            />
          </figure>
        </section>

        <section id="recursos" className="site-section">
          <h2>Feito pra jogar junto</h2>
          <p className="muted section-lead">Tudo que precisa numa call com os amigos, e nada além disso.</p>
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

        <section id="baixar" className="site-section">
          <h2>Baixar</h2>
          <p className="muted section-lead">
            Os apps abrem o mesmo Simple Call do navegador e se atualizam sozinhos. O de Windows tem o seletor de janelas e o
            áudio só do jogo; o de Android segue com o mic ligado em segundo plano.
          </p>
          <div className="downloads">
            {(['windows', 'android'] as const).map((id) => {
              const app = APPS[id];
              const Icon = id === 'windows' ? MonitorPlay : Smartphone;
              return (
                <div key={id} className={`download ${os === id ? 'mine' : ''}`}>
                  <div className="download-head">
                    <strong>
                      <Icon size={16} /> {app.name}
                    </strong>
                    {os === id && <span className="tag">seu sistema</span>}
                  </div>
                  <p className="muted">
                    {id === 'windows'
                      ? 'Windows 10 ou 11. Se aparecer "O Windows protegeu o computador": Mais informações → Executar assim mesmo.'
                      : 'Android 7 ou mais novo. Permita instalar apps de fontes desconhecidas.'}
                  </p>
                  <a className={`btn small ${os === id ? 'primary' : ''}`} href={latest(app.file)}>
                    Baixar {app.ext}
                  </a>
                </div>
              );
            })}
            <div className={`download ${os ? '' : 'mine'}`}>
              <div className="download-head">
                <strong>
                  <Globe size={16} /> Navegador
                </strong>
              </div>
              <p className="muted">Linux, Mac, iPhone ou qualquer PC: abre no Chrome, Edge ou Safari, sem instalar nada.</p>
              <a className={`btn small ${os ? '' : 'primary'}`} href={APP_HOME} onClick={openApp}>
                Abrir no navegador
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer muted">
        <span>simplecall v{__APP_VERSION__}</span>
        <a href={`${REPO}/blob/main/CHANGELOG.md`}>Novidades</a>
        <a href={REPO}>
          <Code2 size={14} /> Código aberto (MIT)
        </a>
      </footer>
    </div>
  );
}
