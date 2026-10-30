import { useEffect, useRef, useState } from 'react';
import type { Peer } from '../lib/mesh';
import { readStats, type PeerStats } from '../lib/stats';

export function Stats({ peers }: { peers: Peer[] }) {
  const [stats, setStats] = useState<Record<string, PeerStats>>({});
  const peersRef = useRef(peers);
  peersRef.current = peers;

  useEffect(() => {
    let alive = true;
    async function tick() {
      const entries = await Promise.all(peersRef.current.map(async (p) => [p.id, await readStats(p)] as const));
      if (alive) setStats(Object.fromEntries(entries));
    }
    void tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="stats" aria-live="off">
      {peers.map((p) => {
        const s = stats[p.id];
        return (
          <div key={p.id} className="stats-row col">
            <span>
              {p.name} · {s?.rtt !== undefined ? `${Math.round(s.rtt * 1000)} ms` : '—'} · {s?.route ?? 'conectando'}
            </span>
            {s?.lines.map((l) => (
              <strong key={l}>{l}</strong>
            ))}
          </div>
        );
      })}
      {peers.length === 0 && <p className="muted small">Ninguém conectado ainda.</p>}
    </div>
  );
}
