import {
  isTrackReference,
  useConnectionQualityIndicator,
  useIsMuted,
  useIsSpeaking,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { ConnectionQuality, Track } from 'livekit-client';
import { MicOff, MonitorUp, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
  trackRef: TrackReferenceOrPlaceholder;
  fit: 'cover' | 'contain';
  onClick?: () => void;
}

export function Tile({ trackRef, fit, onClick }: Props) {
  const p = trackRef.participant;
  const isScreen = trackRef.source === Track.Source.ScreenShare;
  const speaking = useIsSpeaking(p);
  // Referência estável: um objeto novo a cada render faria o hook se reinscrever em loop.
  const micRef = useMemo(() => ({ participant: p, source: Track.Source.Microphone }), [p]);
  const micMuted = useIsMuted(micRef);
  const videoMuted = useIsMuted(trackRef);
  const qualityOptions = useMemo(() => ({ participant: p }), [p]);
  const { quality } = useConnectionQualityIndicator(qualityOptions);
  const [preview, setPreview] = useState(false);

  const name = p.name || p.identity;
  const label = isScreen ? `Tela de ${name}` : p.isLocal ? `${name} (você)` : name;
  const hasVideo = isTrackReference(trackRef) && !videoMuted;
  // Mostrar a própria tela de volta gasta GPU e cria o "efeito espelho infinito";
  // por padrão mostramos só um aviso, com opção de ver a prévia.
  const hideOwnScreen = isScreen && p.isLocal && !preview;
  const badSignal = quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost;

  return (
    <div
      className={`tile ${speaking && !isScreen ? 'speaking' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
    >
      {hasVideo && !hideOwnScreen ? (
        <VideoTrack
          trackRef={trackRef}
          className={!isScreen && p.isLocal ? 'mirror' : undefined}
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
        {!isScreen && micMuted && <MicOff size={13} aria-label="Microfone desligado" />}
        {badSignal && <WifiOff size={13} aria-label="Conexão ruim" />}
        <span>{label}</span>
      </div>
    </div>
  );
}
