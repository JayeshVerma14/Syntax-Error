/**
 * How the picture answers the music. One pure mapping from the song at this
 * moment to adjusted layer settings, so the renderer draws a reacting frame
 * with the same code it draws a still one:
 *
 * - Beat pulse swells the units and the code and end text on each beat,
 *   brightens the idle field and flashes the CRT's band of light.
 * - Level drive lets bass swell the units and the swirl, mids thicken the
 *   idle field, and highs deepen the CRT scanlines.
 * - Beat burst fires the Burst section's explosion on each strong beat;
 *   Beat glitch spikes the Glitch section's tearing with each beat.
 */

import { SILENT_AUDIO, type AudioFrame } from "./engine-audio";
import type { BurstEvent } from "./engine-burst";
import type { CrtSettings } from "./engine-crt";
import type {
  BackdropSettings,
  EngineSettings,
  GlitchSettings,
  SwirlSettings,
} from "./engine-settings";

export type AudioReaction = Readonly<{
  backdrop: BackdropSettings;
  /** Bursts fired by beats, or undefined to keep the loop's own schedule. */
  burstEvents: readonly BurstEvent[] | undefined;
  crt: CrtSettings;
  glitch: GlitchSettings;
  /** Multiplier on unit size. */
  pump: number;
  swirl: SwirlSettings;
  /** Multiplier on the code roll and end text, about the frame centre. */
  textScale: number;
}>;

/** Beats weaker than this (after Sensitivity) do not fire a burst. */
const BURST_BEAT_STRENGTH = 0.35;
/** How long a beat's burst lasts at Burst Speed 100 %, in seconds. */
const BEAT_BURST_SECONDS = 1.2;

export function reactToAudio(
  settings: EngineSettings,
  audio: AudioFrame | undefined,
): AudioReaction {
  const on = settings.audio.enabled;
  const sound = on && audio ? audio : SILENT_AUDIO;
  const pulse = on ? settings.audio.pulse / 100 : 0;
  const drive = on ? settings.audio.levels / 100 : 0;
  const beat = sound.beat * pulse;

  const backdrop: BackdropSettings = {
    ...settings.backdrop,
    density: Math.min(100, settings.backdrop.density * (1 + drive * sound.mid * 0.6)),
    opacity: Math.min(100, settings.backdrop.opacity * (1 + beat * 0.6)),
  };

  let burstEvents: BurstEvent[] | undefined;
  if (on && settings.audio.burstOnBeat) {
    const life = (BEAT_BURST_SECONDS * 100) / Math.max(25, settings.burst.speed);
    burstEvents = sound.recentBeats
      .filter((hit) => hit.strength >= BURST_BEAT_STRENGTH && hit.ageSeconds < life)
      .map((hit) => ({ age: hit.ageSeconds / life, seed: hit.index }));
  }

  let glitch = settings.glitch;
  if (on && settings.audio.glitchOnBeat) {
    const latest = sound.recentBeats[sound.recentBeats.length - 1];
    glitch = {
      ...settings.glitch,
      amount: Math.max(settings.glitch.amount, 40) * sound.beat,
      enabled: sound.beat > 0.05,
      // A fresh tear pattern for every beat.
      seed: settings.glitch.seed + (latest ? latest.index * 17 : 0),
    };
  }

  return {
    backdrop,
    burstEvents,
    crt: {
      ...settings.crt,
      band: Math.min(100, settings.crt.band + beat * 60),
      strength: Math.min(100, settings.crt.strength * (1 + drive * sound.high)),
    },
    glitch,
    pump: 1 + beat * 0.6 + drive * sound.bass * 0.5,
    swirl: {
      ...settings.swirl,
      radius: settings.swirl.radius * (1 + drive * sound.bass * 0.4),
    },
    textScale: 1 + beat * 0.035,
  };
}
