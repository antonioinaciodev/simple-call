import { useEffect, useState } from 'react';
import type { Mesh } from '../lib/mesh';
import { MAX_VOICE_VOLUME } from '../lib/volumes';
import { Tile, type TileItem } from './Tile';

// Grade quase quadrada: 1 → 1x1, 2 → 2x1, 3-4 → 2x2, 5-6 → 3x2, 7-9 → 3x3...
// Na tela em pé (celular) ela vira: 2 → 1x2, 5-6 → 2x3, pra cada quadro ficar maior.
function gridSize(n: number, tall: boolean) {
  const long = Math.ceil(Math.sqrt(n));
  const short = Math.ceil(n / long);
  return tall ? { cols: short, rows: long } : { cols: long, rows: short };
}

const TALL = '(orientation: portrait) and (max-width: 720px)';

function useTall() {
  const [tall, setTall] = useState(() => matchMedia(TALL).matches);
  useEffect(() => {
    const mq = matchMedia(TALL);
    const update = () => setTall(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return tall;
}

interface Props {
  mesh: Mesh;
  speaking: ReadonlySet<string>;
  voiceVolume: (name: string) => number;
  setVoiceVolume: (name: string, v: number) => void;
  streamVolume: number;
  setStreamVolume: (v: number) => void;
}

export function Stage({ mesh, speaking, voiceVolume, setVoiceVolume, streamVolume, setStreamVolume }: Props) {
  const [pinned, setPinned] = useState<string | null>(null);
  const tall = useTall();

  const cameras: TileItem[] = [
    {
      key: 'local:camera',
      name: mesh.name,
      isLocal: true,
      isScreen: false,
      track: mesh.camera ?? undefined,
      micOff: !mesh.mic,
      deafened: mesh.deafened,
      speaking: speaking.has('local'),
      badSignal: false,
    },
  ];
  const screens: TileItem[] = [];
  const localScreen = mesh.screen?.getVideoTracks()[0];
  if (localScreen) {
    screens.push({ key: 'local:screen', name: mesh.name, isLocal: true, isScreen: true, track: localScreen, micOff: false, deafened: false, speaking: false, badSignal: false, viewers: mesh.viewers });
  }

  for (const p of mesh.peers.values()) {
    const media = mesh.remoteMedia(p);
    const badSignal = mesh.reconnecting(p);
    cameras.push({
      key: `${p.id}:camera`,
      name: p.name,
      isLocal: false,
      isScreen: false,
      track: media.camera,
      micOff: !p.micOn,
      deafened: p.deafened,
      speaking: speaking.has(p.id),
      badSignal,
      volume: { value: voiceVolume(p.name), max: MAX_VOICE_VOLUME, onChange: (v) => setVoiceVolume(p.name, v) },
    });
    if (!mesh.isWatching(p)) {
      // Transmitindo, mas só chega aqui depois do clique em Assistir (como a prévia da sua).
      if (p.sharing) {
        cameras.push({
          key: `${p.id}:screen`,
          name: p.name,
          isLocal: false,
          isScreen: true,
          micOff: false,
          deafened: false,
          speaking: false,
          badSignal,
          watch: () => mesh.setWatching(p, true),
        });
      }
    } else if (media.screen || p.sharing) {
      screens.push({
        key: `${p.id}:screen`,
        name: p.name,
        isLocal: false,
        isScreen: true,
        // Sem faixa ainda: acabou de clicar em Assistir e a imagem está chegando.
        track: media.screen,
        micOff: false,
        deafened: false,
        speaking: false,
        badSignal,
        // Transmissão sem áudio (só a janela, ou áudio desligado) não tem o que ajustar.
        volume: media.screenAudio ? { value: streamVolume, max: 1, onChange: setStreamVolume } : undefined,
        stopWatching: p.sharing === undefined ? undefined : () => mesh.setWatching(p, false),
      });
    }
  }

  // Com alguém transmitindo (e você assistindo), a transmissão vira o destaque e as câmeras vão
  // pra faixa lateral. A de outra pessoa tem prioridade sobre a sua (que fica só como aviso).
  // Transmissão que você ainda não abriu fica na grade, como mais um quadro com "Assistir".
  const focus = screens.find((s) => s.key === pinned) ?? screens.find((s) => !s.isLocal) ?? screens[0];
  if (focus) {
    const others = [...screens.filter((s) => s !== focus), ...cameras];
    return (
      <div className="focus-layout">
        <div className="focus-main">
          <Tile item={focus} fit="contain" />
        </div>
        <div className="strip">
          {others.map((t) => (
            <Tile key={t.key} item={t} fit={t.isScreen ? 'contain' : 'cover'} onClick={t.isScreen ? () => setPinned(t.key) : undefined} />
          ))}
        </div>
      </div>
    );
  }

  const { cols, rows } = gridSize(cameras.length, tall);
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {cameras.map((t) => (
        <div key={t.key} className="cell">
          <Tile item={t} fit="cover" />
        </div>
      ))}
    </div>
  );
}
