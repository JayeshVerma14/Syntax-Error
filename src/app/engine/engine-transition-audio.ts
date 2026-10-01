/**
 * How the transition fillers answer the music.
 *
 * While a filler is on screen, a beat hits it: the dark flashes its faint
 * grid and a flurry of glints, the hot pixels, beams and edges flare, a burst
 * of hot squares lights the mosaic and the grid, and the torn picture jumps
 * further. The bass swells the light, so the bloom and the scan beam grow
 * brighter and spread further. The highs sparkle the glints and the grain, and
 * the mids breathe the grid.
 *
 * The Beats placement fires a filler on every strong beat. Nothing is cut
 * under it, so it dips the shot rather than blacking it out: the hit flares
 * in over a couple of frames, the dark goes deeper the more the beat clears
 * the threshold, and the filler uncovers fast at first and settles, with a
 * fresh pattern every beat.
 *
 * Silence (SILENT_PULSE) is the identity: every lift is exactly 0, so a filler
 * drawn with it is pixel-identical to one drawn without music.
 */

import type { AudioPulse } from "./engine-audio-pulse";
import { clamp01, easeOutCubic, passShare } from "./engine-transition-kit";

/** The music as the fillers see it; every value 0..1. */
export type TransitionDrive = Readonly<{
  /** The latest beat's envelope. */
  beat: number;
  /** Differs per beat, so each beat lights its own pattern. */
  beatSeed: number;
  bass: number;
  high: number;
  mid: number;
}>;

export const STILL_DRIVE: TransitionDrive = { beat: 0, beatSeed: 0, bass: 0, high: 0, mid: 0 };

const level = (value: number) => (value > 0 ? Math.min(1, value) : 0);

export function driveOf(pulse: AudioPulse): TransitionDrive {
  const beat = Number.isFinite(pulse.beatAge) ? level(pulse.beat) : 0;
  return {
    beat,
    beatSeed: beat > 0 ? Math.max(0, Math.floor(pulse.beatIndex)) % 4093 : 0,
    bass: level(pulse.bass),
    high: level(pulse.high),
    mid: level(pulse.mid),
  };
}

/** Where a beat-fired filler is, or null when no strong beat is playing out. */
export type BeatFiller = Readonly<{
  /** 0..1: how dark the cover gets, times the Cover control. */
  cover: number;
  /** Seconds since the beat; flicker runs on this clock. */
  seconds: number;
  seed: number;
  /** 0..1 through the filler; the beat lands just before the cut at 0.5. */
  u: number;
}>;

/** Seconds a beat filler takes to flare in on the hit: about two frames. */
export const BEAT_ATTACK_SECONDS = 0.05;

/** Beat fillers settle open: fast at first. */
const settle = (t: number) => 1 - (1 - t) * (1 - t);

/**
 * The beat-fired filler: the latest beat, if it is at least `threshold`
 * strong (0..1). On the hit it runs the second half of the covering pass in
 * BEAT_ATTACK_SECONDS, then the uncovering half of a filler `duration` long;
 * `hold` is the Hold share. The cover dips to half dark for a beat just over
 * the threshold and to 80% for the strongest.
 */
export function beatFiller(pulse: AudioPulse, duration: number, threshold: number, hold: number): BeatFiller | null {
  if (pulse.beatIndex < 0 || !(pulse.beatAge >= 0) || !(pulse.beatStrength >= threshold)) return null;
  const age = pulse.beatAge;
  const reveal = duration / 2;
  if (!(age < BEAT_ATTACK_SECONDS + reveal)) return null;
  const from = passShare(hold) / 2;
  const u =
    age < BEAT_ATTACK_SECONDS
      ? from + (0.5 - from) * easeOutCubic(age / BEAT_ATTACK_SECONDS)
      : 0.5 + 0.5 * settle((age - BEAT_ATTACK_SECONDS) / reveal);
  const excess = threshold < 1 ? clamp01((pulse.beatStrength - threshold) / (1 - threshold)) : 1;
  const index = Math.floor(pulse.beatIndex);
  return { cover: 0.5 + 0.3 * excess, seconds: age, seed: (index * 7919 + 4099) % 9973, u };
}
