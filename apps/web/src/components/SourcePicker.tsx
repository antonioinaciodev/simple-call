import { AppWindow, Monitor, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

type AudioApp = { id: string; name: string };

// Seletor de tela ou janela do app desktop: só nomes, sem miniaturas, pra abrir na hora.
// Embaixo, de onde vem o áudio da transmissão.
export function SourcePicker({ prefs, setPrefs, onPick, onClose }: Props) {
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [error, setError] = useState(false);
  // undefined = ainda carregando; null = app antigo, sem áudio só do jogo.
  const [support, setSupport] = useState<DesktopAudioSupport | null | undefined>(desktop!.audioSupport ? undefined : null);
  const [apps, setApps] = useState<AudioApp[]>([]);
  // Linux: id do fluxo de áudio escolhido ('' = sem áudio).
  const [streamId, setStreamId] = useState('');

  const load = useCallback(() => {
    setError(false);
    desktop!.listSources().then(setSources, () => setError(true));
    desktop!.audioApps?.().then(setApps, () => {});
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    desktop!.audioSupport?.().then(setSupport, () => setSupport(null));
  }, []);

  // Pré-seleciona o último app usado (pelo nome) quando ele está tocando.
  useEffect(() => {
    if (streamId || !prefs.linuxAudioApp) return;
    const last = apps.find((a) => a.name === prefs.linuxAudioApp);
    if (last) setStreamId(last.id);
  }, [apps, prefs.linuxAudioApp, streamId]);

  const audio = (): DesktopAudioChoice | boolean => {
    // App desktop antigo (0.1): só o liga/desliga do áudio do PC inteiro.
    if (!desktop!.startAudio) return prefs.shareAudio && desktop!.platform === 'win32';
    if (support?.app || support?.system) return { mode: prefs.desktopAudio };
    if (support?.streams && streamId) return { mode: 'stream', streamId };
    return { mode: 'none' };
  };
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  // No Linux com Wayland o próprio sistema já perguntou e só volta a escolha feita.
  // (Com lista de apps de áudio, espera a pessoa escolher o áudio antes.)
  const autoPicked = useRef(false);
  useEffect(() => {
    if (sources?.length !== 1 || support === undefined || autoPicked.current || support?.streams) return;
    autoPicked.current = true;
    pickRef.current(sources[0], audioRef.current());
  }, [sources, support]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (s: DesktopSource) => {
    if (support?.streams) setPrefs({ linuxAudioApp: apps.find((a) => a.id === streamId)?.name ?? '' });
    onPick(s, audio());
  };

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
              <button key={s.id} className="source" onClick={() => pick(s)}>
                <Monitor size={16} />
                <span>{s.name}</span>
              </button>
            ))}
            {windows.length > 0 && <h3>Janelas</h3>}
            {windows.map((s) => (
              <button key={s.id} className="source" onClick={() => pick(s)} title={s.name}>
                <AppWindow size={16} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        )}
        {support && (
          <AudioSection support={support} prefs={prefs} setPrefs={setPrefs} apps={apps} streamId={streamId} setStreamId={setStreamId} />
        )}
      </div>
    </div>
  );
}

const WIN_OPTIONS = [
  { id: 'app', label: 'Só do jogo', hint: 'O som do programa da janela que você escolher, sem as vozes da call. Com tela inteira, vai o PC inteiro.' },
  { id: 'system', label: 'PC inteiro', hint: 'Tudo que toca no PC, menos a call.' },
  { id: 'none', label: 'Sem áudio', hint: 'Só a imagem.' },
] as const;

function AudioSection({
  support,
  prefs,
  setPrefs,
  apps,
  streamId,
  setStreamId,
}: {
  support: DesktopAudioSupport;
  prefs: Prefs;
  setPrefs: SetPrefs;
  apps: AudioApp[];
  streamId: string;
  setStreamId: (id: string) => void;
}) {
  if (support.app || support.system) {
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

  if (support.streams) {
    return (
      <div className="source-audio">
        <label className="field">
          <span>Áudio de qual app?</span>
          <select className="input" value={streamId} onChange={(e) => setStreamId(e.target.value)}>
            <option value="">Sem áudio</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <p className="option-hint">
          {apps.length
            ? 'Só o som desse app vai junto, sem as vozes da call.'
            : 'Nenhum app tocando som agora. Abra o jogo e clique em atualizar.'}
        </p>
      </div>
    );
  }

  return (
    <div className="source-audio">
      <p className="option-hint">
        {desktop!.platform === 'linux'
          ? 'Pra mandar o áudio de um app, instale o pulseaudio-utils (sudo apt install pulseaudio-utils) e abra o Simple Call de novo.'
          : 'O áudio do jogo não está disponível nesta instalação.'}
      </p>
    </div>
  );
}
