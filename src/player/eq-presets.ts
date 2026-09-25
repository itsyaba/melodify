import type { EqPreset } from '@/prefs';

/**
 * Built-in equalizer presets, one gain per band (31 Hz to 16 kHz), in dB. Modest curves on
 * purpose: boosts clip without a matching cut in the pre-amp, so none reaches the ±12 dB limit.
 */
export const EQ_PRESETS: readonly EqPreset[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preampDb: 0 },
  { name: 'Bass boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0], preampDb: -4 },
  { name: 'Bass reducer', gains: [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0], preampDb: 0 },
  { name: 'Treble boost', gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6], preampDb: -4 },
  { name: 'Treble reducer', gains: [0, 0, 0, 0, 0, -1, -2, -4, -5, -6], preampDb: 0 },
  { name: 'Rock', gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5], preampDb: -4 },
  { name: 'Pop', gains: [-1, 1, 3, 4, 3, 1, 0, -1, -1, -1], preampDb: -3 },
  { name: 'Jazz', gains: [4, 3, 1, 2, -2, -2, 0, 1, 3, 4], preampDb: -3 },
  { name: 'Classical', gains: [5, 4, 3, 2, -1, -1, 0, 2, 3, 4], preampDb: -4 },
  { name: 'Hip-hop', gains: [5, 4, 1, 3, -1, -1, 1, -1, 2, 3], preampDb: -4 },
  { name: 'Electronic', gains: [4, 3, 1, 0, -2, 2, 1, 1, 4, 5], preampDb: -4 },
  { name: 'Vocal', gains: [-2, -3, -3, 1, 4, 4, 3, 1, 0, -2], preampDb: -3 },
  { name: 'Acoustic', gains: [4, 4, 3, 1, 2, 1, 3, 3, 3, 2], preampDb: -3 },
  { name: 'Small speakers', gains: [5, 4, 3, 2, 1, 0, -1, -2, -3, -4], preampDb: -4 },
];

/** Band labels for the sliders. */
export const EQ_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'] as const;

/** The preset these exact gains and pre-amp came from, if any: built-in first, then the user's. */
export function presetMatching(gains: number[], preampDb: number, custom: readonly EqPreset[]): EqPreset | null {
  return (
    [...EQ_PRESETS, ...custom].find(
      (p) => p.preampDb === preampDb && p.gains.length === gains.length && p.gains.every((g, i) => g === gains[i]),
    ) ?? null
  );
}
