/**
 * Data text: small monospace labels set on a strict grid at different places
 * in the frame, after the opening of the SanDisk site film. Each label
 * decodes on character by character out of scrambled letters and digits, one
 * after another; square markers dot the grid in pairs; thin rules grow out of
 * a square and thicken into stepped bars; a wide wordmark types on, each
 * letter assembling out of fragments; and a boxed status tag opens inside
 * four target squares. The block can repeat up and down the frame, and it
 * leaves in one quick cascade, by decoding out, collapsing into bullets, or
 * cutting at once.
 *
 * Items are placed in a square sheet centred in the frame, so the layout
 * holds at every aspect, and the font picker's size grows the type only as
 * far as each item has room.
 *
 * With music, beats refresh the data: a few held labels re-decode, the
 * markers count the beats in white, the stepped bars jump and the target
 * squares kick out; the bass stretches the bars, the mids let the target
 * squares breathe and the highs make the markers twinkle.
 *
 * Every frame is a pure function of the sequence time and the music at that
 * time, so preview, scrubbing and export agree.
 */

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import { readMusic } from "./engine-datatext-audio";
import { layoutDataText, type DataLayout } from "./engine-datatext-layout";
import { drawMarkers, drawRules, ruleBands, tileBlock } from "./engine-datatext-marks";
import { paintDataItems } from "./engine-datatext-paint";
import { planDataText } from "./engine-datatext-timing";
import type { TypeSettings, VectorPoint } from "./engine-settings";
import type { Paint2D } from "./engine-units";
import {
  readBoolean,
  readHex,
  readNumber,
  readString,
  readVector,
  type Values,
} from "./engine-values";

export const dataTextTargets = {
  box: "data.box",
  enabled: "data.enabled",
  exit: "data.exit",
  hold: "data.hold",
  items: "data.items",
  markers: "data.markers",
  repeat: "data.repeat",
  reveal: "data.reveal",
  rules: "data.rules",
  stagger: "data.stagger",
  start: "data.start",
  timing: "data.timing",
  type: "data.type",
} as const;

/** Label: plain text. Bullet: led by a square. Wordmark: wide display. Boxed: a status tag. */
export type DataStyle = "boxed" | "bullet" | "label" | "wordmark";
export type DataReveal = "decode" | "flicker" | "type";
export type DataExit = "bullet" | "cut" | "decode" | "stay";
/**
 * After: once the code roll, end text and logo have all finished. With logo:
 * as the logo starts, to frame it. At start: from the top of the loop.
 */
export type DataTiming = "after" | "logo" | "start";

export const DATA_STYLES: readonly DataStyle[] = ["label", "bullet", "wordmark", "boxed"];
export const DATA_REVEALS: readonly DataReveal[] = ["decode", "type", "flicker"];
export const DATA_EXITS: readonly DataExit[] = ["decode", "bullet", "cut", "stay"];
export const DATA_TIMINGS: readonly DataTiming[] = ["after", "logo", "start"];

export type DataItem = Readonly<{
  /** Seconds added to the item's place in the stagger. */
  delay: number;
  /** Where the text starts (a boxed tag centres on it), in -1..1 of the centred square sheet. */
  position: VectorPoint;
  /** Type size in pixels on a 1080-pixel sheet. */
  size: number;
  style: DataStyle;
  /** A "|" breaks the text onto a new line. */
  text: string;
}>;

export type DataTextSettings = Readonly<{
  /** Fill of a boxed tag; its text is dark or light to suit. */
  box: string;
  enabled: boolean;
  exit: DataExit;
  /** Seconds the block holds once its last item is shown; shortened to fit the loop. */
  hold: number;
  items: readonly DataItem[];
  markers: boolean;
  repeat: boolean;
  reveal: DataReveal;
  rules: boolean;
  /** Seconds between one item starting and the next. */
  stagger: number;
  /** Seconds after its start point before the first item starts. */
  start: number;
  timing: DataTiming;
  /** Face, colour and case; its size grows or shrinks every item (16 keeps item sizes). */
  type: TypeSettings;
}>;

/** The typography the font picker starts from, for readTypeValue. */
export const DATA_TEXT_TYPE: TypeSettings = {
  color: "#FF2A2A",
  fontId: "ibm-plex-mono",
  fontSize: 16,
  fontWeight: "600",
  letterSpacing: 0.025,
  lineHeight: 1.25,
  opacity: 100,
  textCase: "uppercase",
};

export const DEFAULT_DATA_BOX = "#C4DDD4";

/**
 * A compact band on a 12-column grid, like the reference's label sheet: a
 * row of labels, the wordmark, the boxed status tag between its side labels,
 * and a row of bullets. It sits in the middle of the frame alone, and leaves
 * room for Repeat to stack copies above and below it.
 */
export const DEFAULT_DATA_ITEMS: readonly DataItem[] = [
  { delay: 0, position: { x: -0.88, y: -0.4 }, size: 16, style: "label", text: "EST. 2026" },
  { delay: 0, position: { x: -0.293, y: -0.4 }, size: 16, style: "label", text: "BUILT FOR|SPEED" },
  { delay: 0, position: { x: 0.293, y: -0.4 }, size: 16, style: "label", text: "SYSTEM|ONLINE" },
  { delay: 0, position: { x: -0.88, y: -0.2 }, size: 80, style: "wordmark", text: "SYNTAX ERROR" },
  { delay: 0, position: { x: -0.367, y: 0.1 }, size: 16, style: "label", text: "DATA_1" },
  { delay: 0, position: { x: 0, y: 0.1 }, size: 16, style: "boxed", text: "PLEASE STANDBY" },
  { delay: 0, position: { x: 0.255, y: 0.1 }, size: 16, style: "label", text: "DATA STREAM (01)" },
  {
    delay: 0,
    position: { x: -0.733, y: 0.36 },
    size: 16,
    style: "bullet",
    text: "37° 25' 15\" N|121° 55' 19\" W",
  },
  { delay: 0, position: { x: 0.44, y: 0.36 }, size: 16, style: "bullet", text: "24/7" },
];

/** More items than this are ignored, so a runaway list cannot stall a frame. */
export const MAX_DATA_ITEMS = 64;
const MIN_SIZE = 6;
const MAX_SIZE = 240;

const clampTo = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** One collection record, or null when it is not a usable item. */
function readItem(entry: unknown): DataItem | null {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  if (typeof record.text !== "string") return null;
  const fields: Values = record;
  return {
    delay: clampTo(readNumber(fields, "delay", 0), 0, 20),
    position: readVector(fields, "position", { x: 0, y: 0 }),
    size: clampTo(readNumber(fields, "size", 16), MIN_SIZE, MAX_SIZE),
    style: readString(fields, "style", DATA_STYLES, "label"),
    text: record.text,
  };
}

/** The item list; the defaults when the value is missing, empty when cleared. */
export function readDataItems(values: Values): readonly DataItem[] {
  const value = values[dataTextTargets.items];
  if (!Array.isArray(value)) return DEFAULT_DATA_ITEMS;
  const items: DataItem[] = [];
  for (const entry of value) {
    const item = readItem(entry);
    if (item) items.push(item);
    if (items.length >= MAX_DATA_ITEMS) break;
  }
  return items;
}

export function readDataText(values: Values, type: TypeSettings): DataTextSettings {
  return {
    box: readHex(values, dataTextTargets.box, DEFAULT_DATA_BOX),
    enabled: readBoolean(values, dataTextTargets.enabled, false),
    exit: readString(values, dataTextTargets.exit, DATA_EXITS, "decode"),
    hold: clampTo(readNumber(values, dataTextTargets.hold, 1.8), 0, 30),
    items: readDataItems(values),
    markers: readBoolean(values, dataTextTargets.markers, true),
    repeat: readBoolean(values, dataTextTargets.repeat, false),
    reveal: readString(values, dataTextTargets.reveal, DATA_REVEALS, "decode"),
    rules: readBoolean(values, dataTextTargets.rules, true),
    stagger: clampTo(readNumber(values, dataTextTargets.stagger, 0.12), 0, 5),
    start: clampTo(readNumber(values, dataTextTargets.start, 0.2), 0, 30),
    timing: readString(values, dataTextTargets.timing, DATA_TIMINGS, "after"),
    type,
  };
}

/** The logo's place on the sequence clock, or null when it is off. */
export type DataLogoSpan = Readonly<{ end: number; start: number }> | null;

/**
 * The sequence second a start other than At start counts from: when the code
 * roll and end text end (`codeEnd`), and with After also the logo's end; with
 * With logo, the logo's start. Pass the result as `afterSeconds` to
 * dataTextLength and drawDataText. Non-finite inputs count as 0.
 */
export function dataTextAfter(settings: DataTextSettings, codeEnd: number, logo: DataLogoSpan = null): number {
  const code = Number.isFinite(codeEnd) ? Math.max(0, codeEnd) : 0;
  if (settings.timing === "start" || !logo) return code;
  if (settings.timing === "logo") return Number.isFinite(logo.start) ? Math.max(0, logo.start) : code;
  return Number.isFinite(logo.end) ? Math.max(code, logo.end) : code;
}

/**
 * Sequence seconds the layer needs to play through once: until the last
 * trace has gone, or to the end of the hold when the text stays. Zero while
 * off or when no item has text. `afterSeconds` is where an After or With
 * logo start counts from (see dataTextAfter). The loop can follow this as
 * it follows the logo.
 */
export function dataTextLength(settings: DataTextSettings, afterSeconds = 0): number {
  if (!settings.enabled || settings.items.length === 0) return 0;
  const plan = planDataText(settings, 0, afterSeconds);
  if (plan.items.length === 0) return 0;
  if (Number.isFinite(plan.end)) return plan.end;
  const shown = plan.items.map((item) => item.shown).filter(Number.isFinite);
  return Math.max(0, ...shown) + settings.hold;
}

/**
 * Draws the data text at a sequence time. `loopSeconds` is the loop length in
 * the same seconds; when the items would still be on screen at the loop end,
 * the hold shortens so the loop closes on an empty frame. `afterSeconds` is
 * where an After or With logo start counts from (see dataTextAfter). `pulse`
 * is the music at this frame; silence draws exactly the frame drawn without it.
 */
export function drawDataText(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  settings: DataTextSettings,
  timeSeconds: number,
  loopSeconds: number,
  afterSeconds = 0,
  pulse: AudioPulse = SILENT_PULSE,
): void {
  if (!settings.enabled || settings.items.length === 0) return;
  if (!(frame.width > 0 && frame.height > 0) || !Number.isFinite(timeSeconds)) return;
  const plan = planDataText(settings, loopSeconds, afterSeconds);
  if (!Number.isFinite(plan.first) || !(timeSeconds >= plan.first) || !(timeSeconds < plan.end)) return;
  const layout: DataLayout = layoutDataText(context, frame, settings);
  if (!layout.block) return;
  const tiling = tileBlock(layout, settings.repeat, settings.markers);
  const music = readMusic(pulse);

  context.save();
  context.globalAlpha *= settings.type.opacity / 100;
  if (settings.markers) {
    // Repeated copies are cut off at the band, clear of every marker row.
    const clear = settings.rules && !tiling.band ? ruleBands(layout, tiling.tiles) : [];
    drawMarkers(context, layout, plan, timeSeconds, settings, clear, music);
  }
  // Repeated copies show only their rules and items that fit the band whole.
  if (settings.rules) drawRules(context, layout, tiling, plan, timeSeconds, settings, music);
  paintDataItems(context, layout, plan, settings, timeSeconds, tiling, music);
  context.restore();
}
