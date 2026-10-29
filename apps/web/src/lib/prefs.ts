import type { AudioCaptureOptions, TrackPublishOptions, VideoCodec } from 'livekit-client';
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
  red: boolean;
  screenPreset: ScreenPresetId;
  shareAudio: boolean;
  videoCodec: VideoCodec;
  theme: 'dark' | 'light';
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
  red: true,
  screenPreset: 'game',
  shareAudio: true,
  videoCodec: 'h264',
  theme: 'dark',
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

export function audioCapture(p: Prefs): AudioCaptureOptions {
  return {
    echoCancellation: p.echoCancellation,
    noiseSuppression: p.noiseSuppression,
    autoGainControl: p.autoGainControl,
    channelCount: audioPreset(p.audioPreset).stereo ? 2 : 1,
  };
}

export function audioPublish(p: Prefs): TrackPublishOptions {
  const q = audioPreset(p.audioPreset);
  return {
    audioPreset: { maxBitrate: q.kbps * 1000 },
    forceStereo: q.stereo,
    dtx: p.dtx,
    red: p.red,
  };
}
