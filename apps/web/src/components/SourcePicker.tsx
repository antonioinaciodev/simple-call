import { AppWindow, Monitor, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { SetPrefs } from '../App';
import { desktop, type DesktopAudioChoice, type DesktopAudioSupport, type DesktopSource } from '../lib/native';
import type { Prefs } from '../lib/prefs';

interface Props {
  prefs: Prefs;
  setPrefs: SetPrefs;
  // audio: escolha do áudio só do jogo; true/false no app desktop antigo (áudio do PC inteiro).
  onPick: (source: DesktopSource, audio: DesktopAudioChoice | boolean) => void;
  onClose: () => void;
}

// Seletor de tela ou janela do app desktop. Abre na hora só com os nomes; as miniaturas
// (mais lentas de tirar) chegam logo depois, nas versões do app que têm.
// Embaixo, de onde vem o áudio da transmissão.
export function SourcePicker({ prefs, setPrefs, onPick, onClose }: Props) {
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [error, setError] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const withThumbs = !!desktop!.listThumbnails;
  // undefined = ainda carregando; null = app antigo, sem áudio só do jogo.
  const [support, setSupport] = useState<DesktopAudioSupport | null | undefined>(desktop!.audioSupport ? undefined : null);

  const load = useCallback(() => {
    let live = true;
    setError(false);
    desktop!
      .listSources()
      .then((list) => {
        if (!live) return;
        setSources(list);
        desktop!.listThumbnails?.().then((t) => live && setThumbs(t), () => {});
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    desktop!.audioSupport?.().then(setSupport, () => setSupport(null));
  }, []);

  const audio = (): DesktopAudioChoice | boolean => {
    // App desktop antigo (0.1): só o liga/desliga do áudio do PC inteiro.
    if (!desktop!.startAudio) return prefs.shareAudio && desktop!.platform === 'win32';
    if (support?.app || support?.system) return { mode: prefs.desktopAudio };
    return { mode: 'none' };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (s: DesktopSource) => onPick(s, audio());

  const screens = sources?.filter((s) => s.kind === 'screen') ?? [];
  const windows = sources?.filter((s) => s.kind === 'window') ?? [];

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal source-picker ${withThumbs ? 'with-thumbs' : ''}`} role="dialog" aria-label="Escolher o que transmitir">
        <div className="panel-head">
          <h2>O que transmitir?</h2>
          <div className="panel-head-actions">
            <button className="icon-btn small ghost" onClick={() => void load()} title="Atualizar a lista" aria-label="Atualizar a lista">
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
            <div className="source-group">
              {screens.map((s) => (
                <Source key={s.id} source={s} thumb={withThumbs ? (thumbs[s.id] ?? '') : null} onPick={pick} />
              ))}
            </div>
            {windows.length > 0 && <h3>Janelas</h3>}
            <div className="source-group">
              {windows.map((s) => (
                <Source key={s.id} source={s} thumb={withThumbs ? (thumbs[s.id] ?? '') : null} onPick={pick} />
              ))}
            </div>
          </div>
        )}
        {support && (
<AudioSection support={support} prefs={prefs} setPrefs={setPrefs} />
        )}
      </div>
    </div>
  );
}

// thumb: null = app sem miniaturas; '' = ainda chegando.
function Source({ source, thumb, onPick }: { source: DesktopSource; thumb: string | null; onPick: (s: DesktopSource) => void }) {
  const Icon = source.kind === 'screen' ? Monitor : AppWindow;
  return (
    <button className="source" onClick={() => onPick(source)} title={source.name}>
      {thumb !== null && <span className="source-thumb">{thumb && <img src={thumb} alt="" draggable={false} />}</span>}
      <span className="source-name">
        <Icon size={16} />
        <span>{source.name}</span>
      </span>
    </button>
  );
}

const WIN_OPTIONS = [
  { id: 'app', label: 'Só do jogo', hint: 'O som do programa da janela que você escolher, sem as vozes da call. Com tela inteira, vai o PC inteiro.' },
  { id: 'system', label: 'PC inteiro', hint: 'Tudo que toca no PC, menos a call.' },
  { id: 'none', label: 'Sem áudio', hint: 'Só a imagem.' },
] as const;

function AudioSection({ support, prefs, setPrefs }: { support: DesktopAudioSupport; prefs: Prefs; setPrefs: SetPrefs }) {
  if (!support.app && !support.system) {
    return (
      <div className="source-audio">
        <p className="option-hint">O áudio do jogo não está disponível nesta instalação.</p>
      </div>
    );
  }
  const current = WIN_OPTIONS.find((o) => o.id === prefs.desktopAudio) ?? WIN_OPTIONS[0];
  return (
    <div className="source-audio">
      <h3>Áudio</h3>
      <div className="segmented">
        {WIN_OPTIONS.map((o) => (
          <button key={o.id} className={current.id === o.id ? 'selected' : ''} onClick={() => setPrefs({ desktopAudio: o.id })}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="option-hint">{current.hint}</p>
    </div>
  );
}
