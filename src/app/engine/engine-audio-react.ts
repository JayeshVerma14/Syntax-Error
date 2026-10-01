/**
 * How the picture answers the music. One pure mapping from the song at this
 * moment to adjusted layer settings, so the renderer draws a reacting frame
 * with the same code it draws a still one:
 *
 * - Beat pulse swells the units and the code and end text on each beat,
 *   boxes a burst of the brightest cells, jolts the unit motion, brightens
 *   and swells the idle field, pops the text bars and flashes the CRT's band
 *   of light. The logo, data text and transitions get the same beat.
 * - Level drive lets bass swell the units, the swirl and the field's
 *   particles and boil the grain, mids thicken the idle field, and highs
 *   deepen the CRT scanlines.
 * - Beat zoom punches the whole picture in on each beat; Beat shake jolts it
 *   on strong beats; Beat flash strobes it white on strong beats.
 * - Beat burst fires the Burst section's explosion on each strong beat;
 *   Beat glitch spikes the Glitch section's tearing with each beat.
 */

import { SILENT_AUDIO, type AudioFrame } from "./engine-audio";
import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import type { BurstEvent } from "./engine-burst";
import type { CrtSettings } from "./engine-crt";
import type { MotionSettings } from "./engine-motion";
import type {
  BackdropSettings,
  EngineSettings,
  GlitchSettings,
  SwirlSettings,
} from "./engine-settings";

/** A move of the whole picture: a punch in, a shake, and a white flash. */
export type FrameHit = Readonly<{
  /** 0..1: white laid over the finished frame. */
  flash: number;
  /** Offsets as a share of the frame width. */
  shakeX: number;
  shakeY: number;
  /** Multiplier on the whole picture, about the frame centre. */
  zoom: number;
}>;

export const STILL_FRAME: FrameHit = { flash: 0, shakeX: 0, shakeY: 0, zoom: 1 };

export type AudioReaction = Readonly<{
  backdrop: BackdropSettings;
  /** Bursts fired by beats, or undefined to keep the loop's own schedule. */
  burstEvents: readonly BurstEvent[] | undefined;
  crt: CrtSettings;
  hit: FrameHit;
  glitch: GlitchSettings;
  /** 0..100: share of bright cells boxed. */
  knockout: number;
  motion: MotionSettings;
  /** The music as the timed layers see it. */
  pulse: AudioPulse;
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
/** Beats this strong or more shake and flash the picture. */
const HARD_BEAT = 0.55;
/** How long a shake and a flash last, in seconds. */
const SHAKE_SECONDS = 0.28;
const FLASH_SECONDS = 0.14;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 71, 2_654_435_761) ^ Math.imul(salt + 3, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** The latest beat, and the music as the timed layers see it. */
function pulseOf(sound: AudioFrame, beat: number, drive: number): AudioPulse {
  const latest = sound.recentBeats[sound.recentBeats.length - 1];
  return {
    bass: Math.min(1, sound.bass * drive),
    beat: Math.min(1, beat),
    beatAge: latest ? latest.ageSeconds : SILENT_PULSE.beatAge,
    beatIndex: latest ? latest.index : -1,
    beatStrength: latest ? latest.strength : 0,
    high: Math.min(1, sound.high * drive),
    mid: Math.min(1, sound.mid * drive),
  };
}

/** The whole-picture punch, shake and flash for this frame. */
function hitOf(settings: EngineSettings, pulse: AudioPulse): FrameHit {
  const audio = settings.audio;
  const hard = pulse.beatStrength >= HARD_BEAT;
  const zoom = 1 + (audio.zoom / 100) * 0.08 * pulse.beat;
  let shakeX = 0;
  let shakeY = 0;
  if (audio.shakeOnBeat && hard && pulse.beatAge < SHAKE_SECONDS) {
    // A few quick jolts that die away, a fresh direction for every beat.
    const decay = 1 - pulse.beatAge / SHAKE_SECONDS;
    const step = Math.floor(pulse.beatAge * 40);
    const amount = 0.012 * pulse.beatStrength * decay * decay;
    shakeX = (hash(pulse.beatIndex * 31 + step, 1) - 0.5) * 2 * amount;
    shakeY = (hash(pulse.beatIndex * 31 + step, 2) - 0.5) * 2 * amount;
  }
  const flash =
    audio.flashOnBeat && hard && pulse.beatAge < FLASH_SECONDS
      ? 0.45 * pulse.beatStrength * (1 - pulse.beatAge / FLASH_SECONDS)
      : 0;
  return { flash, shakeX, shakeY, zoom };
}

export function reactToAudio(
  settings: EngineSettings,
  audio: AudioFrame | undefined,
): AudioReaction {
  const on = settings.audio.enabled;
  const sound = on && audio ? audio : SILENT_AUDIO;
  const pulse = on ? settings.audio.pulse / 100 : 0;
  const drive = on ? settings.audio.levels / 100 : 0;
  const beat = sound.beat * pulse;
  const music = on ? pulseOf(sound, beat, drive) : SILENT_PULSE;

  const particles = settings.backdrop.particles;
  const backdrop: BackdropSettings = {
    ...settings.backdrop,
    density: Math.min(100, settings.backdrop.density * (1 + drive * sound.mid * 0.6)),
    opacity: Math.min(100, settings.backdrop.opacity * (1 + beat * 0.6)),
    particles: {
      ...particles,
      size: Math.min(250, particles.size * (1 + drive * sound.bass * 0.7 + beat * 0.35)),
    },
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
    glitch = {
      ...settings.glitch,
      amount: Math.max(settings.glitch.amount, 40) * sound.beat,
      enabled: sound.beat > 0.05,
      // A fresh tear pattern for every beat.
      seed: settings.glitch.seed + Math.max(0, music.beatIndex) * 17,
    };
  }

  return {
    backdrop,
    burstEvents,
    crt: {
      ...settings.crt,
      band: Math.min(100, settings.crt.band + beat * 60),
      grain: Math.min(100, settings.crt.grain * (1 + drive * sound.bass * 0.8)),
      strength: Math.min(100, settings.crt.strength * (1 + drive * sound.high)),
    },
    glitch,
    hit: on ? hitOf(settings, music) : STILL_FRAME,
    // A beat boxes a flurry of the brightest cells, like a terminal selecting.
    knockout: Math.min(100, settings.knockout + beat * 35),
    motion: { ...settings.motion, amount: settings.motion.amount * (1 + beat * 0.8) },
    pulse: music,
    pump: 1 + beat * 0.6 + drive * sound.bass * 0.5,
    swirl: {
      ...settings.swirl,
      radius: settings.swirl.radius * (1 + drive * sound.bass * 0.4),
    },
    textScale: 1 + beat * 0.035,
  };
}
