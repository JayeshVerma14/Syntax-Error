/**
 * When the transition fillers play: the scene cuts of the sequence, the loop
 * seam, and the clock the fillers run on.
 *
 * A filler is centred on its cut. Cuts closer together than one filler merge
 * into a single filler that covers at the first cut, stays dark through the
 * ones between and uncovers after the last, so a filler never jumps back to
 * dark halfway through showing a shot. On a loop the seam is a cut like any
 * other and distances wrap round, so a filler can run across the seam.
 *
 * Fillers keep their real length when a long sequence is squeezed into a
 * shorter timeline, and their flicker runs on real seconds.
 */

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import type { TransitionSettings } from "./engine-transition";
import { beatFiller } from "./engine-transition-audio";

/** The sequence phases a cut list is built from, in sequence seconds. */
export type TransitionSchedule = Readonly<{
  breakStart: number;
  codeEnd: number;
  endEnd: number;
  endStart: number;
  total: number;
}>;

/** More of the sequence, for the cuts the code schedule alone cannot see. */
export type TransitionCutOptions = Readonly<{
  /** The data text's time on screen in sequence seconds, or null when it is off. */
  dataText?: Readonly<{ end: number; start: number }> | null;
  /** Filler length in sequence seconds; the last scene's exit is a cut only with room for two. */
  duration?: number;
  /** When the logo has gone; Infinity when it holds to the end of the loop. */
  logoEnd?: number;
  /** Sequence length of one loop; with it, the last scene leaving an empty frame is a cut. */
  loop?: number;
  /** The code roll ends on the sheet, so its end is a cut even with no end text. */
  sheetAtEnd?: boolean;
}>;

/** Scenes closer together than this touch; a cut is never nearer the loop start. */
const MIN_SCENE_GAP = 0.05;
/** Across a longer gap the cut sits this long before the next scene, so it lands on it. */
const MAX_CUT_LEAD = 0.3;

type Scene = { end: number; start: number };

function scenesOf(schedule: TransitionSchedule, logoStart: number | null, options: TransitionCutOptions): Scene[] {
  const scenes: Scene[] = [];
  if (schedule.codeEnd > 0) scenes.push({ end: schedule.codeEnd, start: 0 });
  if (schedule.endEnd > schedule.endStart) scenes.push({ end: schedule.endEnd, start: schedule.endStart });
  if (logoStart !== null && Number.isFinite(logoStart)) {
    const end = options.logoEnd ?? schedule.total;
    scenes.push({ end: Number.isNaN(end) ? schedule.total : Math.max(logoStart, end), start: Math.max(0, logoStart) });
  }
  const data = options.dataText;
  if (data && Number.isFinite(data.start) && data.end > data.start) {
    scenes.push({ end: data.end, start: Math.max(0, data.start) });
  }
  return scenes.sort((first, second) => first.start - second.start);
}

/**
 * Seconds of the scene cuts: code roll to end text, to data text and to logo,
 * in whatever order they play. Pass the code schedule and the logo's start,
 * or null when the logo is off. A scene that starts while the previous one is
 * still on screen (a logo timed from the loop start) lies over it, so it is
 * no cut. With `options`, the code roll handing over to the sheet is a cut,
 * the data text is a scene, the logo's real end counts, and the last scene
 * leaving an empty frame well before the loop ends is a cut. The loop seam is
 * not listed; placement adds it.
 */
export function transitionCuts(
  schedule: TransitionSchedule,
  logoStart: number | null,
  options: TransitionCutOptions = {},
): number[] {
  const scenes = scenesOf(schedule, logoStart, options);
  const cuts: number[] = [];
  const add = (cut: number) => {
    if (Number.isFinite(cut) && cut > MIN_SCENE_GAP && cuts.every((known) => Math.abs(known - cut) > MIN_SCENE_GAP)) {
      cuts.push(cut);
    }
  };
  let shown = scenes.length > 0 ? scenes[0].end : 0;
  for (let index = 1; index < scenes.length; index += 1) {
    const next = scenes[index];
    if (next.start >= shown - MIN_SCENE_GAP) {
      add(next.start > shown ? Math.max((shown + next.start) / 2, next.start - MAX_CUT_LEAD) : next.start);
    }
    shown = Math.max(shown, next.end);
  }
  if (options.sheetAtEnd && schedule.codeEnd > 0) add(schedule.codeEnd);
  const loop = options.loop ?? 0;
  const duration = options.duration ?? 0.8;
  if (loop > 0 && scenes.length > 0 && Number.isFinite(shown) && loop - shown >= 2 * duration) add(shown);
  return cuts.sort((first, second) => first - second);
}

/** One loop as the fillers see it: its sequence length, and the timeline's real length. */
export type TransitionLoop = Readonly<{ real: number; sequence: number }>;

/**
 * The clock fillers run on: the frame's sequence time, the sequence length
 * of one loop, and the loop's real length. It matches `sequenceTime`, which
 * only compresses the sequence when it is longer than the timeline loop.
 */
export function transitionClock(
  progress: number,
  durationSeconds: number,
  total: number,
): Readonly<{ loop: number; real: number; time: number }> {
  const loop = Math.max(durationSeconds > 0 ? durationSeconds : 0, total > 0 ? total : 0);
  const wrapped = ((progress % 1) + 1) % 1;
  return { loop, real: durationSeconds > 0 ? durationSeconds : loop, time: wrapped * loop };
}

export type TransitionMoment = Readonly<{
  /** Sequence second of the (first) cut this filler hides; for a beat, the frame's time less the beat's age. */
  centre: number;
  /** 0..1: how dark the cover gets, times the Cover control. */
  cover: number;
  /** Share of the filler held covered; longer than the Hold control when fillers merged. */
  hold: number;
  /** Real seconds from the (first) cut, negative before it; flicker runs on this clock. */
  seconds: number;
  /** Differs per cut, so each filler flickers its own way. */
  seed: number;
  /** 0..1 through the filler. */
  u: number;
}>;

const mod = (value: number, size: number) => ((value % size) + size) % size;

/** The widest gap between fillers stays this many fillers long, so the picture always shows. */
const WIDEST_GAP_FILLERS = 1.25;

type Span = Readonly<{ first: number; last: number }>;

/** Centres in order, grouped wherever they are less than one filler apart. */
function groupCentres(ordered: readonly number[], duration: number): Span[] {
  const spans: Span[] = [];
  let first = ordered[0];
  let last = ordered[0];
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] - last < duration) last = ordered[index];
    else {
      spans.push({ first, last });
      first = ordered[index];
      last = ordered[index];
    }
  }
  spans.push({ first, last });
  return spans;
}

/**
 * The fillers of one loop and their length. On a loop the grouping starts
 * after the widest gap, and a filler is at most half the loop and short
 * enough that the widest gap still shows the picture.
 */
function planFillers(centres: readonly number[], loop: number, duration: number): Readonly<{ duration: number; spans: Span[] }> {
  if (centres.length === 0) return { duration, spans: [] };
  if (!(loop > 0)) return { duration, spans: groupCentres([...centres].sort((a, b) => a - b), duration) };
  const sorted = centres.map((centre) => mod(centre, loop)).sort((a, b) => a - b);
  const unique = sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > 1e-6);
  if (unique.length > 1 && unique[0] + loop - unique[unique.length - 1] <= 1e-6) unique.pop();
  let widest = 0;
  let after = 0;
  for (let index = 0; index < unique.length; index += 1) {
    const gap = (index + 1 < unique.length ? unique[index + 1] : unique[0] + loop) - unique[index];
    if (gap > widest) {
      widest = gap;
      after = (index + 1) % unique.length;
    }
  }
  const fitted = Math.min(duration, loop / 2, widest / WIDEST_GAP_FILLERS);
  const ordered = unique.map((_, step) => {
    const index = (after + step) % unique.length;
    return unique[index] + (index < after ? loop : 0);
  });
  return { duration: fitted, spans: groupCentres(ordered, fitted) };
}

function loopOf(loop: number | TransitionLoop): TransitionLoop {
  const sequence = typeof loop === "number" ? loop : loop.sequence;
  const real = typeof loop === "number" ? loop : loop.real;
  return {
    real: Number.isFinite(real) && real > 0 ? real : 0,
    sequence: Number.isFinite(sequence) && sequence > 0 ? sequence : 0,
  };
}

/**
 * The filler on screen at a sequence time, or null between fillers.
 * `loopSeconds` is the loop's sequence length, or both lengths when the
 * sequence is squeezed into a shorter timeline (see `transitionClock`).
 */
export function transitionAt(
  settings: TransitionSettings,
  timeSeconds: number,
  loopSeconds: number | TransitionLoop,
  cuts: readonly number[],
  pulse: AudioPulse = SILENT_PULSE,
): TransitionMoment | null {
  if (!settings.enabled || !Number.isFinite(timeSeconds)) return null;
  const hold = settings.hold / 100;
  if (settings.placement === "beats") {
    const hit = beatFiller(pulse, settings.duration, settings.threshold / 100, hold);
    return hit ? { ...hit, centre: timeSeconds - hit.seconds, hold } : null;
  }
  const { real, sequence: loop } = loopOf(loopSeconds);
  // A squeezed sequence runs fast, so a filler spans more of it to keep its real length.
  const rate = real > 0 && loop > real ? loop / real : 1;
  const centres: number[] = [];
  if (settings.placement !== "cuts" && loop > 0) centres.push(0);
  if (settings.placement !== "loop") {
    for (const cut of cuts) if (Number.isFinite(cut)) centres.push(cut);
  }
  const plan = planFillers(centres, loop, settings.duration * rate);
  const duration = plan.duration;
  for (const span of plan.spans) {
    const length = span.last - span.first + duration;
    const offset = loop > 0 ? mod(timeSeconds - span.first + duration / 2, loop) : timeSeconds - span.first + duration / 2;
    if (!(offset >= 0 && offset < length)) continue;
    const centre = loop > 0 ? mod(span.first, loop) : span.first;
    return {
      centre,
      cover: 1,
      // Merged fillers keep the passes' length and hold for the rest.
      hold: span.last > span.first ? 1 - ((1 - hold) * duration) / length : hold,
      seconds: (offset - duration / 2) / rate,
      seed: Math.abs(Math.round(centre * 1000)) % 9973,
      u: offset / length,
    };
  }
  return null;
}
