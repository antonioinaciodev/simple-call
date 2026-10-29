import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { DisconnectReason, Room, RoomEvent, VideoPresets } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import type { SetPrefs } from '../App';
import { useChat } from '../hooks/useChat';
import type { Session } from '../lib/api';
import { audioCapture, audioPublish, type Prefs } from '../lib/prefs';
import { Chat } from './Chat';
import { ControlBar } from './ControlBar';
import { Settings } from './Settings';
import { Stage } from './Stage';
import { Stats } from './Stats';

interface Props {
  code: string;
  session: Session;
  prefs: Prefs;
  setPrefs: SetPrefs;
  onLeave: (reason?: string) => void;
}

export type Panel = 'chat' | 'settings' | null;

function createRoom(prefs: Prefs) {
  return new Room({
    // Cada quadro recebe só a resolução do tamanho em que aparece na tela,
    // e vídeo fora da tela é pausado.
    adaptiveStream: true,
    // Camadas de simulcast que ninguém está assistindo param de ser enviadas.
    dynacast: true,
    audioCaptureDefaults: audioCapture(prefs),
    videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
    publishDefaults: {
      ...audioPublish(prefs),
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
    },
  });
}

const LEAVE_REASONS: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.DUPLICATE_IDENTITY]: 'Você entrou na mesma call em outra aba.',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'Você foi removido da call.',
  [DisconnectReason.ROOM_DELETED]: 'A call foi encerrada.',
  [DisconnectReason.SIGNAL_CLOSE]: 'A conexão com o servidor caiu.',
};

export function Call({ code, session, prefs, setPrefs, onLeave }: Props) {
  const [room] = useState(() => createRoom(prefs));
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [showStats, setShowStats] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    let active = true;
    const onDisconnected = (reason?: DisconnectReason) => {
      if (leaving.current) return;
      onLeave(reason !== undefined ? LEAVE_REASONS[reason] : undefined);
    };
    room.on(RoomEvent.Disconnected, onDisconnected);

    room
      .connect(session.url, session.token)
      .then(async () => {
        if (!active) return;
        const lp = room.localParticipant;
        // Mic e câmera em paralelo; se um falhar (permissão negada), o outro segue.
        await Promise.allSettled([
          prefs.micOn ? lp.setMicrophoneEnabled(true, audioCapture(prefs), audioPublish(prefs)) : null,
          prefs.camOn ? lp.setCameraEnabled(true) : null,
        ]);
      })
      .catch((e: Error) => active && setError(`Não foi possível conectar: ${e.message}`));

    return () => {
      active = false;
      leaving.current = true;
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.disconnect();
    };
    // A sala é criada uma vez por entrada na call.
  }, [room]);

  // useChat fica aqui (e não no painel) pra não perder mensagens com o chat fechado.
  const chat = useChat(room);
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (panel === 'chat') setSeen(chat.messages.length);
  }, [panel, chat.messages.length]);
  const unread = panel !== 'chat' && chat.messages.length > seen;

  function leave() {
    leaving.current = true;
    room.disconnect();
    onLeave();
  }

  if (error) {
    return (
      <div className="center-page">
        <div className="home">
          <h1>Ops.</h1>
          <p className="muted">{error}</p>
          <button className="btn" onClick={() => onLeave()}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <RoomContext.Provider value={room}>
      <div className={`call ${panel ? 'with-panel' : ''}`}>
        <header className="call-top">
          <span className="code">{code}</span>
        </header>
        <main className="stage-wrap">
          <Stage />
          {showStats && <Stats />}
        </main>
        {panel && (
          <aside className="panel">
            {panel === 'chat' ? (
              <Chat chat={chat} onClose={() => setPanel(null)} />
            ) : (
              <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setPanel(null)} />
            )}
          </aside>
        )}
        <ControlBar
          prefs={prefs}
          setPrefs={setPrefs}
          panel={panel}
          setPanel={setPanel}
          unread={unread}
          showStats={showStats}
          toggleStats={() => setShowStats((s) => !s)}
          onLeave={leave}
        />
        <RoomAudioRenderer />
      </div>
    </RoomContext.Provider>
  );
}
