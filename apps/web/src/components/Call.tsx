import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { SetPrefs } from '../App';
import { useSpeaking } from '../hooks/useSpeaking';
import { getIceServers } from '../lib/api';
import { Mesh, type ChatMessage } from '../lib/mesh';
import { audioSettings, cameraConstraints, micConstraints, type Prefs } from '../lib/prefs';
import { screenPreset } from '../lib/screen';
import { Chat } from './Chat';
import { ControlBar } from './ControlBar';
import { RemoteAudio } from './RemoteAudio';
import { Settings } from './Settings';
import { Stage } from './Stage';
import { Stats } from './Stats';

interface Props {
  code: string;
  prefs: Prefs;
  setPrefs: SetPrefs;
  onLeave: (reason?: string) => void;
}

export type Panel = 'chat' | 'settings' | null;

// Ações de mídia usadas pela barra de controles e pelos ajustes.
export interface MediaActions {
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
  share: () => Promise<void>;
  stopShare: () => void;
  // Aplica ajustes novos na call; mic ou câmera são recapturados (dispositivo, cancelamento de eco...)
  // e trocados sem renegociar a conexão.
  applyPrefs: (next: Prefs, recapture: 'mic' | 'camera' | 'none') => Promise<void>;
}

const MAX_MESSAGES = 500;

async function capture(kind: 'audio' | 'video', constraints: MediaTrackConstraints) {
  const stream = await navigator.mediaDevices.getUserMedia({ [kind]: constraints });
  return kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
}

export function Call({ code, prefs, setPrefs, onLeave }: Props) {
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [showStats, setShowStats] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  useEffect(() => {
    let m: Mesh | null = null;
    let cancelled = false;
    const p = prefsRef.current;
    getIceServers()
      .then(async (iceServers) => {
        if (cancelled) return;
        m = new Mesh({
          room: code,
          name: p.name.trim(),
          iceServers,
          codec: p.videoCodec,
          audio: audioSettings(p),
          onChange: rerender,
          onChat: (msg) => setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES)),
          onClose: (reason) => onLeaveRef.current(reason),
        });
        setMesh(m);
        // Mic e câmera em paralelo; se um falhar (permissão negada), o outro segue.
        const [mic, cam] = await Promise.allSettled([
          p.micOn ? capture('audio', micConstraints(p)) : null,
          p.camOn ? capture('video', cameraConstraints(p)) : null,
        ]);
        if (cancelled) return;
        if (mic.status === 'fulfilled') m.setMic(mic.value);
        else flash('Não deu pra acessar o microfone.');
        if (cam.status === 'fulfilled') m.setCamera(cam.value);
        else flash('Não deu pra acessar a câmera.');
      })
      .catch((e: Error) => !cancelled && setError(`Não foi possível conectar: ${e.message}`));
    return () => {
      cancelled = true;
      m?.leave();
    };
    // Conecta uma vez por entrada na call.
  }, [code, flash]);

  const actions = useMemo<MediaActions | null>(() => {
    if (!mesh) return null;
    const run = async (fn: () => Promise<unknown> | unknown, fail: string) => {
      try {
        await fn();
      } catch (e) {
        // Cancelar o seletor de tela do navegador não é erro.
        if (e instanceof Error && e.name === 'NotAllowedError' && fail.includes('tela')) return;
        flash(fail);
      }
    };
    return {
      toggleMic: () =>
        run(async () => {
          const on = !mesh.mic;
          setPrefs({ micOn: on });
          mesh.setMic(on ? await capture('audio', micConstraints(prefsRef.current)) : null);
        }, 'Não deu pra acessar o microfone.'),
      toggleCam: () =>
        run(async () => {
          const on = !mesh.camera;
          setPrefs({ camOn: on });
          mesh.setCamera(on ? await capture('video', cameraConstraints(prefsRef.current)) : null);
        }, 'Não deu pra acessar a câmera.'),
      share: () =>
        run(() => mesh.startScreen(screenPreset(prefsRef.current.screenPreset), prefsRef.current.shareAudio), 'Não deu pra transmitir a tela.'),
      stopShare: () => mesh.stopScreen(),
      applyPrefs: (next, recapture) =>
        run(async () => {
          mesh.setAudio(audioSettings(next));
          mesh.setCodec(next.videoCodec);
          if (recapture === 'mic' && mesh.mic) mesh.setMic(await capture('audio', micConstraints(next)));
          if (recapture === 'camera' && mesh.camera) mesh.setCamera(await capture('video', cameraConstraints(next)));
        }, 'Não deu pra aplicar o ajuste.'),
    };
  }, [mesh, setPrefs, flash]);

  const speaking = useSpeaking(mesh);

  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (panel === 'chat') setSeen(messages.length);
  }, [panel, messages.length]);
  const unread = panel !== 'chat' && messages.length > seen;

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

  if (!mesh || !actions) return <div className="center-page muted">Conectando…</div>;

  const peers = [...mesh.peers.values()];

  return (
    <div className={`call ${panel ? 'with-panel' : ''}`}>
      <header className="call-top">
        <span className="code">{code}</span>
      </header>
      <main className="stage-wrap">
        <Stage mesh={mesh} speaking={speaking} />
        {showStats && <Stats peers={peers} />}
      </main>
      {panel && (
        <aside className="panel">
          {panel === 'chat' ? (
            <Chat messages={messages} send={(text) => mesh.sendChat(text)} onClose={() => setPanel(null)} />
          ) : (
            <Settings prefs={prefs} setPrefs={setPrefs} actions={actions} onClose={() => setPanel(null)} />
          )}
        </aside>
      )}
      <ControlBar
        mesh={mesh}
        actions={actions}
        prefs={prefs}
        setPrefs={setPrefs}
        panel={panel}
        setPanel={setPanel}
        unread={unread}
        showStats={showStats}
        toggleStats={() => setShowStats((s) => !s)}
        onLeave={() => onLeave()}
        toast={toast}
      />
      {peers.map((p) => (
        <RemoteAudio key={p.id} mesh={mesh} peer={p} speakerId={prefs.speakerId} />
      ))}
    </div>
  );
}
