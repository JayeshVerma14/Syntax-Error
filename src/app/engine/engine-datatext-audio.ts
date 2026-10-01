/**
 * Data text audio: how the labels answer the music on top of their own
 * timing. A beat refreshes the data: a fresh few held labels drop back into
 * noise and relock one character at a time as the beat dies away. The
 * markers count the beats: each beat lights the next of their four groups
 * white, left to right like a step sequencer, and it cools unevenly; a hard
 * beat also jolts their rows a step sideways. The rules' stepped bars jump up
 * a step or two like a level meter, bullets pop, and a boxed tag's target
 * squares kick out white and lock back on. The bass stretches the stepped
 * bars along their rules, the mids let the target squares breathe, and the
 * highs make the markers twinkle. The target squares show white only on the
 * first frames of a hit, so they read as locking back on, not as flashing.
 *
 * Every reaction is a pure function of the pulse and the sequence time. A
 * silent pulse reads as null, and every caller then takes exactly the path it
 * takes without music, so a silent frame is the same frame.
 */

import type { AudioPulse } from "./engine-audio-pulse";
import type { DataStyle } from "./engine-datatext";
import { clamp01, dataHash } from "./engine-datatext-timing";

/** The music as the data text reads it: every level finite and 0..1. */
export type DataMusic = Readonly<{
  bass: number;
  /** The latest beat's envelope: 1 on a full hit, decaying. */
  beat: number;
  /** Seconds since the latest beat; Infinity before the first. */
  beatAge: number;
  /** Index of the latest beat, for a fresh pattern per beat. */
  beatIndex: number;
  /** Strength of the latest beat before Beat pulse: how many labels it shakes. */
  beatStrength: number;
  high: number;
  mid: number;
}>;

/** A beat envelope below this leaves the text alone. */
const SCRAMBLE_FLOOR = 0.05;
/** Envelope above the floor at which every character of a shaken label is noise. */
const SCRAMBLE_SPAN = 0.6;
/**
 * A wordmark is shaken half as often and flips only a letter or two: all of
 * it on every beat would read as a glitch rather than a refresh.
 */
const WORDMARK_CHANCE = 0.5;
const WORDMARK_SCRAMBLE = 0.25;
/** Scale a full beat gives a bullet square. */
const BULLET_POP = 0.8;
/** Target squares kick out by this share of their reach on a full beat. */
const TARGET_KICK = 0.35;
const TARGET_BREATH = 0.12;
/**
 * A hit at or above this envelope unlocks the target squares, white, for its
 * first UNLOCK_SECONDS only, so even fast, loud music leaves them locked
 * most of the time.
 */
const TARGET_UNLOCK = 0.2;
const UNLOCK_SECONDS = 0.07;
/** The marker groups the beats step through, left to right. */
export const MARKER_GROUPS = 4;
/** Highs twinkle at this many flickers a second. */
const TWINKLE_RATE = 20;

const level = (value: number) => (Number.isFinite(value) ? clamp01(value) : 0);

/** The pulse with every level clamped, or null when nothing in it moves. */
export function readMusic(pulse: AudioPulse): DataMusic | null {
  const music = {
    bass: level(pulse.bass),
    beat: level(pulse.beat),
    beatAge: Number.isFinite(pulse.beatAge) ? Math.max(0, pulse.beatAge) : Number.POSITIVE_INFINITY,
    beatIndex: Number.isFinite(pulse.beatIndex) ? Math.max(0, Math.floor(pulse.beatIndex)) : 0,
    beatStrength: level(pulse.beatStrength),
    high: level(pulse.high),
    mid: level(pulse.mid),
  };
  const moving = music.beat > 0 || music.bass > 0 || music.mid > 0 || music.high > 0;
  return moving ? music : null;
}

/**
 * Share of one held item's characters a beat shows as noise: 0 for most
 * items, and for a fresh few per beat a share that falls as the beat decays,
 * so they relock in a scatter. `key` tells items and block copies apart.
 */
export function beatScramble(music: DataMusic | null, key: number, style: DataStyle): number {
  if (!music || !(music.beat > SCRAMBLE_FLOOR)) return 0;
  const wordmark = style === "wordmark";
  // Stronger beats shake more labels; the envelope decides how hard.
  const chance = (0.1 + 0.2 * music.beatStrength) * (wordmark ? WORDMARK_CHANCE : 1);
  // Hashed twice, so neighbouring keys pick independently.
  if (dataHash(Math.floor(dataHash(key, 71) * 1e6), music.beatIndex * 7 + 3) >= chance) return 0;
  const share = clamp01((music.beat - SCRAMBLE_FLOOR) / SCRAMBLE_SPAN);
  return wordmark ? share * WORDMARK_SCRAMBLE : share;
}

/** Whether character `index` of a shaken line is noise at this share. */
export function glyphScrambled(index: number, seed: number, share: number, beatIndex: number): boolean {
  return dataHash(index * 13 + seed, beatIndex + 1) < share;
}

/** How the marker grid moves at one frame. */
export type MarkerMusic = Readonly<{
  beatIndex: number;
  /** The beat envelope the lit group cools with. */
  flash: number;
  /** The group the latest beat lit, 0..MARKER_GROUPS - 1. */
  group: number;
  /** Rows jolt this many marker sides, stepping back as the beat decays. */
  jolt: number;
  /** Share of markers the highs switch off this flicker. */
  twinkle: number;
  twinkleTick: number;
}>;

export function markerMusic(music: DataMusic | null, time: number): MarkerMusic | null {
  if (!music) return null;
  return {
    beatIndex: music.beatIndex,
    flash: music.beat,
    group: music.beatIndex % MARKER_GROUPS,
    jolt: Math.min(2, Math.floor(music.beat * 2.5)),
    twinkle: 0.35 * music.high,
    twinkleTick: Math.floor(time * TWINKLE_RATE),
  };
}

/** A marker row's sideways jolt in marker sides: a fresh direction per beat, and some rows hold still. */
export function rowJolt(marks: MarkerMusic, row: number): number {
  if (marks.jolt === 0) return 0;
  const pick = dataHash(row, marks.beatIndex * 3 + 2);
  if (pick < 0.3) return 0;
  return (pick < 0.65 ? -1 : 1) * marks.jolt;
}

/** Whether a marker of `group` shows white: the lit group, each marker cooling at its own point. */
export function markerFlashes(marks: MarkerMusic, index: number, group: number): boolean {
  return group === marks.group && marks.flash > 0.08 + 0.25 * dataHash(index, 9);
}

export function markerTwinkles(marks: MarkerMusic, index: number): boolean {
  return dataHash(index, marks.twinkleTick * 3 + 11) < marks.twinkle;
}

/** How the rules move at one frame. */
export type RuleMusic = Readonly<{
  /** Half steps the stepped bars rise by: 0, 1 or 2. */
  lift: number;
  /** 0..1: how far the bass stretches the bars along the rule. */
  stretch: number;
}>;

export function ruleMusic(music: DataMusic | null): RuleMusic | null {
  if (!music) return null;
  return { lift: Math.min(2, Math.round(music.beat * 3)), stretch: clamp01(music.bass * 1.25) };
}

/** Multiplier on a bullet square's side. */
export function bulletPop(music: DataMusic | null): number {
  return music ? 1 + BULLET_POP * music.beat : 1;
}

/** Extra spread of a boxed tag's target squares, as a share of their reach. */
export function targetKick(music: DataMusic | null): number {
  return music ? TARGET_KICK * music.beat + TARGET_BREATH * music.mid : 0;
}

/** Whether a hit has just unlocked the target squares, white, for a frame or two. */
export function targetsUnlocked(music: DataMusic | null): boolean {
  return music !== null && music.beat >= TARGET_UNLOCK && music.beatAge < UNLOCK_SECONDS;
}
