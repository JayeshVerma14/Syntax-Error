/**
 * Data text layout: where each item's lines, bullet, box and target squares
 * sit in frame pixels. Text is measured once per item list, face and frame
 * size and kept until one of them changes, so a playing frame only draws.
 *
 * Items are placed in a square sheet centred in the frame, whose side is the
 * frame's shorter side, so the composition holds at every aspect: on a wide
 * frame the sides stay free, on a tall one the extra height is room for
 * Repeat. Sizes are authored on a 1080-pixel sheet. The font picker's size
 * grows or shrinks every item about its own anchor, as far as the fit allows
 * (see engine-datatext-fit.ts).
 *
 * A wordmark is the same face stretched wide and tracked out, with its word
 * spaces drawn narrow so it reads as one mark, the way the reference's
 * display wordmark sits beside its small labels.
 */

import type { DataItem, DataStyle, DataTextSettings } from "./engine-datatext";
import { fitScales, type Reach } from "./engine-datatext-fit";
import { itemLines } from "./engine-datatext-timing";
import { fontStackFor, isFontReady } from "./engine-fonts";
import type { Paint2D } from "./engine-units";

export type Bounds = { bottom: number; left: number; right: number; top: number };

/** A run of glyphs drawn with one fillText, `x` from the item's left. */
export type DataRun = Readonly<{ count: number; from: number; text: string; x: number }>;

export type DataLine = Readonly<{
  glyphs: readonly string[];
  /** Left edge of each glyph from the item's left, before any stretch. */
  offsets: readonly number[];
  /** The whole line, or a wordmark's words. */
  runs: readonly DataRun[];
  text: string;
  /** Advance of the whole line, before any stretch. */
  width: number;
}>;

export type DataBox = Readonly<{
  height: number;
  left: number;
  /** Side of each target square. */
  square: number;
  /** Target square centres once locked on: top left, top right, bottom left, bottom right. */
  targets: readonly (readonly [number, number])[];
  top: number;
  width: number;
}>;

export type LaidItem = Readonly<{
  /** One advance of the face, before any stretch: the caret's width. */
  advance: number;
  /** Where the item is placed: a boxed tag's centre, otherwise its first line's start. */
  anchorX: number;
  anchorY: number;
  bounds: Bounds;
  box: DataBox | null;
  /** A bullet's square: centre and side. */
  bullet: Readonly<{ side: number; x: number; y: number }> | null;
  /** Cap height: `y` is the middle of the first line's capitals. */
  cap: number;
  font: string;
  letterSpacing: string;
  lines: readonly DataLine[];
  lineStep: number;
  size: number;
  /** Horizontal stretch the text is drawn with. */
  stretch: number;
  style: DataStyle;
  x: number;
  y: number;
}>;

/** The square the items are placed in: its side is the frame's shorter side. */
export type DataSheet = Readonly<{ left: number; size: number; top: number }>;

export type DataLayout = Readonly<{
  /** Everything the items cover, or null when no item has text. */
  block: Bounds | null;
  height: number;
  items: readonly LaidItem[];
  /** Side of a square marker. */
  marker: number;
  sheet: DataSheet;
  /** A 16-pixel label on this sheet: markers and rules are sized from it. */
  unit: number;
  width: number;
}>;

/** A wordmark's horizontal stretch and extra tracking in ems. */
export const WORDMARK_STRETCH = 1.26;
const WORDMARK_TRACKING = 0.035;
/** A wordmark's word space, as a share of the face's own. */
const WORDMARK_SPACE = 0.45;
/** Grid: 12 columns inside a 6% margin of the sheet, as the default items are placed. */
export const GRID_MARGIN = 0.06;
export const GRID_COLUMNS = 12;
/** Nothing may grow past this share of the sheet from the frame's edges. */
const EDGE_MARGIN = 0.03;

type Env = Readonly<{
  column: number;
  settings: DataTextSettings;
  sheet: DataSheet;
}>;

function plainLine(context: Paint2D, text: string): DataLine {
  const glyphs = Array.from(text);
  const offsets: number[] = [];
  let prefix = "";
  for (const glyph of glyphs) {
    offsets.push(prefix.length > 0 ? context.measureText(prefix).width : 0);
    prefix += glyph;
  }
  const width = text.length > 0 ? context.measureText(text).width : 0;
  const runs = text.length > 0 ? [{ count: glyphs.length, from: 0, text, x: 0 }] : [];
  return { glyphs, offsets, runs, text, width };
}

/** A wordmark line: each word a run, with narrow spaces between them. */
function wordmarkLine(context: Paint2D, text: string): DataLine {
  const glyphs = Array.from(text);
  const space = context.measureText(" ").width * WORDMARK_SPACE;
  const offsets: number[] = [];
  const runs: DataRun[] = [];
  let x = 0;
  let run: string[] = [];
  let runFrom = 0;
  const close = () => {
    if (run.length === 0) return;
    const runText = run.join("");
    runs.push({ count: run.length, from: runFrom, text: runText, x });
    x += context.measureText(runText).width;
    run = [];
  };
  glyphs.forEach((glyph, index) => {
    if (glyph === " ") {
      close();
      offsets.push(x);
      x += space;
      return;
    }
    if (run.length === 0) runFrom = index;
    offsets.push(x + (run.length > 0 ? context.measureText(run.join("")).width : 0));
    run.push(glyph);
  });
  close();
  return { glyphs, offsets, runs, text, width: x };
}

function capHeight(context: Paint2D, size: number): number {
  const ascent = context.measureText("H").actualBoundingBoxAscent;
  return Number.isFinite(ascent) && ascent > 0 ? ascent : size * 0.7;
}

function boxFor(lines: readonly DataLine[], cap: number, size: number, lineStep: number, cx: number, cy: number): DataBox {
  const padX = size * 0.7;
  const padY = size * 0.62;
  const textWidth = Math.max(0, ...lines.map((line) => line.width));
  const width = textWidth + padX * 2;
  const height = cap + (lines.length - 1) * lineStep + padY * 2;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const square = size * 1.7;
  const inset = width * 0.03 + square / 2;
  const reach = height * 1.3 + square / 2;
  const leftX = left + inset;
  const rightX = left + width - inset;
  return {
    height,
    left,
    square,
    targets: [
      [leftX, top - reach],
      [rightX, top - reach],
      [leftX, top + height + reach],
      [rightX, top + height + reach],
    ],
    top,
    width,
  };
}

/** Lays one item out at `size` pixels. */
function layItem(context: Paint2D, item: DataItem, env: Env, size: number): LaidItem {
  const type = env.settings.type;
  const wordmark = item.style === "wordmark";
  const stretch = wordmark ? WORDMARK_STRETCH : 1;
  const font = `${type.fontWeight} ${size.toFixed(2)}px ${fontStackFor(type)}`;
  const letterSpacing = `${((type.letterSpacing + (wordmark ? WORDMARK_TRACKING : 0)) * size).toFixed(2)}px`;
  context.font = font;
  context.letterSpacing = letterSpacing;
  const lines = itemLines(item.text, type.textCase).map((line) =>
    wordmark ? wordmarkLine(context, line) : plainLine(context, line),
  );
  const cap = capHeight(context, size);
  const advance = context.measureText("0").width;
  const lineStep = size * type.lineHeight;
  const { sheet } = env;
  const px = sheet.left + ((item.position.x + 1) / 2) * sheet.size;
  const py = sheet.top + ((item.position.y + 1) / 2) * sheet.size;
  const base = { advance, anchorX: px, anchorY: py, cap, font, letterSpacing, lines, lineStep, size, stretch, style: item.style };

  if (item.style === "boxed") {
    const box = boxFor(lines, cap, size, lineStep, px, py);
    const padX = size * 0.7;
    const bounds = {
      bottom: box.targets[2][1] + box.square / 2,
      left: box.left,
      right: box.left + box.width,
      top: box.targets[0][1] - box.square / 2,
    };
    return { ...base, bounds, box, bullet: null, x: box.left + padX, y: box.top + size * 0.62 + cap / 2 };
  }

  const textWidth = Math.max(0, ...lines.map((line) => line.width)) * stretch;
  const bounds = {
    bottom: py + (Math.max(1, lines.length) - 1) * lineStep + cap / 2 + size * 0.25,
    left: px,
    right: px + textWidth,
    top: py - cap / 2 - size * 0.1,
  };
  let bullet: LaidItem["bullet"] = null;
  if (item.style === "bullet") {
    const side = Math.max(3, size * 0.75);
    const left = px - Math.max(env.column, size * 1.8);
    bullet = { side, x: left + side / 2, y: py };
    bounds.left = Math.min(bounds.left, left);
  }
  return { ...base, bounds, box: null, bullet, x: px, y: py };
}

function unionOf(items: readonly LaidItem[]): Bounds | null {
  let block: Bounds | null = null;
  for (const item of items) {
    if (item.lines.length === 0) continue;
    const b = item.bounds;
    block = block
      ? {
          bottom: Math.max(block.bottom, b.bottom),
          left: Math.min(block.left, b.left),
          right: Math.max(block.right, b.right),
          top: Math.min(block.top, b.top),
        }
      : { ...b };
  }
  return block;
}

/** The centred square the items are placed in. */
export function sheetOf(frame: Readonly<{ height: number; width: number }>): DataSheet {
  const size = Math.min(frame.width, frame.height);
  return { left: (frame.width - size) / 2, size, top: (frame.height - size) / 2 };
}

/** Where an item reaches at its own size, or null when it has no text. */
function reachOf(laid: LaidItem): Reach | null {
  return laid.lines.length > 0 ? { bounds: laid.bounds, x: laid.anchorX, y: laid.anchorY } : null;
}

/**
 * Each item's type size in pixels: its own size on this sheet, scaled by the
 * font picker's size as far as the fit allows. Measures every item once at
 * its own size to find out.
 */
function fittedSizes(context: Paint2D, env: Env, area: Bounds): number[] {
  const { settings, sheet } = env;
  const own = settings.items.map((item) => Math.max(4, (item.size * sheet.size) / 1080));
  const reaches = settings.items.map((item, index) => reachOf(layItem(context, item, env, own[index] ?? 4)));
  const scales = fitScales(reaches, area, settings.type.fontSize / 16);
  return own.map((size, index) => {
    const fit = scales[index] ?? 1;
    return Math.abs(fit - 1) < 1e-4 ? size : Math.max(3, size * fit);
  });
}

let cached: { key: string; layout: DataLayout } | null = null;

/** The laid-out items for a frame size, rebuilt only when an input changes. */
export function layoutDataText(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  settings: DataTextSettings,
): DataLayout {
  const type = settings.type;
  // Widths measured before the face lands are the fallback's, so readiness
  // is part of the key and the layout is rebuilt once the font arrives.
  const key = [
    JSON.stringify(settings.items),
    type.fontId,
    type.fontSize,
    type.fontWeight,
    type.letterSpacing,
    type.lineHeight,
    type.textCase,
    frame.width.toFixed(1),
    frame.height.toFixed(1),
    isFontReady(type),
  ].join("|");
  if (cached && cached.key === key) return cached.layout;

  const sheet = sheetOf(frame);
  // Marks size with the sheet alone, so a larger type size only grows text.
  const unit = Math.max(3, (16 * sheet.size) / 1080);
  const env: Env = {
    column: (sheet.size * (1 - GRID_MARGIN * 2)) / GRID_COLUMNS,
    settings,
    sheet,
  };
  const edge = sheet.size * EDGE_MARGIN;
  const area = { bottom: frame.height - edge, left: edge, right: frame.width - edge, top: edge };
  context.save();
  const sizes = fittedSizes(context, env, area);
  const items = settings.items.map((item, index) => layItem(context, item, env, sizes[index] ?? 4));
  context.restore();
  const layout: DataLayout = {
    block: unionOf(items),
    height: frame.height,
    items,
    marker: Math.max(2, unit * 0.72),
    sheet,
    unit,
    width: frame.width,
  };
  cached = { key, layout };
  return layout;
}
