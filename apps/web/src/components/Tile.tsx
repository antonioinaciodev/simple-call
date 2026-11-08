import { HeadphoneOff, Maximize, MicOff, Minimize, MonitorUp, Volume1, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { mobilePlatform, setFullscreenBars } from '../lib/native';

export interface TileItem {
  key: string;
  name: string;
  isLocal: boolean;
  isScreen: boolean;
  track?: MediaStreamTrack;
  micOff: boolean;
  deafened: boolean;
  speaking: boolean;
  badSignal: boolean;
  // Volume de quem eu escuto (1 = 100%); ausente no meu próprio quadro.
  volume?: { value: number; max: number; onChange: (v: number) => void };
}

interface Props {
  item: TileItem;
  fit: 'cover' | 'contain';
  onClick?: () => void;
}

export function Tile({ item, fit, onClick }: Props) {
  const { name, isLocal, isScreen, track } = item;
  const [preview, setPreview] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreen = useFullscreen(tileRef);
  const controls = useFullscreenControls(fullscreen.active);
  const stream = useMemo(() => (track ? new MediaStream([track]) : null), [track]);

  // Mostrar a própria tela de volta gasta GPU e cria o "efeito espelho infinito";
  // por padrão mostramos só um aviso, com opção de ver a prévia.
  const hideOwnScreen = isScreen && isLocal && !preview;
  const showVideo = !!stream && !hideOwnScreen;
  const canFullscreen = isScreen && showVideo;
  const label = isScreen ? `Tela de ${name}` : isLocal ? `${name} (você)` : name;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = showVideo ? stream : null;
  }, [stream, showVideo]);

  return (
    <div
      ref={tileRef}
      className={[
        'tile',
        item.speaking && !isScreen && 'speaking',
        onClick && !fullscreen.active && 'clickable',
        fullscreen.pseudo && 'pseudo-fullscreen',
        fullscreen.active && (controls.visible ? 'fs-controls' : 'fs-idle'),
      ]
        .filter(Boolean)
        .join(' ')}
      // Na tela cheia, clicar ou tocar na imagem mostra (ou esconde) o volume e o botão de sair.
      onClick={fullscreen.active ? controls.toggle : onClick}
      onDoubleClick={canFullscreen ? fullscreen.toggle : undefined}
    >
      {showVideo ? (
        // Sem som: o áudio de cada pessoa toca à parte (RemoteAudio).
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={!isScreen && isLocal ? 'mirror' : undefined}
          style={{ objectFit: fit }}
        />
      ) : hideOwnScreen ? (
        <div className="own-screen">
          <MonitorUp size={28} />
          <span>Você está transmitindo</span>
          <button
            className="btn ghost small"
            onClick={(e) => {
              e.stopPropagation();
              setPreview(true);
            }}
          >
            Ver prévia
          </button>
        </div>
      ) : (
        <div className="avatar">{name.charAt(0).toUpperCase()}</div>
      )}
      <div className="tile-label">
        {item.deafened ? (
          <HeadphoneOff size={13} aria-label="Som da call desligado" />
        ) : (
          !isScreen && item.micOff && <MicOff size={13} aria-label="Microfone desligado" />
        )}
        {item.badSignal && <WifiOff size={13} aria-hidden />}
        <span>{label}</span>
        {item.badSignal && <span className="tile-status">reconectando…</span>}
      </div>
      {item.volume && (
        <VolumeControl {...item.volume} label={isScreen ? 'Volume da transmissão' : `Volume de ${name}`} onActivity={controls.keep} />
      )}
      {canFullscreen && (
        <button
          className="tile-action"
          onClick={(e) => {
            e.stopPropagation();
            fullscreen.toggle();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'}
          title={fullscreen.active ? 'Sair da tela cheia (Esc)' : 'Tela cheia (ou dois cliques)'}
        >
          {fullscreen.active ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      )}
    </div>
  );
}

// Volume na hora, no canto do quadro: clicar no ícone muta e desmuta só pra você.
function VolumeControl({
  value,
  max,
  onChange,
  label,
  onActivity,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  onActivity: () => void;
}) {
  const [before, setBefore] = useState(1);
  const Icon = value === 0 ? VolumeX : value < 0.5 ? Volume1 : Volume2;
  const pct = Math.round(value * 100);
  return (
    // Clique e dois cliques aqui não fixam o quadro nem abrem a tela cheia.
    // Mexer aqui segura o controle na tela cheia.
    <div
      className="tile-volume"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={onActivity}
      onPointerMove={onActivity}
      onKeyDown={onActivity}
    >
      <button
        className="tile-volume-btn"
        onClick={() => {
          if (value > 0) setBefore(value);
          onChange(value > 0 ? 0 : before || 1);
        }}
        title={value > 0 ? 'Mutar só pra você' : 'Desmutar'}
      >
        <Icon size={15} />
      </button>
      <input
        type="range"
        min={0}
        max={max * 100}
        step={5}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        title={label}
      />
      <span className="tile-volume-pct">{pct}%</span>
    </div>
  );
}

// Controles da tela cheia: escondidos, pra nada ficar em cima do jogo. Um clique ou toque
// mostra por alguns segundos; outro esconde. Mexer no volume segura eles na tela.
const CONTROLS_MS = 3000;

function useFullscreenControls(active: boolean) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const keep = useCallback(() => {
    window.clearTimeout(timer.current);
    setVisible(true);
    timer.current = window.setTimeout(() => setVisible(false), CONTROLS_MS);
  }, []);

  const toggle = useCallback(() => {
    if (!visible) return keep();
    window.clearTimeout(timer.current);
    setVisible(false);
  }, [visible, keep]);

  // Entrando na tela cheia os controles começam escondidos.
  useEffect(() => {
    window.clearTimeout(timer.current);
    setVisible(false);
  }, [active]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { visible, keep, toggle };
}

// Tela cheia da transmissão.
// Navegador e app de PC: a do navegador (Fullscreen API).
// App do celular: o WebView do Capacitor não deixa a página sair do espaço dela (a barra de cima
// continuava na tela), então o quadro cobre a tela por CSS e as barras do sistema somem pelo
// plugin. O botão voltar do Android sai da tela cheia em vez de sair da call.
const PSEUDO = !!mobilePlatform;
const BACK_STATE = 'simplecall:fullscreen';

function useFullscreen(ref: RefObject<HTMLDivElement | null>) {
  const [native, setNative] = useState(false);
  const [pseudo, setPseudo] = useState(false);

  useEffect(() => {
    const update = () => setNative(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [ref]);

  useEffect(() => {
    if (!pseudo) return;
    setFullscreenBars(true);
    const onBack = () => {
      if (history.state !== BACK_STATE) setPseudo(false);
    };
    addEventListener('popstate', onBack);
    return () => {
      removeEventListener('popstate', onBack);
      setFullscreenBars(false);
    };
  }, [pseudo]);

  // A transmissão acabou com a tela cheia aberta: tira a entrada extra do histórico.
  useEffect(
    () => () => {
      if (history.state === BACK_STATE) history.back();
    },
    [],
  );

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (PSEUDO) {
      if (!pseudo) {
        history.pushState(BACK_STATE, '');
        setPseudo(true);
      } else if (history.state === BACK_STATE) {
        history.back(); // o popstate fecha
      } else {
        setPseudo(false);
      }
    } else if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => {});
    } else {
      // iPhone no Safari: só o próprio <video> entra em tela cheia.
      const video = el.querySelector('video') as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      video?.webkitEnterFullscreen?.();
    }
  }

  return { active: native || pseudo, pseudo, toggle };
}
