import { useEffect, useMemo, useRef } from 'react';
import type { Mesh, Peer } from '../lib/mesh';
import { audioContext } from '../lib/sounds';

interface Props {
  mesh: Mesh;
  peer: Peer;
  speakerId: string;
  // Voz de 0 a 2 (200%); áudio da transmissão de 0 a 1.
  voiceVolume: number;
  streamVolume: number;
  deafened: boolean;
}

// Toca o mic e o áudio da tela de uma pessoa, na saída de áudio escolhida nos ajustes.
export function RemoteAudio({ mesh, peer, speakerId, voiceVolume, streamVolume, deafened }: Props) {
  const { mic, screenAudio } = mesh.remoteMedia(peer);
  return (
    <>
      {mic && <AudioTrack track={mic} speakerId={speakerId} volume={deafened ? 0 : voiceVolume} />}
      {screenAudio && <AudioTrack track={screenAudio} speakerId={speakerId} volume={deafened ? 0 : streamVolume} />}
    </>
  );
}

function AudioTrack({ track, speakerId, volume }: { track: MediaStreamTrack; speakerId: string; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const stream = useMemo(() => new MediaStream([track]), [track]);
  // Até 100% o próprio <audio> resolve, sem custo extra. Acima disso o volume passa por um
  // ganho do Web Audio, e o <audio> fica mudo (mas tocando: sem ele o Chrome não entrega o
  // áudio da conexão pro Web Audio).
  const boost = volume > 1;
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    el?.setSinkId?.(speakerId).catch(() => {});
  }, [speakerId]);

  useEffect(() => {
    if (!boost) return;
    const ac = audioContext();
    const source = ac.createMediaStreamSource(stream);
    const gain = ac.createGain();
    source.connect(gain).connect(ac.destination);
    gainRef.current = gain;
    return () => {
      source.disconnect();
      gain.disconnect();
      gainRef.current = null;
    };
  }, [stream, boost]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = boost || volume === 0;
    el.volume = Math.min(volume, 1);
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume, boost]);

  return <audio ref={ref} autoPlay />;
}
