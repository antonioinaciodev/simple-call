import { Activity, ArrowLeft, Mic, MicOff, MonitorOff, MonitorUp, PhoneOff } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import type { SetPrefs } from '../App';
import { CopyLinkButton } from '../components/CopyLinkButton';
import type { Prefs } from '../lib/prefs';
import { Mesh, P2P_SCREEN_PRESETS, remoteMedia, type Peer, type VideoCodecPref } from './mesh';
import { readStats, type PeerStats } from './stats';

// Protótipo do modo P2P, separado do app principal (LiveKit) pra comparar os dois lado a lado.

interface Props {
  code: string;
  prefs: Prefs;
  setPrefs: SetPrefs;
  navigate: (to: string) => void;
}

export function P2PPage({ code, prefs, setPrefs, navigate }: Props) {
  const [joined, setJoined] = useState(false);
  const [left, setLeft] = useState<string | null>(null);

  if (left !== null) {
    return (
      <div className="center-page">
        <div className="home">
          <h1>Você saiu da call.</h1>
          {left && <p className="muted">{left}</p>}
          <div className="home-actions row">
            <button className="btn primary" onClick={() => setLeft(null)}>
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
  if (joined) {
    return (
      <P2PCall
        code={code}
        prefs={prefs}
        setPrefs={setPrefs}
        onLeave={(reason) => {
          setJoined(false);
          setLeft(reason);
        }}
      />
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (prefs.name.trim()) setJoined(true);
  }

  return (
    <div className="center-page">
      <form className="home prejoin-form" onSubmit={submit}>
        <p className="muted small">Protótipo P2P · entrando em</p>
        <div className="code-row">
          <span className="code">{code}</span>
          <CopyLinkButton />
        </div>
        <label className="field">
          <span>Seu nome</span>
          <input
            className="input"
            autoFocus
            maxLength={32}
            value={prefs.name}
            onChange={(e) => setPrefs({ name: e.target.value })}
            placeholder="Como seus amigos te chamam"
          />
        </label>
        <button className="btn primary" type="submit" disabled={!prefs.name.trim()}>
          Entrar na call
        </button>
        <button className="btn ghost" type="button" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          Voltar ao início
        </button>
      </form>
    </div>
  );
}

interface CallProps {
  code: string;
  prefs: Prefs;
  setPrefs: SetPrefs;
  onLeave: (reason: string) => void;
}

function P2PCall({ code, prefs, setPrefs, onLeave }: CallProps) {
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [presetId, setPresetId] = useState(P2P_SCREEN_PRESETS[0].id);
  const [withAudio, setWithAudio] = useState(prefs.shareAudio);
  const [showStats, setShowStats] = useState(false);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  useEffect(() => {
    let m: Mesh | null = null;
    let cancelled = false;
    (async () => {
      const { iceServers } = await fetch('/api/ice').then((r) => r.json() as Promise<{ iceServers: RTCIceServer[] }>);
      // O mic é capturado sempre (se tiver permissão) e só fica mudo quando desligado,
      // pra ligar e desligar sem renegociar a conexão.
      const mic = await navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression, autoGainControl: prefs.autoGainControl } })
        .catch(() => null);
      if (cancelled) return mic?.getTracks().forEach((t) => t.stop());
      mic?.getAudioTracks().forEach((t) => (t.enabled = prefs.micOn));
      if (!mic) setError('Sem microfone: você vai só ouvir.');
      m = new Mesh({
        room: code,
        name: prefs.name.trim(),
        iceServers,
        mic,
        codec: prefs.videoCodec as VideoCodecPref,
        onChange: rerender,
        onClose: (reason) => onLeaveRef.current(reason),
      });
      setMesh(m);
    })().catch(() => setError('Não deu pra conectar.'));
    return () => {
      cancelled = true;
      m?.leave();
    };
    // Conecta uma vez ao entrar; mudar ajustes no meio não reconecta.
  }, [code]);

  const peers = mesh ? [...mesh.peers.values()] : [];
  const media = peers.map((p) => ({ peer: p, ...remoteMedia(p) }));
  const screens = media.flatMap(({ peer, screens }) => screens.map((track) => ({ peer, track })));
  const audios = media.flatMap(({ audios }) => audios);
  const sharing = !!mesh?.screen;

  function toggleMic() {
    setPrefs({ micOn: !prefs.micOn });
    mesh?.setMicEnabled(!prefs.micOn);
  }

  async function startShare() {
    if (!mesh) return;
    setShareOpen(false);
    setPrefs({ shareAudio: withAudio });
    try {
      await mesh.startScreen(P2P_SCREEN_PRESETS.find((p) => p.id === presetId) ?? P2P_SCREEN_PRESETS[0], withAudio);
    } catch (e) {
      if (!(e instanceof Error && e.name === 'NotAllowedError')) setError('Não deu pra transmitir a tela.');
    }
  }

  return (
    <div className="call">
      <header className="call-top">
        <span className="code">{code}</span> · protótipo P2P
      </header>
      <main className="stage-wrap">
        {showStats && mesh && <P2PStats peers={peers} />}
        <div className="p2p-stage">
          {screens.length > 0 ? (
            screens.map(({ peer, track }) => <ScreenTile key={track.id} name={peer.name} track={track} />)
          ) : (
            <div className="p2p-empty muted">
              {sharing ? `Você está transmitindo em ${mesh?.screenPreset?.label}.` : 'Ninguém transmitindo agora.'}
            </div>
          )}
        </div>
        <div className="p2p-people">
          <span className="p2p-person">{prefs.name} (você){!prefs.micOn && ' · mudo'}</span>
          {peers.map((p) => (
            <span key={p.id} className="p2p-person">
              {p.name} · {STATE[p.pc.connectionState] ?? p.pc.connectionState}
            </span>
          ))}
          {peers.length === 0 && <span className="muted small">Esperando alguém entrar pelo link…</span>}
        </div>
        {audios.map((t) => (
          <MediaAudio key={t.id} track={t} />
        ))}
      </main>
      <footer className="controls">
        <div className="controls-side">
          <CopyLinkButton />
        </div>
        <div className="controls-main">
          <button className={`icon-btn ${prefs.micOn ? 'on' : 'off'}`} onClick={toggleMic} title="Microfone">
            {prefs.micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <div className="popover-anchor">
            <button
              className={`icon-btn ${sharing ? 'active' : ''}`}
              onClick={() => (sharing ? mesh?.stopScreen() : setShareOpen((o) => !o))}
              title={sharing ? 'Parar transmissão' : 'Transmitir tela'}
            >
              {sharing ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
            </button>
            {shareOpen && (
              <div className="popover" role="dialog" aria-label="Transmitir tela">
                <p className="popover-title">Qualidade da transmissão</p>
                <div className="options">
                  {P2P_SCREEN_PRESETS.map((p) => (
                    <label key={p.id} className={`option ${presetId === p.id ? 'selected' : ''}`}>
                      <input type="radio" name="p2p-preset" checked={presetId === p.id} onChange={() => setPresetId(p.id)} />
                      <span className="option-main">{p.label}</span>
                      <span className="option-hint">até {p.maxBitrate / 1e6} Mbps por pessoa assistindo</span>
                    </label>
                  ))}
                </div>
                <label className="check">
                  <input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} />
                  <span>Enviar o áudio da tela</span>
                </label>
                <button className="btn primary full" onClick={startShare}>
                  Escolher tela ou janela
                </button>
              </div>
            )}
          </div>
          <button className="icon-btn leave" onClick={() => onLeave('')} title="Sair da call">
            <PhoneOff size={20} />
          </button>
        </div>
        <div className="controls-side right">
          <button className={`icon-btn small ${showStats ? 'active' : ''}`} onClick={() => setShowStats((s) => !s)} title="Estatísticas da conexão">
            <Activity size={18} />
          </button>
        </div>
        {error && <div className="toast">{error}</div>}
      </footer>
    </div>
  );
}

const STATE: Record<string, string> = {
  new: 'conectando',
  connecting: 'conectando',
  connected: 'conectado',
  disconnected: 'reconectando',
  failed: 'falhou',
  closed: 'saiu',
};

function ScreenTile({ name, track }: { name: string; track: MediaStreamTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  const stream = useMemo(() => new MediaStream([track]), [track]);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="tile" onDoubleClick={(e) => void e.currentTarget.requestFullscreen?.().catch(() => {})}>
      {/* O som da tela toca num <audio> próprio, junto com os microfones. */}
      <video ref={ref} autoPlay playsInline muted style={{ objectFit: 'contain' }} />
      <div className="tile-label">
        <span>Tela de {name}</span>
      </div>
    </div>
  );
}

function MediaAudio({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  const stream = useMemo(() => new MediaStream([track]), [track]);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function P2PStats({ peers }: { peers: Peer[] }) {
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
              {p.name}: {s?.rtt !== undefined ? `${Math.round(s.rtt * 1000)} ms` : '—'} · {s?.route ?? 'conectando'}
            </span>
            {s?.sending && <strong>enviando {s.sending}</strong>}
            {s?.receiving && <strong>recebendo {s.receiving}</strong>}
          </div>
        );
      })}
      {peers.length === 0 && <p className="muted small">Ninguém conectado ainda.</p>}
    </div>
  );
}
