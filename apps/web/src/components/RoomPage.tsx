import { useState } from 'react';
import type { SetPrefs } from '../App';
import { useRoomsStatus } from '../hooks/useRoomsStatus';
import { createNamedRoom, isNamedRoom, RoomTakenError, roomSlug } from '../lib/api';
import { APP_HOME } from '../lib/native';
import type { Prefs } from '../lib/prefs';
import { loadRecent, rememberRoom } from '../lib/recent';
import { Call } from './Call';
import { PreJoin } from './PreJoin';

interface Props {
  room: string;
  prefs: Prefs;
  setPrefs: SetPrefs;
  navigate: (to: string) => void;
}

type Stage = { kind: 'prejoin' } | { kind: 'call' } | { kind: 'left'; reason?: string };

export function RoomPage({ room, prefs, setPrefs, navigate }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'prejoin' });
  // Quem está na sala, mostrado antes de entrar. Na call a própria call já mostra todo mundo.
  const { status, loaded } = useRoomsStatus(stage.kind === 'prejoin' ? [room] : []);
  const info = status[room];
  const named = isNamedRoom(room);
  // Nome da sala fixa: o do servidor ou, enquanto ele não responde, o que ficou salvo.
  const [savedName] = useState(() => loadRecent().find((r) => r.room === room)?.name);
  // Sala fixa criada agora mesmo por esta tela (o link existia, a sala ainda não).
  const [createdName, setCreatedName] = useState<string | null>(null);
  const name = createdName ?? info?.name;
  const title = named ? (name ?? savedName ?? roomSlug(room)) : room;

  async function join() {
    rememberRoom(room, named ? name : undefined);
    setStage({ kind: 'call' });
  }

  async function create() {
    try {
      const created = await createNamedRoom(roomSlug(room));
      rememberRoom(room, created.name);
      setCreatedName(created.name);
    } catch (err) {
      // Alguém do grupo criou no mesmo instante: a sala existe, é só entrar.
      if (!(err instanceof RoomTakenError)) throw err;
      setCreatedName(roomSlug(room));
    }
  }

  if (stage.kind === 'prejoin') {
    return (
      <PreJoin
        room={room}
        title={title}
        status={info}
        missing={named && !createdName && loaded && !!info && !info.exists}
        onCreate={create}
        prefs={prefs}
        setPrefs={setPrefs}
        onJoin={join}
        onBack={() => navigate(APP_HOME)}
      />
    );
  }
  if (stage.kind === 'call') {
    return (
      <Call
        room={room}
        title={title}
        prefs={prefs}
        setPrefs={setPrefs}
        onLeave={(reason) => setStage({ kind: 'left', reason })}
      />
    );
  }
  return (
    <div className="center-page">
      <div className="home">
        <h1>Você saiu da call.</h1>
        {stage.reason && <p className="muted">{stage.reason}</p>}
        <div className="home-actions row">
          <button className="btn primary" onClick={() => setStage({ kind: 'prejoin' })}>
            Voltar pra call
          </button>
          <button className="btn" onClick={() => navigate(APP_HOME)}>
            Início
          </button>
        </div>
      </div>
    </div>
  );
}
