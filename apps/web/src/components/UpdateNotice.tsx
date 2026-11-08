import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { findUpdate, installUpdate, type Update } from '../lib/update';

type State =
  | { kind: 'idle' }
  | { kind: 'downloading'; pct: number }
  | { kind: 'installing' }
  | { kind: 'permission' }
  | { kind: 'error' };

// "Atualização disponível" nos apps, discreto no canto de baixo. No navegador nunca aparece.
export function UpdateNotice() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    let live = true;
    void findUpdate().then((u) => live && setUpdate(u));
    return () => {
      live = false;
    };
  }, []);

  if (!update) return null;

  async function run(u: Update) {
    setState({ kind: 'downloading', pct: 0 });
    try {
      const r = await installUpdate(u, (pct) => setState({ kind: 'downloading', pct }));
      setState(r === 'permission' ? { kind: 'permission' } : r === 'opened' ? { kind: 'idle' } : { kind: 'installing' });
    } catch {
      setState({ kind: 'error' });
    }
  }

  const busy = state.kind === 'downloading' || state.kind === 'installing';
  const text =
    state.kind === 'downloading'
      ? `Baixando a versão ${update.version}… ${state.pct}%`
      : state.kind === 'installing'
        ? 'Instalando. O app abre de novo sozinho.'
        : state.kind === 'permission'
          ? 'Permita instalar apps do Simple Call e toque em Atualizar de novo.'
          : state.kind === 'error'
            ? 'Não deu pra atualizar agora.'
            : `Versão ${update.version} disponível.`;

  return (
    <div className="update-notice" role="status">
      <Download size={16} aria-hidden />
      <span>{text}</span>
      {state.kind === 'error' ? (
        <a className="btn small" href={update.download} target="_blank" rel="noreferrer">
          Baixar
        </a>
      ) : (
        !busy && (
          <button className="btn small primary" onClick={() => void run(update)}>
            Atualizar
          </button>
        )
      )}
      {state.kind === 'downloading' && <span className="update-bar" style={{ transform: `scaleX(${state.pct / 100})` }} />}
    </div>
  );
}
