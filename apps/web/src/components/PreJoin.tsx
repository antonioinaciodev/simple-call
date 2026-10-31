import { ArrowLeft, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SetPrefs } from '../App';
import { appLink, detectOs, inApp } from '../lib/native';
import type { Prefs } from '../lib/prefs';
import { CopyLinkButton } from './CopyLinkButton';

interface Props {
  code: string;
  prefs: Prefs;
  setPrefs: SetPrefs;
  onJoin: () => Promise<void>;
  onBack: () => void;
}

function mediaError(err: unknown, what: string) {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError') return `Sem permissão pro ${what}. Libere no cadeado ao lado do endereço do site.`;
  if (name === 'NotFoundError') return `Nenhum ${what} encontrado.`;
  if (name === 'NotReadableError') return `O ${what} está sendo usado por outro programa.`;
  return `Não deu pra abrir o ${what}.`;
}

const stopAll = (s: MediaStream) => s.getTracks().forEach((t) => t.stop());

export function PreJoin({ code, prefs, setPrefs, onJoin, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState('');
  const [micError, setMicError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // O pedido de permissão do microfone é feito uma vez só aqui, pra não aparecer no meio da call.
  const micAsked = useRef(false);

  // Câmera: prévia ao vivo, fechada ao desligar ou sair da tela. Na primeira vez já pede o
  // microfone junto, pra que o navegador mostre um pedido de permissão só.
  useEffect(() => {
    if (!prefs.camOn) return;
    const withMic = prefs.micOn && !micAsked.current;
    if (withMic) micAsked.current = true;
    let stream: MediaStream | undefined;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: withMic })
      .then((s) => {
        // O microfone só precisava da permissão; quem captura de verdade é a call.
        s.getAudioTracks().forEach((t) => t.stop());
        if (cancelled) return stopAll(s);
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamError('');
        if (withMic) setMicError('');
      })
      .catch((err) => {
        if (withMic) micAsked.current = false;
        setCamError(mediaError(err, withMic ? 'microfone e câmera' : 'câmera'));
      });
    return () => {
      cancelled = true;
      if (stream) stopAll(stream);
    };
    // O estado do microfone só importa no primeiro pedido; mudar o mic não deve reabrir a câmera.
  }, [prefs.camOn]);

  // Microfone ligado sem a câmera (ou ligado depois): pede só a permissão do microfone.
  useEffect(() => {
    if (!prefs.micOn || micAsked.current) return;
    micAsked.current = true;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        stopAll(s);
        setMicError('');
      })
      .catch((err) => {
        micAsked.current = false;
        setMicError(mediaError(err, 'microfone'));
      });
  }, [prefs.micOn]);

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
            <video ref={videoRef} className="mirror" autoPlay muted playsInline />
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
          <button className="btn ghost" type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Voltar ao início
          </button>
          {!inApp && detectOs() && (
            <p className="open-in-app muted small">
              Tem o app? <a href={appLink(code)}>Abrir no app</a>
            </p>
          )}
          {camError && <p className="error">{camError}</p>}
          {micError && <p className="error">{micError}</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
