import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SetPrefs } from '../App';
import { mobilePlatform, withCallAudio, type AudioOutput, type AudioOutputId } from '../lib/native';
import type { Prefs } from '../lib/prefs';
import { AUDIO_PRESETS, CODECS } from '../lib/presets';
import type { MediaActions } from './Call';

interface Props {
  prefs: Prefs;
  setPrefs: SetPrefs;
  actions: MediaActions;
  onClose: () => void;
}

function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => navigator.mediaDevices.enumerateDevices().then(setDevices, () => {});
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);
  return devices;
}

function DeviceSelect({
  devices,
  kind,
  label,
  value,
  onChange,
}: {
  devices: MediaDeviceInfo[];
  kind: MediaDeviceKind;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const list = devices.filter((d) => d.kind === kind && d.deviceId);
  if (list.length === 0) return null;
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={list.some((d) => d.deviceId === value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Padrão do sistema</option>
        {list.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || 'Dispositivo sem nome'}
          </option>
        ))}
      </select>
    </label>
  );
}

// Saída do som no app do celular: alto-falante, ouvido (como numa ligação) ou fone.
function MobileOutputSelect({ value, onChange }: { value: AudioOutputId | ''; onChange: (id: AudioOutputId) => void }) {
  const [outputs, setOutputs] = useState<AudioOutput[]>([]);
  const [current, setCurrent] = useState<AudioOutputId | null>(null);
  useEffect(() => {
    let alive = true;
    let remove: (() => Promise<void>) | undefined;
    void withCallAudio(async (plugin) => {
      const load = () =>
        plugin.getOutputs().then((r) => {
          if (!alive) return;
          setOutputs(r.outputs);
          setCurrent(r.current);
        });
      await load();
      const handle = await plugin.addListener('outputsChanged', () => void load().catch(() => {}));
      if (alive) remove = () => handle.remove();
      else await handle.remove();
    }).catch(() => {});
    return () => {
      alive = false;
      void remove?.();
    };
  }, []);
  if (outputs.length < 2) return null;
  const selected = outputs.some((o) => o.id === value) ? value : (current ?? '');
  return (
    <label className="field">
      <span>Saída de áudio</span>
      <select
        className="input"
        value={selected}
        onChange={(e) => {
          const id = e.target.value as AudioOutputId;
          setCurrent(id);
          onChange(id);
        }}
      >
        {outputs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
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

export function Settings({ prefs, setPrefs, actions, onClose }: Props) {
  const devices = useDevices();
  const [applying, setApplying] = useState(false);

  async function update(patch: Partial<Prefs>, recapture: 'mic' | 'camera' | 'none' = 'none') {
    setPrefs(patch);
    setApplying(true);
    await actions.applyPrefs({ ...prefs, ...patch }, recapture);
    setApplying(false);
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
          <DeviceSelect devices={devices} kind="audioinput" label="Microfone" value={prefs.micId} onChange={(id) => update({ micId: id }, 'mic')} />
          {mobilePlatform ? (
            <MobileOutputSelect
              value={prefs.mobileOutput}
              onChange={(id) => {
                setPrefs({ mobileOutput: id });
                void withCallAudio((p) => p.setOutput({ id })).catch(() => {});
              }}
            />
          ) : (
            <DeviceSelect devices={devices} kind="audiooutput" label="Saída de áudio" value={prefs.speakerId} onChange={(id) => setPrefs({ speakerId: id })} />
          )}
          <DeviceSelect devices={devices} kind="videoinput" label="Câmera" value={prefs.camId} onChange={(id) => update({ camId: id }, 'camera')} />
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
                  onChange={() => update({ audioPreset: q.id }, 'mic')}
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
            onChange={(v) => update({ echoCancellation: v }, 'mic')}
          />
          <Toggle
            label="Supressão de ruído"
            hint="Corta ventilador, teclado e barulho de fundo."
            checked={prefs.noiseSuppression}
            onChange={(v) => update({ noiseSuppression: v }, 'mic')}
          />
          <Toggle
            label="Ganho automático"
            hint="Ajusta o volume do mic sozinho."
            checked={prefs.autoGainControl}
            onChange={(v) => update({ autoGainControl: v }, 'mic')}
          />
          <Toggle
            label="DTX"
            hint="Não envia nada enquanto você está em silêncio. Economiza banda."
            checked={prefs.dtx}
            onChange={(v) => update({ dtx: v })}
          />
        </section>

        <section>
          <h3>Codec da transmissão</h3>
          <div className="options">
            {CODECS.map((c) => (
              <label key={c.id} className={`option ${prefs.screenCodec === c.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="codec"
                  checked={prefs.screenCodec === c.id}
                  onChange={() => update({ screenCodec: c.id })}
                />
                <span className="option-main">{c.label}</span>
                <span className="option-hint">{c.hint}</span>
              </label>
            ))}
          </div>
          <p className="option-hint">Vale na próxima vez que você transmitir.</p>
        </section>

        <section>
          <h3>Sons</h3>
          <Toggle
            label="Sons da call"
            hint="Quando alguém entra, sai, muta ou desliga o som. E quando você muta."
            checked={prefs.sounds}
            onChange={(v) => setPrefs({ sounds: v })}
          />
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
