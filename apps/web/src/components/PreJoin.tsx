import { createLocalVideoTrack, type LocalVideoTrack } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SetPrefs } from '../App';
import type { Prefs } from '../lib/prefs';
import { CopyLinkButton } from './CopyLinkButton';

interface Props {
  code: string;
  prefs: Prefs;
  setPrefs: SetPrefs;
  onJoin: () => Promise<void>;
}

export function PreJoin({ code, prefs, setPrefs, onJoin }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Prévia da câmera: só abre a câmera se ela estiver ligada, e fecha ao sair da tela.
  useEffect(() => {
    if (!prefs.camOn) return;
    let track: LocalVideoTrack | undefined;
    let cancelled = false;
    createLocalVideoTrack({ resolution: { width: 1280, height: 720 } })
      .then((t) => {
        if (cancelled) return t.stop();
        track = t;
        if (videoRef.current) t.attach(videoRef.current);
        setCamError('');
      })
      .catch(() => setCamError('Não deu pra abrir a câmera.'));
    return () => {
      cancelled = true;
      track?.stop();
    };
  }, [prefs.camOn]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onJoin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  const initial = prefs.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="center-page">
      <div className="prejoin">
        <div className="preview">
          {prefs.camOn && !camError ? (
            <video ref={videoRef} className="mirror" muted playsInline />
          ) : (
            <div className="avatar large">{initial}</div>
          )}
          <div className="preview-controls">
            <button
              type="button"
              className={`icon-btn ${prefs.micOn ? 'on' : ''}`}
              onClick={() => setPrefs({ micOn: !prefs.micOn })}
              aria-label={prefs.micOn ? 'Desligar microfone' : 'Ligar microfone'}
              title={prefs.micOn ? 'Microfone ligado' : 'Microfone desligado'}
            >
              {prefs.micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button
              type="button"
              className={`icon-btn ${prefs.camOn ? 'on' : ''}`}
              onClick={() => setPrefs({ camOn: !prefs.camOn })}
              aria-label={prefs.camOn ? 'Desligar câmera' : 'Ligar câmera'}
              title={prefs.camOn ? 'Câmera ligada' : 'Câmera desligada'}
            >
              {prefs.camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
          </div>
        </div>

        <form className="prejoin-form" onSubmit={submit}>
          <p className="muted small">Entrando em</p>
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
          <button className="btn primary" type="submit" disabled={busy || !prefs.name.trim()}>
            {busy ? 'Entrando…' : 'Entrar na call'}
          </button>
          {camError && <p className="error">{camError}</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
