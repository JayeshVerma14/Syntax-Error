/**
 * Audio reactivity: a song is analysed once into per-frame envelopes (bass,
 * mids, highs, level) and a list of beats, and every frame then reads those
 * at its own song time. Nothing depends on playback timing, so the preview,
 * scrubbing and every exported frame react to exactly the same music.
 *
 * A clip covers one segment of the song: it starts at Song start and lasts
 * the timeline's length, so clips exported from different segments line up
 * again on the full track.
 */

import { readBoolean, readNumber, type Values } from "./engine-values";

export const audioTargets = {
  burstOnBeat: "audio.burstOnBeat",
  enabled: "audio.enabled",
  file: "audio.file",
  glitchOnBeat: "audio.glitchOnBeat",
  levels: "audio.levels",
  pulse: "audio.pulse",
  sensitivity: "audio.sensitivity",
  start: "audio.start",
  volume: "audio.volume",
} as const;

export type AudioSettings = Readonly<{
  burstOnBeat: boolean;
  enabled: boolean;
  glitchOnBeat: boolean;
  /** 0..100: how strongly bass, mids and highs drive the picture. */
  levels: number;
  /** 0..100: how strongly each beat swells the picture. */
  pulse: number;
  /** 25..300: gain on the analysed music. */
  sensitivity: number;
  /** Song second the clip starts at. */
  start: number;
  /** 0..100: loudness in preview and export. */
  volume: number;
}>;

export const MAX_SONG_START_SECONDS = 600;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export function readAudio(values: Values): AudioSettings {
  return {
    burstOnBeat: readBoolean(values, audioTargets.burstOnBeat, false),
    enabled: readBoolean(values, audioTargets.enabled, false),
    glitchOnBeat: readBoolean(values, audioTargets.glitchOnBeat, false),
    levels: clamp(readNumber(values, audioTargets.levels, 40), 0, 100),
    pulse: clamp(readNumber(values, audioTargets.pulse, 40), 0, 100),
    sensitivity: clamp(readNumber(values, audioTargets.sensitivity, 100), 25, 300),
    start: clamp(readNumber(values, audioTargets.start, 0), 0, MAX_SONG_START_SECONDS),
    volume: clamp(readNumber(values, audioTargets.volume, 80), 0, 100),
  };
}

/** Feature frames per second of song. */
export const AUDIO_FRAME_RATE = 60;

export type AudioAnalysis = Readonly<{
  bass: Float32Array;
  /** Beat envelope per frame: jumps on a beat and decays. */
  beat: Float32Array;
  /** Beat onsets in song seconds, and their strengths in 0..1. */
  beatStrengths: Float32Array;
  beatTimes: Float32Array;
  durationSeconds: number;
  high: Float32Array;
  level: Float32Array;
  mid: Float32Array;
}>;

/** One-pole low-pass coefficient for a cutoff frequency. */
function lowPass(cutoff: number, sampleRate: number): number {
  return Math.exp((-2 * Math.PI * cutoff) / sampleRate);
}

/** The value below which `share` of the (non-zero) values fall. */
function percentile(values: Float32Array, share: number): number {
  const sorted = Array.from(values).filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 1;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] || 1;
}

/**
 * Scales a band between its usual floor and its loud passages, then eases its
 * fall. Measuring from the floor means a steady sound, like hiss or a held
 * pad, reads near 0 and only what rises above it reads high, so a band reacts
 * to the music moving rather than to the band merely being present.
 */
function normalizeBand(raw: Float32Array): Float32Array {
  const floor = percentile(raw, 0.2);
  const reference = percentile(raw, 0.95) * 1.05;
  const span = Math.max(reference - floor, reference * 0.25, 1e-6);
  const out = new Float32Array(raw.length);
  const release = Math.exp(-1 / (AUDIO_FRAME_RATE * 0.12));
  let envelope = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const value = Math.min(1, Math.max(0, (raw[index] - floor) / span));
    envelope = value > envelope ? envelope + (value - envelope) * 0.6 : envelope * release + value * (1 - release);
    out[index] = envelope;
  }
  return out;
}

type Bands = Readonly<{ bass: Float32Array; high: Float32Array; level: Float32Array; mid: Float32Array }>;

/**
 * Per-frame RMS of the whole signal and of three bands split with one-pole
 * filters: bass below ~150 Hz, mids ~150 Hz–2 kHz, highs above ~3.5 kHz.
 */
function measureBands(samples: Float32Array, sampleRate: number): Bands {
  const hop = sampleRate / AUDIO_FRAME_RATE;
  const frames = Math.max(1, Math.ceil(samples.length / hop));
  const level = new Float32Array(frames);
  const bass = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const high = new Float32Array(frames);
  const counts = new Float32Array(frames);
  const a150 = lowPass(150, sampleRate);
  const a2000 = lowPass(2000, sampleRate);
  const a3500 = lowPass(3500, sampleRate);
  let low1 = 0;
  let low2 = 0;
  let wide = 0;
  let upper = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const x = samples[index];
    low1 = (1 - a150) * x + a150 * low1;
    low2 = (1 - a150) * low1 + a150 * low2;
    wide = (1 - a2000) * x + a2000 * wide;
    upper = (1 - a3500) * x + a3500 * upper;
    const frame = Math.min(frames - 1, Math.floor(index / hop));
    level[frame] += x * x;
    bass[frame] += low2 * low2;
    mid[frame] += (wide - low1) * (wide - low1);
    high[frame] += (x - upper) * (x - upper);
    counts[frame] += 1;
  }
  for (let frame = 0; frame < frames; frame += 1) {
    const count = Math.max(1, counts[frame]);
    level[frame] = Math.sqrt(level[frame] / count);
    bass[frame] = Math.sqrt(bass[frame] / count);
    mid[frame] = Math.sqrt(mid[frame] / count);
    high[frame] = Math.sqrt(high[frame] / count);
  }
  return { bass, high, level, mid };
}

/** Onset strength per frame: how sharply bass and overall energy rise, in log terms. */
function onsetFlux(bands: Bands): Float32Array {
  const { bass, level } = bands;
  const bassReference = percentile(bass, 0.95) || 1;
  const levelReference = percentile(level, 0.95) || 1;
  const flux = new Float32Array(bass.length);
  for (let frame = 1; frame < bass.length; frame += 1) {
    const bassRise =
      Math.log1p((10 * bass[frame]) / bassReference) - Math.log1p((10 * bass[frame - 1]) / bassReference);
    const levelRise =
      Math.log1p((10 * level[frame]) / levelReference) - Math.log1p((10 * level[frame - 1]) / levelReference);
    flux[frame] = Math.max(0, bassRise) + 0.5 * Math.max(0, levelRise);
  }
  return flux;
}

type Beat = Readonly<{ frame: number; strength: number }>;

/**
 * Beats are local peaks in the onset strength above an adaptive threshold,
 * at least 0.18 s apart, with strength relative to the track's strong hits.
 */
function pickBeats(flux: Float32Array): Beat[] {
  const frames = flux.length;
  const window = Math.round(AUDIO_FRAME_RATE * 0.4);
  const neighbourhood = Math.round(AUDIO_FRAME_RATE * 0.1);
  const minGap = Math.round(AUDIO_FRAME_RATE * 0.18);
  const frameList: number[] = [];
  const excesses: number[] = [];
  let lastPeak = -minGap;
  for (let frame = 1; frame < frames - 1; frame += 1) {
    let sum = 0;
    let count = 0;
    for (let other = Math.max(0, frame - window); other <= Math.min(frames - 1, frame + window); other += 1) {
      sum += flux[other];
      count += 1;
    }
    const threshold = (sum / count) * 1.5 + 0.02;
    if (flux[frame] <= threshold || frame - lastPeak < minGap) continue;
    let isPeak = true;
    for (let other = Math.max(0, frame - neighbourhood); other <= Math.min(frames - 1, frame + neighbourhood); other += 1) {
      if (flux[other] > flux[frame]) {
        isPeak = false;
        break;
      }
    }
    if (!isPeak) continue;
    frameList.push(frame);
    excesses.push(flux[frame] - threshold);
    lastPeak = frame;
  }
  const sorted = [...excesses].sort((a, b) => a - b);
  const reference = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] || 1;
  const beats: Beat[] = [];
  for (let index = 0; index < frameList.length; index += 1) {
    const strength = Math.min(1, excesses[index] / reference);
    if (strength >= 0.15) beats.push({ frame: frameList[index], strength });
  }
  return beats;
}

/** A per-frame envelope that jumps to each beat's strength and decays. */
function beatEnvelope(beats: readonly Beat[], frames: number): Float32Array {
  const envelope = new Float32Array(frames);
  const decay = Math.exp(-1 / (AUDIO_FRAME_RATE * 0.14));
  let pointer = 0;
  let value = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    value *= decay;
    while (pointer < beats.length && beats[pointer].frame === frame) {
      value = Math.max(value, beats[pointer].strength);
      pointer += 1;
    }
    envelope[frame] = value;
  }
  return envelope;
}

/** Analyses mono samples into feature envelopes and beats. */
export function analyzeAudio(samples: Float32Array, sampleRate: number): AudioAnalysis {
  const bands = measureBands(samples, sampleRate);
  const beats = pickBeats(onsetFlux(bands));
  return {
    bass: normalizeBand(bands.bass),
    beat: beatEnvelope(beats, bands.bass.length),
    beatStrengths: Float32Array.from(beats, (beat) => beat.strength),
    beatTimes: Float32Array.from(beats, (beat) => beat.frame / AUDIO_FRAME_RATE),
    durationSeconds: samples.length / sampleRate,
    high: normalizeBand(bands.high),
    level: normalizeBand(bands.level),
    mid: normalizeBand(bands.mid),
  };
}

/** A beat that has already fired, for effects that play out after it. */
export type AudioBeat = Readonly<{ ageSeconds: number; index: number; strength: number }>;

/** The music at one song moment, with Sensitivity applied. */
export type AudioFrame = Readonly<{
  bass: number;
  beat: number;
  high: number;
  level: number;
  mid: number;
  /** Beats within the last few seconds, newest last. */
  recentBeats: readonly AudioBeat[];
}>;

export const SILENT_AUDIO: AudioFrame = {
  bass: 0,
  beat: 0,
  high: 0,
  level: 0,
  mid: 0,
  recentBeats: [],
};

/** How far back beats are reported, in seconds. */
const RECENT_BEAT_SECONDS = 4;

/** One feature at a song second, linearly between frames, with gain applied. */
function readFeature(values: Float32Array, songSeconds: number, gain: number): number {
  const position = songSeconds * AUDIO_FRAME_RATE;
  if (values.length === 0 || position < 0 || position > values.length - 1) return 0;
  const low = Math.floor(position);
  const high = Math.min(values.length - 1, low + 1);
  const mix = position - low;
  return Math.min(1, (values[low] * (1 - mix) + values[high] * mix) * gain);
}

/** Beats in the few seconds before a song second, newest last. */
function recentBeatsAt(analysis: AudioAnalysis, songSeconds: number, gain: number): AudioBeat[] {
  const recent: AudioBeat[] = [];
  const { beatStrengths, beatTimes } = analysis;
  for (let index = 0; index < beatTimes.length; index += 1) {
    const age = songSeconds - beatTimes[index];
    if (age < 0) break;
    if (age <= RECENT_BEAT_SECONDS) {
      recent.push({ ageSeconds: age, index, strength: Math.min(1, beatStrengths[index] * gain) });
    }
  }
  return recent;
}

/** Samples the analysis at a song second. */
export function sampleAudio(
  analysis: AudioAnalysis,
  songSeconds: number,
  sensitivity: number,
): AudioFrame {
  const gain = sensitivity / 100;
  return {
    bass: readFeature(analysis.bass, songSeconds, gain),
    beat: readFeature(analysis.beat, songSeconds, gain),
    high: readFeature(analysis.high, songSeconds, gain),
    level: readFeature(analysis.level, songSeconds, gain),
    mid: readFeature(analysis.mid, songSeconds, gain),
    recentBeats: recentBeatsAt(analysis, songSeconds, gain),
  };
}

/** The song second a timeline time corresponds to. */
export function songSecondsAt(audio: AudioSettings, timelineSeconds: number): number {
  return audio.start + Math.max(0, timelineSeconds);
}

/** An export file name that records the song segment, e.g. `-song-0m32.5s-8s`. */
export function segmentFileSuffix(audio: AudioSettings, durationSeconds: number): string {
  const minutes = Math.floor(audio.start / 60);
  const seconds = audio.start - minutes * 60;
  const length = Math.round(durationSeconds * 10) / 10;
  return `-song-${minutes}m${seconds.toFixed(1)}s-${length}s`;
}
