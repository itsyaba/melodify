import { getPrefs, subscribePrefs, type Prefs } from '@/prefs';
import type { EqualizerSettings, TransitionSettings } from './engine';
import { engine } from './index';

/**
 * Keeps the engine's speed, pitch, equalizer, transitions and volume in step with the
 * preferences. Only what changed crosses the bridge. The sound screen previews a slider being
 * dragged through `previewSound` and saves on release, which comes back through here.
 */

interface Applied {
  rate: number;
  pitch: number;
  eq: string;
  transition: string;
  volume: number;
}

let applied: Applied | null = null;
/** The sleep timer's fade, multiplied into the user's volume. */
let fadeLevel = 1;

function run(op: Promise<unknown>) {
  void op.catch((err: unknown) => console.warn('[melodify] sound setting failed:', err));
}

export function effectivePitch(p: Pick<Prefs, 'pitchFollowsSpeed' | 'pitchSemitones' | 'playbackRate'>): number {
  return p.pitchFollowsSpeed ? 12 * Math.log2(p.playbackRate) : p.pitchSemitones;
}

function equalizerOf(p: Prefs): EqualizerSettings {
  const { enabled, preampDb, gains, bassBoost } = p.equalizer;
  return { enabled, preampDb, gains, bassBoost };
}

function transitionOf(p: Prefs): TransitionSettings {
  return { crossfadeMs: p.crossfadeMs, gapless: p.gapless };
}

function apply(p: Prefs, force = false) {
  const next: Applied = {
    rate: p.playbackRate,
    pitch: effectivePitch(p),
    eq: JSON.stringify(equalizerOf(p)),
    transition: JSON.stringify(transitionOf(p)),
    volume: p.volume * fadeLevel,
  };
  const was = force ? null : applied;
  if (next.rate !== was?.rate) run(engine.setRate(next.rate));
  if (next.pitch !== was?.pitch) run(engine.setPitch(next.pitch));
  if (next.eq !== was?.eq) run(engine.setEqualizer(equalizerOf(p)));
  if (next.transition !== was?.transition) run(engine.setTransition(transitionOf(p)));
  if (next.volume !== was?.volume) run(engine.setVolume(next.volume));
  applied = next;
}

/** Applies a change that has not been saved yet, such as a slider mid-drag. */
export function previewSound(patch: Partial<Prefs>): void {
  apply({ ...getPrefs(), ...patch });
}

/** 1 is full; the sleep timer lowers it as it runs out. */
export function setFadeLevel(level: number): void {
  fadeLevel = Math.min(1, Math.max(0, level));
  apply(getPrefs());
}

/** Once at launch, after the preferences are loaded and before the queue loads a track. */
export function startSound(): void {
  apply(getPrefs(), true);
  subscribePrefs(() => apply(getPrefs()));
}
