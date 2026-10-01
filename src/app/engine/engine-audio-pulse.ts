/**
 * The music at one frame, as the timed layers see it: how hard the latest beat
 * is still hitting, the three band levels, and which beat that was. Every
 * value is already scaled by the Audio section's strength controls, so a layer
 * only decides how it answers, never how much. Silence is all zeros, and a
 * layer drawn with it looks exactly as it does without music.
 */

export type AudioPulse = Readonly<{
  /** 0..1: bass level, scaled by Level drive. */
  bass: number;
  /** 0..1: the latest beat's envelope, scaled by Beat pulse; 1 on the hit. */
  beat: number;
  /** Seconds since the latest beat, or Infinity before the first. */
  beatAge: number;
  /** Index of the latest beat, for a fresh random pattern per beat; -1 before the first. */
  beatIndex: number;
  /** 0..1: strength of the latest beat, before Beat pulse. */
  beatStrength: number;
  /** 0..1: highs, scaled by Level drive. */
  high: number;
  /** 0..1: mids, scaled by Level drive. */
  mid: number;
}>;

export const SILENT_PULSE: AudioPulse = {
  bass: 0,
  beat: 0,
  beatAge: Number.POSITIVE_INFINITY,
  beatIndex: -1,
  beatStrength: 0,
  high: 0,
  mid: 0,
};
