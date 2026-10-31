import { AppWindow, Monitor, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { desktop, type DesktopSource } from '../lib/native';

interface Props {
  onPick: (source: DesktopSource) => void;
  onClose: () => void;
}

// Seletor de tela ou janela do app desktop: só nomes, sem miniaturas, pra abrir na hora.
export function SourcePicker({ onPick, onClose }: Props) {
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [error, setError] = useState(false);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const load = useCallback(() => {
    setError(false);
    desktop!
      .listSources()
      .then((list) => {
        // No Linux com Wayland o próprio sistema já perguntou e só volta a escolha feita.
        if (list.length === 1) pickRef.current(list[0]);
        else setSources(list);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const screens = sources?.filter((s) => s.kind === 'screen') ?? [];
  const windows = sources?.filter((s) => s.kind === 'window') ?? [];

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal source-picker" role="dialog" aria-label="Escolher o que transmitir">
        <div className="panel-head">
          <h2>O que transmitir?</h2>
          <div className="panel-head-actions">
            <button className="icon-btn small ghost" onClick={load} title="Atualizar a lista" aria-label="Atualizar a lista">
              <RefreshCw size={16} />
            </button>
            <button className="icon-btn small ghost" onClick={onClose} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
        </div>
        {error ? (
          <p className="muted">Não deu pra listar as janelas.</p>
        ) : !sources ? (
          <p className="muted">Procurando janelas…</p>
        ) : sources.length === 0 ? (
          <p className="muted">Nenhuma tela ou janela encontrada.</p>
        ) : (
          <div className="source-list">
            {screens.length > 0 && <h3>Telas</h3>}
            {screens.map((s) => (
              <button key={s.id} className="source" onClick={() => onPick(s)}>
                <Monitor size={16} />
                <span>{s.name}</span>
              </button>
            ))}
            {windows.length > 0 && <h3>Janelas</h3>}
            {windows.map((s) => (
              <button key={s.id} className="source" onClick={() => onPick(s)} title={s.name}>
                <AppWindow size={16} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
