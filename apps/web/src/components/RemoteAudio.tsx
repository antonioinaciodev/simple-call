import { useEffect, useMemo, useRef } from 'react';
import type { Mesh, Peer } from '../lib/mesh';

// Toca o mic e o áudio da tela de uma pessoa, na saída de áudio escolhida nos ajustes.
export function RemoteAudio({ mesh, peer, speakerId }: { mesh: Mesh; peer: Peer; speakerId: string }) {
  const { mic, screenAudio } = mesh.remoteMedia(peer);
  return (
    <>
      {mic && <AudioTrack track={mic} speakerId={speakerId} />}
      {screenAudio && <AudioTrack track={screenAudio} speakerId={speakerId} />}
    </>
  );
}

function AudioTrack({ track, speakerId }: { track: MediaStreamTrack; speakerId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const stream = useMemo(() => new MediaStream([track]), [track]);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    el?.setSinkId?.(speakerId).catch(() => {});
  }, [speakerId]);

  return <audio ref={ref} autoPlay />;
}
