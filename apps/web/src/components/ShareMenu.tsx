import { useEffect, useRef } from 'react';
import type { SetPrefs } from '../App';
import type { Prefs } from '../lib/prefs';
import { desktop } from '../lib/native';
import { SCREEN_PRESETS } from '../lib/screen';

// O que cada sistema deixa capturar de áudio junto com a tela.
const AUDIO_HINT =
  desktop?.platform === 'win32'
    ? 'O app manda o áudio de tudo que toca no PC, com qualquer tela ou janela. As vozes da call vão junto, então os amigos podem ouvir um eco da própria voz.'
    : desktop
      ? ''
      : /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)
        ? 'No Linux o navegador só envia o áudio de uma aba do Chrome. Áudio do jogo vai precisar do app desktop.'
        : /Mac/.test(navigator.userAgent)
          ? 'No macOS o áudio do sistema precisa do Chrome 141+ e macOS 14.2+.'
          : 'No Windows o áudio do sistema só vai junto ao escolher "Tela inteira".';

// No app desktop do Linux ainda não tem como pegar o áudio do jogo.
const CAN_SHARE_AUDIO = !desktop || desktop.platform === 'win32';

interface Props {
  prefs: Prefs;
  setPrefs: SetPrefs;
  onStart: () => void;
  onClose: () => void;
}

export function ShareMenu({ prefs, setPrefs, onStart, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    addEventListener('pointerdown', onDown);
    return () => removeEventListener('pointerdown', onDown);
  }, [onClose]);

  return (
    <div className="popover share-menu" ref={ref} role="dialog" aria-label="Transmitir tela">
      <p className="popover-title">Qualidade da transmissão</p>
      <div className="options">
        {SCREEN_PRESETS.map((p) => (
          <label key={p.id} className={`option ${prefs.screenPreset === p.id ? 'selected' : ''}`}>
            <input
              type="radio"
              name="screen-preset"
              checked={prefs.screenPreset === p.id}
              onChange={() => setPrefs({ screenPreset: p.id })}
            />
            <span className="option-main">{p.label}</span>
            <span className="option-hint">{p.hint}</span>
          </label>
        ))}
      </div>
      {CAN_SHARE_AUDIO ? (
        <>
          <label className="check">
            <input type="checkbox" checked={prefs.shareAudio} onChange={(e) => setPrefs({ shareAudio: e.target.checked })} />
            <span>Transmitir áudio {desktop ? 'do PC' : 'do sistema'}</span>
          </label>
          <p className="option-hint">{AUDIO_HINT}</p>
        </>
      ) : (
        <p className="option-hint">O áudio do jogo no Linux ainda não vai junto. Vem numa próxima versão do app.</p>
      )}
      <button className="btn primary full" onClick={onStart}>
        Escolher tela ou janela
      </button>
    </div>
  );
}
