import type { VideoCodec } from 'livekit-client';

export type AudioPresetId = 'voice-low' | 'voice' | 'voice-hd' | 'music' | 'music-hd';

export interface AudioQuality {
  id: AudioPresetId;
  label: string;
  kbps: number;
  stereo: boolean;
}

export const AUDIO_PRESETS: AudioQuality[] = [
  { id: 'voice-low', label: 'Voz econômica', kbps: 24, stereo: false },
  { id: 'voice', label: 'Voz', kbps: 32, stereo: false },
  { id: 'voice-hd', label: 'Voz HD', kbps: 48, stereo: false },
  { id: 'music', label: 'Música', kbps: 64, stereo: true },
  { id: 'music-hd', label: 'Música HD', kbps: 128, stereo: true },
];

export const audioPreset = (id: AudioPresetId) => AUDIO_PRESETS.find((p) => p.id === id) ?? AUDIO_PRESETS[1];

export const CODECS: { id: VideoCodec; label: string; hint: string }[] = [
  { id: 'h264', label: 'H.264', hint: 'Usa a GPU na maioria dos PCs. Recomendado.' },
  { id: 'vp9', label: 'VP9', hint: 'Comprime melhor, pesa mais na CPU.' },
  { id: 'av1', label: 'AV1', hint: 'Melhor qualidade por Mbps. Ideal com GPU recente.' },
  { id: 'vp8', label: 'VP8', hint: 'Compatível com tudo, menos eficiente.' },
];
