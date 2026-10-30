import type { AudioSettings, VideoCodec } from './mesh';
import { audioPreset, type AudioPresetId } from './presets';
import type { ScreenPresetId } from './screen';

export interface Prefs {
  name: string;
  micOn: boolean;
  camOn: boolean;
  audioPreset: AudioPresetId;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  dtx: boolean;
  screenPreset: ScreenPresetId;
  shareAudio: boolean;
  videoCodec: VideoCodec;
  theme: 'dark' | 'light';
  // Sons de entrar, sair e mutar; volume do áudio das transmissões (0 a 1).
  sounds: boolean;
  streamVolume: number;
  // Dispositivos escolhidos nos ajustes; vazio = padrão do sistema.
  micId: string;
  camId: string;
  speakerId: string;
}

export const DEFAULT_PREFS: Prefs = {
  name: '',
  micOn: true,
  camOn: false,
  audioPreset: 'voice',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  dtx: true,
  screenPreset: 'game',
  shareAudio: true,
  videoCodec: 'h264',
  theme: 'dark',
  sounds: true,
  streamVolume: 1,
  micId: '',
  camId: '',
  speakerId: '',
};

const KEY = 'simplecall:prefs';

// localStorage pode falhar (aba anônima, bloqueio de cookies): nesse caso só usamos os padrões.
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* sem persistência, tudo bem */
  }
}

export function micConstraints(p: Prefs): MediaTrackConstraints {
  return {
    deviceId: p.micId ? { exact: p.micId } : undefined,
    echoCancellation: p.echoCancellation,
    noiseSuppression: p.noiseSuppression,
    autoGainControl: p.autoGainControl,
    channelCount: audioPreset(p.audioPreset).stereo ? 2 : 1,
  };
}

export function cameraConstraints(p: Prefs): MediaTrackConstraints {
  return {
    deviceId: p.camId ? { exact: p.camId } : undefined,
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  };
}

export function audioSettings(p: Prefs): AudioSettings {
  return { maxBitrate: audioPreset(p.audioPreset).kbps * 1000, dtx: p.dtx };
}
