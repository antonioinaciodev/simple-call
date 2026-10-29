import { isTrackReference, useTracks, type TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useState } from 'react';
import { Tile } from './Tile';

const keyOf = (t: TrackReferenceOrPlaceholder) => `${t.participant.identity}:${t.source}`;

// Grade quase quadrada: 1 → 1x1, 2 → 2x1, 3-4 → 2x2, 5-6 → 3x2, 7-9 → 3x3...
function gridSize(n: number) {
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

export function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const [pinned, setPinned] = useState<string | null>(null);

  const screens = tracks.filter((t) => t.source === Track.Source.ScreenShare && isTrackReference(t));
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera);

  // Com alguém transmitindo, a transmissão vira o destaque e as câmeras vão pra faixa lateral.
  const focus = screens.find((s) => keyOf(s) === pinned) ?? screens[0];
  if (focus) {
    const others = [...screens.filter((s) => s !== focus), ...cameras];
    return (
      <div className="focus-layout">
        <div className="focus-main">
          <Tile trackRef={focus} fit="contain" />
        </div>
        <div className="strip">
          {others.map((t) => (
            <Tile
              key={keyOf(t)}
              trackRef={t}
              fit={t.source === Track.Source.ScreenShare ? 'contain' : 'cover'}
              onClick={t.source === Track.Source.ScreenShare ? () => setPinned(keyOf(t)) : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  const { cols, rows } = gridSize(cameras.length);
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {cameras.map((t) => (
        <div key={keyOf(t)} className="cell">
          <Tile trackRef={t} fit="cover" />
        </div>
      ))}
    </div>
  );
}
