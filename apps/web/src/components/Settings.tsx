import { useMediaDeviceSelect, useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { X } from 'lucide-react';
import { useState } from 'react';
import type { SetPrefs } from '../App';
import { audioCapture, audioPublish, type Prefs } from '../lib/prefs';
import { AUDIO_PRESETS, CODECS } from '../lib/presets';

interface Props {
  prefs: Prefs;
  setPrefs: SetPrefs;
  onClose: () => void;
}

function DeviceSelect({ kind, label }: { kind: MediaDeviceKind; label: string }) {
  const room = useRoomContext();
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, room });
  if (devices.length === 0) return null;
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={activeDeviceId} onChange={(e) => setActiveMediaDevice(e.target.value)}>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || 'Dispositivo sem nome'}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        <small>{hint}</small>
      </span>
    </label>
  );
}

export function Settings({ prefs, setPrefs, onClose }: Props) {
  const room = useRoomContext();
  const [applying, setApplying] = useState(false);

  // Bitrate e processamento do áudio são definidos na publicação da faixa,
  // então pra mudar com o mic ligado a gente republica o microfone (leva ~1 s).
  async function updateAudio(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(patch);
    const lp = room.localParticipant;
    const pub = lp.getTrackPublication(Track.Source.Microphone);
    if (!pub?.track) return;
    const wasOn = lp.isMicrophoneEnabled;
    setApplying(true);
    try {
      await lp.unpublishTrack(pub.track);
      if (wasOn) await lp.setMicrophoneEnabled(true, audioCapture(next), audioPublish(next));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="panel-inner">
      <div className="panel-head">
        <h2>Ajustes</h2>
        <button className="icon-btn small ghost" onClick={onClose} aria-label="Fechar ajustes">
          <X size={16} />
        </button>
      </div>
      <div className="settings">
        <section>
          <h3>Dispositivos</h3>
          <DeviceSelect kind="audioinput" label="Microfone" />
          <DeviceSelect kind="audiooutput" label="Saída de áudio" />
          <DeviceSelect kind="videoinput" label="Câmera" />
        </section>

        <section>
          <h3>Qualidade do seu áudio {applying && <span className="muted small">aplicando…</span>}</h3>
          <div className="options">
            {AUDIO_PRESETS.map((q) => (
              <label key={q.id} className={`option ${prefs.audioPreset === q.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="audio-preset"
                  checked={prefs.audioPreset === q.id}
                  onChange={() => updateAudio({ audioPreset: q.id })}
                />
                <span className="option-main">{q.label}</span>
                <span className="option-hint">
                  {q.kbps} kbps{q.stereo ? ' · estéreo' : ''}
                </span>
              </label>
            ))}
          </div>
          <Toggle
            label="Cancelamento de eco"
            hint="Desligue se usa fone e quer o som mais natural."
            checked={prefs.echoCancellation}
            onChange={(v) => updateAudio({ echoCancellation: v })}
          />
          <Toggle
            label="Supressão de ruído"
            hint="Corta ventilador, teclado e barulho de fundo."
            checked={prefs.noiseSuppression}
            onChange={(v) => updateAudio({ noiseSuppression: v })}
          />
          <Toggle
            label="Ganho automático"
            hint="Ajusta o volume do mic sozinho."
            checked={prefs.autoGainControl}
            onChange={(v) => updateAudio({ autoGainControl: v })}
          />
          <Toggle
            label="DTX"
            hint="Não envia nada enquanto você está em silêncio. Economiza banda."
            checked={prefs.dtx}
            onChange={(v) => updateAudio({ dtx: v })}
          />
          <Toggle
            label="RED"
            hint="Manda áudio redundante pra aguentar perda de pacote."
            checked={prefs.red}
            onChange={(v) => updateAudio({ red: v })}
          />
        </section>

        <section>
          <h3>Codec da transmissão</h3>
          <div className="options">
            {CODECS.map((c) => (
              <label key={c.id} className={`option ${prefs.videoCodec === c.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="codec"
                  checked={prefs.videoCodec === c.id}
                  onChange={() => setPrefs({ videoCodec: c.id })}
                />
                <span className="option-main">{c.label}</span>
                <span className="option-hint">{c.hint}</span>
              </label>
            ))}
          </div>
          <p className="option-hint">Vale na próxima vez que você transmitir.</p>
        </section>

        <section>
          <h3>Tema</h3>
          <div className="segmented">
            <button className={prefs.theme === 'dark' ? 'selected' : ''} onClick={() => setPrefs({ theme: 'dark' })}>
              Escuro
            </button>
            <button className={prefs.theme === 'light' ? 'selected' : ''} onClick={() => setPrefs({ theme: 'light' })}>
              Claro
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
