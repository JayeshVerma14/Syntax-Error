/**
 * Data text timing: when each item starts, is fully shown, starts to leave
 * and is gone, and which character a reveal or exit shows at a given age.
 * Everything is closed-form in sequence seconds, so any frame draws alone.
 *
 * Reveals are quick on purpose: a label decodes in about half a second, the
 * appear front racing ahead and the lock front following with a jittered lag,
 * the way the reference's labels resolve. Departures are quicker still: the
 * whole block holds until its last item has held, then every item leaves in
 * a tight cascade, so the block is gone in under half a second.
 */

import { SCRAMBLE_GLYPHS } from "./engine-constants";
import type {
  DataExit,
  DataItem,
  DataReveal,
  DataStyle,
  DataTextSettings,
} from "./engine-datatext";
import { applyTextCase } from "./engine-fonts";

export function dataHash(value: number, salt: number): number {
  let h = Math.imul(value + 419, 2_654_435_761) ^ Math.imul(salt + 13, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
export const easeInCubic = (t: number) => t * t * t;
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Scramble frames per second. */
export const SCRAMBLE_RATE = 24;

const DECODE_STEP = 0.022;
/** Longest the appear front takes across one line. */
const DECODE_SPAN = 0.36;
const LOCK_MIN = 0.08;
const LOCK_SPREAD = 0.14;
/** Each further line starts decoding this much later. */
export const LINE_LAG = 0.07;
const TYPE_STEP = 0.032;
const TYPE_SPAN = 0.7;
export const CARET_TAIL = 0.14;
export const FLICKER_SECONDS = 0.36;
const WORD_STEP = 0.055;
const WORD_SPAN = 0.8;
/** How long a wordmark letter takes to assemble from fragments. */
export const FRAGMENT_SECONDS = 0.14;
/** A boxed tag's squares lock on, its box opens, then its text decodes. */
export const TARGET_LOCK_SECONDS = 0.26;
export const BOX_OPEN_DELAY = 0.06;
export const BOX_OPEN_SECONDS = 0.2;
export const BOX_TEXT_DELAY = 0.16;
export const BOX_CLOSE_SECONDS = 0.14;
/** A leaving box starts to close this far into its text's decode-out. */
const BOX_CLOSE_AT = 0.6;
/** A bullet pops before its label starts. */
export const BULLET_LEAD = 0.08;
export const BULLET_EXIT_SECONDS = 0.42;
export const BACKSPACE_SECONDS = 0.2;
const OUT_STEP = 0.008;
const OUT_SPAN = 0.12;
const OUT_MIN = 0.03;
const OUT_SPREAD = 0.06;
/** A wordmark leaves letter by letter from its end, each shedding its fragments. */
const WORD_OUT_STEP = 0.022;
const WORD_OUT_SPAN = 0.2;
export const FRAGMENT_OUT_SECONDS = 0.1;
/** Items leave this share of the stagger apart, and never more than EXIT_SPREAD in all. */
const EXIT_STAGGER = 0.3;
const EXIT_SPREAD = 0.2;
/** Markers and rules take at least this long to clear. */
export const MARKS_OUT_SECONDS = 0.2;
/** The loop's last frame is left empty by this margin. */
const FIT_MARGIN = 1 / 60;

/** An item's lines, cased; "|" or a newline starts a new line. */
export function itemLines(text: string, textCase: string): string[] {
  const lines = applyTextCase(text, textCase)
    .replace(/\r/g, "")
    .split(/\||\n/)
    .map((line) => line.trim());
  while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
  while (lines.length > 0 && lines[0].length === 0) lines.shift();
  return lines;
}

const glyphCount = (line: string) => Array.from(line).length;

/** Seconds between two characters' appear times on a line of `count`. */
export function decodeStep(count: number): number {
  return count > 1 ? Math.min(DECODE_STEP, DECODE_SPAN / (count - 1)) : 0;
}

function outStep(count: number): number {
  return count > 1 ? Math.min(OUT_STEP, OUT_SPAN / (count - 1)) : 0;
}

/** Seconds per character when typing `total` characters. */
export function typeStep(total: number): number {
  return total > 0 ? Math.min(TYPE_STEP, TYPE_SPAN / total) : 0;
}

/** Seconds per letter when a wordmark of `total` letters types on. */
export function wordStep(total: number): number {
  return total > 1 ? Math.min(WORD_STEP, WORD_SPAN / (total - 1)) : 0;
}

/** Seconds between letters when a wordmark of `total` letters leaves. */
export function wordOutStep(total: number): number {
  return total > 1 ? Math.min(WORD_OUT_STEP, WORD_OUT_SPAN / (total - 1)) : 0;
}

function decodeSeconds(lines: readonly string[]): number {
  let longest = 0;
  lines.forEach((line, index) => {
    const count = glyphCount(line);
    if (count === 0) return;
    longest = Math.max(longest, index * LINE_LAG + (count - 1) * decodeStep(count) + LOCK_MIN + LOCK_SPREAD);
  });
  return longest;
}

function totalGlyphs(lines: readonly string[]): number {
  return lines.reduce((sum, line) => sum + glyphCount(line), 0);
}

function textRevealSeconds(reveal: DataReveal, lines: readonly string[], wordmark: boolean): number {
  if (reveal === "flicker") return FLICKER_SECONDS;
  const total = totalGlyphs(lines);
  if (reveal === "type") return total * typeStep(total) + CARET_TAIL;
  if (wordmark) return Math.max(0, total - 1) * wordStep(total) + FRAGMENT_SECONDS;
  return decodeSeconds(lines);
}

/** Seconds from an item's start until it is fully shown. */
export function revealSeconds(style: DataStyle, reveal: DataReveal, lines: readonly string[]): number {
  if (totalGlyphs(lines) === 0) return 0;
  if (style === "boxed") return Math.max(BOX_OPEN_DELAY + BOX_OPEN_SECONDS, BOX_TEXT_DELAY + textRevealSeconds(reveal, lines, false));
  if (style === "bullet") return BULLET_LEAD + textRevealSeconds(reveal, lines, false);
  return textRevealSeconds(reveal, lines, style === "wordmark");
}

/** Seconds a decoded-out line takes to clear. */
export function decodeOutSeconds(lines: readonly string[]): number {
  let longest = 0;
  for (const line of lines) {
    const count = glyphCount(line);
    if (count > 0) longest = Math.max(longest, (count - 1) * outStep(count) + OUT_MIN + OUT_SPREAD);
  }
  return longest;
}

/** Seconds into a boxed tag's departure at which its box starts to close. */
export function boxCloseStart(lines: readonly string[]): number {
  return decodeOutSeconds(lines) * BOX_CLOSE_AT;
}

/** Seconds an item takes to leave; a cut or a stay takes none. */
export function exitSeconds(exit: DataExit, style: DataStyle, lines: readonly string[]): number {
  const total = totalGlyphs(lines);
  if (exit === "cut" || exit === "stay" || total === 0) return 0;
  if (exit === "bullet") return BULLET_EXIT_SECONDS;
  // A wordmark never scrambles: its letters shed their fragments instead.
  if (style === "wordmark") return Math.max(0, total - 1) * wordOutStep(total) + FRAGMENT_OUT_SECONDS;
  if (style === "boxed") return Math.max(decodeOutSeconds(lines), boxCloseStart(lines) + BOX_CLOSE_SECONDS);
  return decodeOutSeconds(lines);
}

/**
 * A stand-in of the same kind, the way a departure board flips: a letter for
 * a letter, a digit for a digit, a mark for anything else.
 */
export function scrambleGlyph(glyph: string, salt: number, tick: number): string {
  const code = glyph.charCodeAt(0);
  const pick = dataHash(salt, tick);
  if (code >= 48 && code <= 57) return String.fromCharCode(48 + Math.floor(pick * 10));
  if (code >= 65 && code <= 90) return String.fromCharCode(65 + Math.floor(pick * 26));
  if (code >= 97 && code <= 122) return String.fromCharCode(97 + Math.floor(pick * 26));
  return SCRAMBLE_GLYPHS[Math.floor(pick * SCRAMBLE_GLYPHS.length)] ?? glyph;
}

/** A decoding character: "" before it appears, noise until it locks, then itself. */
export function decodeInGlyph(
  glyph: string,
  index: number,
  count: number,
  age: number,
  seed: number,
  tick: number,
): string {
  const appear = index * decodeStep(count);
  if (age < appear) return "";
  const lock = appear + LOCK_MIN + LOCK_SPREAD * dataHash(index, seed);
  return age >= lock ? glyph : scrambleGlyph(glyph, index * 31 + seed, tick);
}

/** A character decoding out, from the line's end: itself, then noise, then "". */
export function decodeOutGlyph(
  glyph: string,
  index: number,
  count: number,
  age: number,
  seed: number,
  tick: number,
): string {
  const leave = (count - 1 - index) * outStep(count);
  if (age < leave) return glyph;
  const gone = leave + OUT_MIN + OUT_SPREAD * dataHash(index, seed + 5);
  return age >= gone ? "" : scrambleGlyph(glyph, index * 17 + seed, tick);
}

export type ItemTiming = Readonly<{
  end: number;
  /** When the item starts to leave; Infinity when it stays. */
  exit: number;
  /** When the reveal has finished. */
  shown: number;
  start: number;
}>;

export type DataPlan = Readonly<{
  /** When the last trace has gone; Infinity when the text stays, 0 when nothing shows. */
  end: number;
  /** When the first item starts; the markers and rules start with it. */
  first: number;
  /** The hold after fitting the loop. */
  hold: number;
  /** One per item; an item without text never shows (its times are all Infinity). */
  items: readonly ItemTiming[];
  /** When the items start to leave; the markers and rules follow. */
  leave: number;
}>;

type Draft = Readonly<{ exitLength: number; rank: number; shown: number; start: number }>;

const NEVER: ItemTiming = { end: Infinity, exit: Infinity, shown: Infinity, start: Infinity };
const EMPTY_PLAN: DataPlan = { end: 0, first: 0, hold: 0, items: [], leave: 0 };

/** Where an After or With logo start counts from; At start counts from 0. */
function originOf(settings: DataTextSettings, afterSeconds: number): number {
  if (settings.timing === "start" || !Number.isFinite(afterSeconds)) return 0;
  return Math.max(0, afterSeconds);
}

/**
 * Every item with text, in list order, with its place in the departure; a
 * blank item is null but keeps its stagger slot.
 */
function draftItems(settings: DataTextSettings, origin: number): (Draft | null)[] {
  let rank = 0;
  return settings.items.map((item: DataItem, index) => {
    const lines = itemLines(item.text, settings.type.textCase);
    if (totalGlyphs(lines) === 0) return null;
    const start = origin + settings.start + index * settings.stagger + item.delay;
    const draft: Draft = {
      exitLength: exitSeconds(settings.exit, item.style, lines),
      rank,
      shown: start + revealSeconds(item.style, settings.reveal, lines),
      start,
    };
    rank += 1;
    return draft;
  });
}

/** Seconds between one item leaving and the next. */
function exitStep(settings: DataTextSettings, count: number): number {
  return count > 1 ? Math.min(settings.stagger * EXIT_STAGGER, EXIT_SPREAD / (count - 1)) : 0;
}

/** The layer's end for a hold; every term grows one for one with the hold. */
function naturalEnd(drafts: readonly Draft[], settings: DataTextSettings, hold: number): number {
  const leave = Math.max(...drafts.map((draft) => draft.shown)) + hold;
  if (settings.exit === "cut") return leave;
  const step = exitStep(settings, drafts.length);
  const latestEnd = Math.max(...drafts.map((draft) => leave + draft.rank * step + draft.exitLength));
  return Math.max(latestEnd, leave + MARKS_OUT_SECONDS);
}

/**
 * When every item comes and goes. Items start `stagger` apart in list order,
 * plus their own delay. The block holds `hold` seconds once its last item is
 * shown, then the items leave in list order a fraction of the stagger apart,
 * so the whole block clears in under half a second; a cut drops them all at
 * once. When the loop is too short to see them leave, the hold gives way
 * first. A start other than At start counts from `afterSeconds`.
 */
export function planDataText(settings: DataTextSettings, loopSeconds: number, afterSeconds = 0): DataPlan {
  const slots = draftItems(settings, originOf(settings, afterSeconds));
  const drafts = slots.filter((draft): draft is Draft => draft !== null);
  if (drafts.length === 0) return EMPTY_PLAN;
  const first = Math.min(...drafts.map((draft) => draft.start));
  const timed = (make: (draft: Draft) => ItemTiming) => slots.map((draft) => (draft ? make(draft) : NEVER));
  if (settings.exit === "stay") {
    const items = timed((draft) => ({ end: Infinity, exit: Infinity, shown: draft.shown, start: draft.start }));
    return { end: Infinity, first, hold: settings.hold, items, leave: Infinity };
  }
  let hold = settings.hold;
  const loop = Number.isFinite(loopSeconds) ? loopSeconds : 0;
  if (loop > 0) {
    const over = naturalEnd(drafts, settings, hold) - (loop - FIT_MARGIN);
    if (over > 0) hold = Math.max(0, hold - over);
  }
  const end = naturalEnd(drafts, settings, hold);
  const leave = Math.max(...drafts.map((draft) => draft.shown)) + hold;
  if (settings.exit === "cut") {
    const items = timed((draft) => ({ end, exit: end, shown: draft.shown, start: draft.start }));
    return { end, first, hold, items, leave };
  }
  const step = exitStep(settings, drafts.length);
  const items = timed((draft) => {
    const exit = leave + draft.rank * step;
    return { end: exit + draft.exitLength, exit, shown: draft.shown, start: draft.start };
  });
  return { end, first, hold, items, leave };
}
