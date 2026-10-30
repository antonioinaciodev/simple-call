export type ScreenPresetId = 'game-high' | 'game' | 'sharp' | 'light';

export interface ScreenPreset {
  id: ScreenPresetId;
  label: string;
  hint: string;
  width: number;
  height: number;
  fps: number;
  // Por pessoa assistindo: no P2P quem transmite manda uma cópia pra cada um.
  maxBitrate: number;
  // "motion" segura o FPS quando a rede aperta; "detail" segura a nitidez.
  contentHint: 'motion' | 'detail';
}

export const SCREEN_PRESETS: ScreenPreset[] = [
  {
    id: 'game-high',
    label: '1080p · 60 fps',
    hint: 'Jogo, internet boa (até 8 Mbps por pessoa)',
    width: 1920,
    height: 1080,
    fps: 60,
    maxBitrate: 8_000_000,
    contentHint: 'motion',
  },
  {
    id: 'game',
    label: '720p · 60 fps',
    hint: 'Jogo, recomendado (até 4,5 Mbps por pessoa)',
    width: 1280,
    height: 720,
    fps: 60,
    maxBitrate: 4_500_000,
    contentHint: 'motion',
  },
  {
    id: 'sharp',
    label: '1080p · 30 fps',
    hint: 'Texto, código, slides',
    width: 1920,
    height: 1080,
    fps: 30,
    maxBitrate: 5_000_000,
    contentHint: 'detail',
  },
  {
    id: 'light',
    label: '720p · 30 fps',
    hint: 'Internet fraca',
    width: 1280,
    height: 720,
    fps: 30,
    maxBitrate: 2_500_000,
    contentHint: 'motion',
  },
];

export const screenPreset = (id: ScreenPresetId) => SCREEN_PRESETS.find((p) => p.id === id) ?? SCREEN_PRESETS[1];
