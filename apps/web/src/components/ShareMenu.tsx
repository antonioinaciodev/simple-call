import { AudioPresets, type LocalParticipant, type VideoCodec } from 'livekit-client';
import { useEffect, useRef } from 'react';
import type { SetPrefs } from '../App';
import type { Prefs } from '../lib/prefs';
import { SCREEN_PRESETS, type ScreenPreset } from '../lib/screen';

export function startScreenShare(lp: LocalParticipant, preset: ScreenPreset, withAudio: boolean, codec: VideoCodec) {
  const svc = codec === 'vp9' || codec === 'av1';
  return lp.setScreenShareEnabled(
    true,
    {
      // Áudio do jogo/sistema: sem cancelamento de eco nem supressão, que estragam música e efeitos.
      audio: withAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      systemAudio: withAudio ? 'include' : 'exclude',
      resolution: { width: preset.width, height: preset.height, frameRate: preset.fps },
      contentHint: preset.contentHint,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    },
    {
      videoCodec: codec,
      // VP9/AV1 usam SVC (camadas no mesmo fluxo); quem não decodifica recebe VP8 de reserva.
      backupCodec: svc,
      screenShareEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.fps },
      screenShareSimulcastLayers: preset.layers,
      degradationPreference: preset.contentHint === 'motion' ? 'maintain-framerate' : 'maintain-resolution',
      audioPreset: AudioPresets.musicHighQualityStereo,
      forceStereo: true,
      dtx: false,
    },
  );
}

// O que cada sistema deixa o navegador capturar de áudio junto com a tela.
const AUDIO_HINT = /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)
  ? 'No Linux o navegador só envia o áudio de uma aba do Chrome. Áudio do jogo vai precisar do app desktop.'
  : /Mac/.test(navigator.userAgent)
    ? 'No macOS o áudio do sistema precisa do Chrome 141+ e macOS 14.2+.'
    : 'No Windows o áudio do sistema só vai junto ao escolher "Tela inteira".';

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
      <label className="check">
        <input type="checkbox" checked={prefs.shareAudio} onChange={(e) => setPrefs({ shareAudio: e.target.checked })} />
        <span>Transmitir áudio do sistema</span>
      </label>
      <p className="option-hint">{AUDIO_HINT}</p>
      <button className="btn primary full" onClick={onStart}>
        Escolher tela ou janela
      </button>
    </div>
  );
}
