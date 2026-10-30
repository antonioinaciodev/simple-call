import { Maximize, MicOff, Minimize, MonitorUp, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

export interface TileItem {
  key: string;
  name: string;
  isLocal: boolean;
  isScreen: boolean;
  track?: MediaStreamTrack;
  micOff: boolean;
  speaking: boolean;
  badSignal: boolean;
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
        {!isScreen && item.micOff && <MicOff size={13} aria-label="Microfone desligado" />}
        {item.badSignal && <WifiOff size={13} aria-label="Conexão ruim" />}
        <span>{label}</span>
      </div>
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
