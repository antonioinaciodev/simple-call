import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createRoom, parseRoomCode } from '../lib/api';
import { inApp } from '../lib/native';
import { UpdateNotice } from './UpdateNotice';

// Início do app: criar uma call ou entrar numa. No navegador fica em /app; a apresentação e os
// downloads ficam na página da raiz (Landing).
export function Home({ navigate }: { navigate: (to: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function newCall() {
    setBusy(true);
    setError('');
    try {
      navigate(`/${await createRoom()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a call.');
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const code = parseRoomCode(input);
    if (code) navigate(`/${code}`);
    else setError('Código inválido. Ele tem o formato abc-defg-hij.');
  }

  return (
    <div className="center-page">
      <div className="home">
        <div className="wordmark">
          <span className="dot" /> simplecall
        </div>
        <h1>Chamadas leves pra jogar e transmitir com os amigos.</h1>
        <p className="muted">Sem servidor, sem canal, sem conta. Cria a call, manda o link.</p>

        <div className="home-actions">
          <button className="btn primary" onClick={newCall} disabled={busy}>
            {busy ? 'Criando…' : 'Nova call'}
          </button>
          <form className="join" onSubmit={join}>
            <input
              className="input"
              placeholder="Código ou link"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              aria-label="Código ou link da call"
            />
            <button className="btn" type="submit" disabled={!input.trim()}>
              Entrar
            </button>
          </form>
        </div>
        {error && <p className="error">{error}</p>}

        {!inApp && (
          <p className="home-back muted small">
            <a
              href="/"
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                navigate('/');
              }}
            >
              <ArrowLeft size={14} /> Sobre o Simple Call e downloads
            </a>
          </p>
        )}
      </div>
      <UpdateNotice />
    </div>
  );
}
