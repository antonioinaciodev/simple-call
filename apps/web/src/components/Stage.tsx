import { useState } from 'react';
import type { Mesh } from '../lib/mesh';
import { Tile, type TileItem } from './Tile';

// Grade quase quadrada: 1 → 1x1, 2 → 2x1, 3-4 → 2x2, 5-6 → 3x2, 7-9 → 3x3...
function gridSize(n: number) {
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

export function Stage({ mesh, speaking }: { mesh: Mesh; speaking: ReadonlySet<string> }) {
  const [pinned, setPinned] = useState<string | null>(null);

  const cameras: TileItem[] = [
    {
      key: 'local:camera',
      name: mesh.name,
      isLocal: true,
      isScreen: false,
      track: mesh.camera ?? undefined,
      micOff: !mesh.mic,
      speaking: speaking.has('local'),
      badSignal: false,
    },
  ];
  const screens: TileItem[] = [];
  const localScreen = mesh.screen?.getVideoTracks()[0];
  if (localScreen) {
    screens.push({ key: 'local:screen', name: mesh.name, isLocal: true, isScreen: true, track: localScreen, micOff: false, speaking: false, badSignal: false });
  }

  for (const p of mesh.peers.values()) {
    const media = mesh.remoteMedia(p);
    const badSignal = p.pc.connectionState === 'disconnected' || p.pc.connectionState === 'failed';
    cameras.push({ key: `${p.id}:camera`, name: p.name, isLocal: false, isScreen: false, track: media.camera, micOff: !p.micOn, speaking: speaking.has(p.id), badSignal });
    if (media.screen) {
      screens.push({ key: `${p.id}:screen`, name: p.name, isLocal: false, isScreen: true, track: media.screen, micOff: false, speaking: false, badSignal });
    }
  }

  // Com alguém transmitindo, a transmissão vira o destaque e as câmeras vão pra faixa lateral.
  // A transmissão de outra pessoa tem prioridade sobre a sua (que fica só como aviso).
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

  const { cols, rows } = gridSize(cameras.length);
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
