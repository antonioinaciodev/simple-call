import { HeadphoneOff, Maximize, MicOff, Minimize, MonitorUp, Volume1, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

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
      className={`tile ${item.speaking && !isScreen ? 'speaking' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
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
        {item.badSignal && <WifiOff size={13} aria-label="Conexão ruim" />}
        <span>{label}</span>
      </div>
      {item.volume && <VolumeControl {...item.volume} label={isScreen ? 'Volume da transmissão' : `Volume de ${name}`} />}
      {canFullscreen && (
        <button
          className="tile-action"
          onClick={(e) => {
            e.stopPropagation();
            fullscreen.toggle();
          }}
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
function VolumeControl({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  const [before, setBefore] = useState(1);
  const Icon = value === 0 ? VolumeX : value < 0.5 ? Volume1 : Volume2;
  const pct = Math.round(value * 100);
  return (
    // Clique e dois cliques aqui não fixam o quadro nem abrem a tela cheia.
    <div className="tile-volume" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
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

function useFullscreen(ref: RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = () => setActive(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [ref]);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => {});
    } else {
      // iPhone: o Safari só deixa o próprio <video> entrar em tela cheia.
      const video = el.querySelector('video') as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      video?.webkitEnterFullscreen?.();
    }
  }

  return { active, toggle };
}
