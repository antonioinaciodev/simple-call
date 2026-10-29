import { ScreenSharePresets, type VideoPreset } from 'livekit-client';

export type ScreenPresetId = 'game-high' | 'game' | 'sharp' | 'light';

export interface ScreenPreset {
  id: ScreenPresetId;
  label: string;
  hint: string;
  width: number;
  height: number;
  fps: number;
  maxBitrate: number;
  // "motion" segura o FPS quando a rede aperta; "detail" segura a nitidez.
  contentHint: 'motion' | 'detail';
  // Camadas extras (simulcast) para quem tem internet pior. Só são enviadas se alguém precisar.
  layers: VideoPreset[];
}

export const SCREEN_PRESETS: ScreenPreset[] = [
  {
    id: 'game-high',
    label: '1080p · 60 fps',
    hint: 'Jogo, internet boa',
    width: 1920,
    height: 1080,
    fps: 60,
    maxBitrate: 6_000_000,
    contentHint: 'motion',
    layers: [ScreenSharePresets.h720fps30],
  },
  {
    id: 'game',
    label: '720p · 60 fps',
    hint: 'Jogo, recomendado',
    width: 1280,
    height: 720,
    fps: 60,
    maxBitrate: 3_500_000,
    contentHint: 'motion',
    layers: [ScreenSharePresets.h360fps15],
  },
  {
    id: 'sharp',
    label: '1080p · 30 fps',
    hint: 'Texto, código, slides',
    width: 1920,
    height: 1080,
    fps: 30,
    maxBitrate: 4_000_000,
    contentHint: 'detail',
    layers: [ScreenSharePresets.h720fps15],
  },
  {
    id: 'light',
    label: '720p · 30 fps',
    hint: 'Internet fraca',
    width: 1280,
    height: 720,
    fps: 30,
    maxBitrate: 1_500_000,
    contentHint: 'motion',
    layers: [],
  },
];

export const screenPreset = (id: ScreenPresetId) => SCREEN_PRESETS.find((p) => p.id === id) ?? SCREEN_PRESETS[1];
