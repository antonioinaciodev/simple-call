import { useState } from 'react';
import type { SetPrefs } from '../App';
import { getSession, type Session } from '../lib/api';
import type { Prefs } from '../lib/prefs';
import { Call } from './Call';
import { PreJoin } from './PreJoin';

interface Props {
  code: string;
  prefs: Prefs;
  setPrefs: SetPrefs;
  navigate: (to: string) => void;
}

type Stage = { kind: 'prejoin' } | { kind: 'call'; session: Session } | { kind: 'left'; reason?: string };

export function RoomPage({ code, prefs, setPrefs, navigate }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'prejoin' });

  async function join() {
    const session = await getSession(code, prefs.name);
    setStage({ kind: 'call', session });
  }

  if (stage.kind === 'prejoin') {
    return <PreJoin code={code} prefs={prefs} setPrefs={setPrefs} onJoin={join} />;
  }
  if (stage.kind === 'call') {
    return (
      <Call
        code={code}
        session={stage.session}
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
          <button className="btn" onClick={() => navigate('/')}>
            Início
          </button>
        </div>
      </div>
    </div>
  );
}
