/**
 * Data text marks: the square markers and the rules around the labels.
 *
 * Markers dot two rows at the top of the sheet and two at the bottom, in
 * pairs and singles on the labels' column grid, like the reference's
 * registration marks. Each pops in white-hot and cools to the ink colour.
 *
 * A rule starts as one square at the block's edge, stretches into a thin
 * line, then thickens into stepped bars. Above the block the steps rise away
 * from the text; below it the rule is mirrored, growing from the other side.
 * When the text leaves, the steps retract and the line pulls back to a square.
 *
 * Repeat stacks copies of the block up and down the frame a block apart, each
 * with its rule above it, and cuts them off at the marker rows, so partial
 * copies run off the edges like the reference's label sheet.
 *
 * With music, each beat lights the next of the four marker groups white, so
 * they count the beats left to right, and a hard beat jolts the rows a step
 * sideways; beats also lift the stepped bars a step or two. The bass
 * stretches the bars along their rules and the highs make markers twinkle.
 *
 * Every mark is gathered into one path per colour and filled once.
 */

import type { DataTextSettings } from "./engine-datatext";
import {
  markerFlashes,
  markerMusic,
  markerTwinkles,
  rowJolt,
  ruleMusic,
  type DataMusic,
  type RuleMusic,
} from "./engine-datatext-audio";
import { GRID_COLUMNS, GRID_MARGIN, type Bounds, type DataLayout } from "./engine-datatext-layout";
import {
  clamp01,
  dataHash,
  easeInCubic,
  easeOutExpo,
  type DataPlan,
} from "./engine-datatext-timing";
import type { Paint2D } from "./engine-units";

const FLASH = "#FFFFFF";
/** Seconds a new mark shows white before it takes the ink colour. */
const FLASH_SECONDS = 0.07;
/**
 * Pairs and singles on the labels' 12-column grid, the same on every row, so
 * a marker stands over each column a default label starts on.
 */
const MARKER_COLUMNS: readonly number[] = [0, 0.5, 4, 8, 8.5, 12];
/** Which of the four groups each column belongs to: pair, single, pair, single. */
const MARKER_COLUMN_GROUPS: readonly number[] = [0, 0, 1, 2, 2, 3];
/** Seconds over which the markers pop in. */
const MARKER_SPREAD = 0.38;
/** Rules start this long after the first item. */
const RULE_DELAY = 0.05;

/** Most copies Repeat adds on each side of the one the user placed. */
const MAX_COPIES = 12;

type MarkLayout = Pick<DataLayout, "height" | "marker" | "sheet">;

/**
 * Marker row centres: two near the top and two near the bottom of the sheet,
 * or of the whole frame height when the block repeats down it.
 */
export function markerRows(layout: MarkLayout, repeat = false): readonly number[] {
  const { sheet } = layout;
  const top = repeat ? 0 : sheet.top;
  const bottom = repeat ? layout.height : sheet.top + sheet.size;
  const first = Math.max(layout.marker * 1.5, sheet.size * 0.035);
  const second = first + layout.marker * 4.5;
  return [top + first, top + second, bottom - second, bottom - first];
}

/** Every marker's centre, row by row, on the sheet's column grid. */
export function markerCentres(layout: MarkLayout, repeat = false): readonly (readonly [number, number])[] {
  const { sheet } = layout;
  const left = sheet.left + sheet.size * GRID_MARGIN;
  const step = (sheet.size * (1 - GRID_MARGIN * 2)) / GRID_COLUMNS;
  const centres: (readonly [number, number])[] = [];
  for (const y of markerRows(layout, repeat)) {
    for (const column of MARKER_COLUMNS) centres.push([left + column * step, y]);
  }
  return centres;
}

type RuleSize = Readonly<{ gap: number; head: number; step2: number; step3: number; thin: number }>;

function ruleSize(layout: DataLayout): RuleSize {
  const marker = layout.marker;
  return {
    gap: layout.unit * 2.2,
    head: marker,
    step2: marker * 1.8,
    step3: marker * 3,
    thin: Math.max(1.5, marker * 0.62),
  };
}

/** One copy of the block: its vertical offset, and a key that tells copies apart. */
export type DataTile = Readonly<{ dy: number; key: number }>;

/** The copies to draw, and the band they are cut off at; no band without Repeat. */
export type DataTiling = Readonly<{ band: readonly [number, number] | null; tiles: readonly DataTile[] }>;

const SINGLE: DataTiling = { band: null, tiles: [{ dy: 0, key: MAX_COPIES }] };

/**
 * The copies of the block. Without Repeat, the one the user placed. With it,
 * copies a block apart above and below it, each led by its rule, wherever
 * they reach the band between the marker rows (or the whole frame without
 * markers); the band cuts the outer ones off.
 */
export function tileBlock(layout: DataLayout, repeat: boolean, markers: boolean): DataTiling {
  const block = layout.block;
  if (!repeat || !block) return SINGLE;
  const size = ruleSize(layout);
  const rows = markerRows(layout, true);
  const band: readonly [number, number] = markers
    ? [rows[1] + layout.marker / 2 + layout.unit, rows[2] - layout.marker / 2 - layout.unit]
    : [0, layout.height];
  // A copy covers its text, the rule above it and, for the last, the one below.
  const top = block.top - size.gap - size.step3;
  const bottom = block.bottom + size.gap + size.step3;
  const period = block.bottom - block.top + size.gap * 2 + size.step3;
  if (!(period > 1)) return { band, tiles: SINGLE.tiles };
  const tiles: DataTile[] = [];
  for (let k = -MAX_COPIES; k <= MAX_COPIES; k += 1) {
    const dy = k * period;
    if (bottom + dy > band[0] && top + dy < band[1]) tiles.push({ dy, key: k + MAX_COPIES });
  }
  return { band, tiles };
}

/** Rects gathered per colour as x, y, width, height runs, then filled once each. */
type Batch = { flash: number[]; ink: number[] };

function fillBatch(context: Paint2D, rects: readonly number[], color: string): void {
  if (rects.length === 0) return;
  context.fillStyle = color;
  context.beginPath();
  for (let index = 0; index + 3 < rects.length; index += 4) {
    context.rect(rects[index], rects[index + 1], rects[index + 2], rects[index + 3]);
  }
  context.fill();
}

/** Share of the way out, 0..1, once the text starts to leave; 0 before. */
function leaving(plan: DataPlan, time: number): number {
  if (!(time >= plan.leave) || !Number.isFinite(plan.end)) return 0;
  return clamp01((time - plan.leave) / Math.max(1e-3, plan.end - plan.leave));
}

/**
 * The heights each rule can reach once fully stepped, as top and bottom
 * pairs, so marker rows can keep clear of them.
 */
export function ruleBands(layout: DataLayout, tiles: readonly DataTile[]): readonly (readonly [number, number])[] {
  const block = layout.block;
  if (!block) return [];
  const size = ruleSize(layout);
  const bands: (readonly [number, number])[] = tiles.map(({ dy }) => {
    const edge = block.top + dy - size.gap;
    return [edge - size.step3, edge] as const;
  });
  const edge = block.bottom + (tiles[tiles.length - 1]?.dy ?? 0) + size.gap;
  bands.push([edge, edge + size.step3]);
  return bands;
}

/** Whether a marker row would touch one of the bands, with a marker of air. */
function rowBlocked(y: number, side: number, bands: readonly (readonly [number, number])[]): boolean {
  return bands.some(([top, bottom]) => y + side * 1.2 > top && y - side * 1.2 < bottom);
}

export function drawMarkers(
  context: Paint2D,
  layout: DataLayout,
  plan: DataPlan,
  time: number,
  settings: DataTextSettings,
  clear: readonly (readonly [number, number])[],
  music: DataMusic | null = null,
): void {
  const side = layout.marker;
  const out = leaving(plan, time);
  const batch: Batch = { flash: [], ink: [] };
  const beat = markerMusic(music, time);
  // A row a rule runs into is left out whole rather than half hidden.
  const blocked = markerRows(layout, settings.repeat).map((y) => rowBlocked(y, side, clear));
  markerCentres(layout, settings.repeat).forEach(([x, y], index) => {
    const row = Math.floor(index / MARKER_COLUMNS.length);
    if (blocked[row]) return;
    const age = time - (plan.first + MARKER_SPREAD * dataHash(index, 3));
    // Markers wink out one by one while the text leaves.
    if (age < 0 || (out > 0 && out >= 0.1 + 0.85 * dataHash(index, 4))) return;
    let left = x - side / 2;
    let white = age < FLASH_SECONDS;
    if (beat) {
      if (markerTwinkles(beat, index)) return;
      left += rowJolt(beat, row) * side;
      white = white || markerFlashes(beat, index, MARKER_COLUMN_GROUPS[index % MARKER_COLUMNS.length] ?? 0);
    }
    (white ? batch.flash : batch.ink).push(left, y - side / 2, side, side);
  });
  fillBatch(context, batch.ink, settings.type.color);
  fillBatch(context, batch.flash, FLASH);
}

type Rule = Readonly<{
  /** Line edge nearest the block; steps grow away from it. */
  edge: number;
  /** +1 grows steps downward, -1 upward. */
  facing: number;
  left: number;
  /** Grows from the right when mirrored. */
  mirrored: boolean;
  seed: number;
  width: number;
}>;

/** Pushes a span given in shares of the rule's width, mirrored as needed. */
function pushSpan(rects: number[], rule: Rule, from: number, to: number, thickness: number): void {
  if (!(to > from) || thickness <= 0) return;
  const x = rule.mirrored ? rule.left + rule.width * (1 - to) : rule.left + rule.width * from;
  const y = rule.facing > 0 ? rule.edge : rule.edge - thickness;
  rects.push(x, y, rule.width * (to - from), thickness);
}

/** Grows or retracts a step between its shares, as a 0..1 progress. */
function stepSpan(from: number, to: number, grow: number, shrink: number): readonly [number, number] {
  const right = from + (to - from) * grow;
  return [from + (right - from) * shrink, right];
}

/** Where a rule's two steps start and end, in shares of its width, and how thick they are. */
type Steps = Readonly<{ s2a: number; s2b: number; s3a: number; step2: number; step3: number }>;

/**
 * A rule's steps, as the music has them: the bass stretches the bars along
 * the rule, a beat lifts them by half steps that fall back as it decays.
 */
function stepsOf(rule: Rule, size: RuleSize, music: RuleMusic | null): Steps {
  const s2a = 0.04 + 0.08 * dataHash(rule.seed, 1);
  const s2b = 0.58 + 0.14 * dataHash(rule.seed, 2);
  const s3a = s2a + 0.14 + 0.2 * dataHash(rule.seed, 3);
  if (!music) return { s2a, s2b, s3a, step2: size.step2, step3: size.step3 };
  const rise = music.lift * (size.step3 - size.step2) * 0.5;
  return {
    s2a,
    s2b: s2b + (0.97 - s2b) * 0.6 * music.stretch,
    s3a: s3a - (s3a - s2a) * 0.5 * music.stretch,
    step2: size.step2 + rise * 0.5,
    step3: size.step3 + rise,
  };
}

function addRule(batch: Batch, rule: Rule, size: RuleSize, age: number, out: number, music: RuleMusic | null): void {
  if (age < 0 || out >= 1) return;
  const minimum = Math.min(1, size.thin / Math.max(1, rule.width));
  const head = Math.min(1, size.head / Math.max(1, rule.width));
  const steps = stepsOf(rule, size, music);
  const s2b = 0.58 + 0.14 * dataHash(rule.seed, 2);
  // First to the steps' end, then on across the whole width.
  const reach =
    age < 0.08
      ? head
      : age < 0.62
        ? head + (s2b - head) * easeOutExpo((age - 0.08) / 0.5)
        : s2b + (1 - s2b) * easeOutExpo((age - 0.62) / 0.45);
  const pull = Math.min(1 - minimum, easeInCubic(clamp01((out - 0.3) / 0.6)));
  // The head square flattens into the line as it starts to stretch.
  const line = size.thin + (size.head - size.thin) * (1 - clamp01((age - 0.08) / 0.12));
  pushSpan(age < FLASH_SECONDS ? batch.flash : batch.ink, rule, pull, Math.max(pull + minimum, reach), line);
  if (age >= 0.6) {
    const [from, to] = stepSpan(steps.s2a, steps.s2b, easeOutExpo((age - 0.6) / 0.35), easeInCubic(clamp01((out - 0.15) / 0.4)));
    pushSpan(batch.ink, rule, from, to, steps.step2);
  }
  if (age >= 0.8) {
    const [from, to] = stepSpan(steps.s3a, steps.s2b, easeOutExpo((age - 0.8) / 0.3), easeInCubic(clamp01(out / 0.35)));
    pushSpan(batch.ink, rule, from, to, steps.step3);
  }
}

/**
 * The span a rule runs along: the block's own width, squared off to the
 * sheet's grid margins when the block already spans most of the sheet.
 */
function ruleSpan(block: Bounds, layout: DataLayout): readonly [number, number] {
  const { sheet } = layout;
  const left = Math.max(0, block.left);
  const right = Math.min(layout.width, block.right);
  if (right - left < sheet.size * 0.6) return [left, Math.max(left + 1, right)];
  const gridLeft = sheet.left + sheet.size * GRID_MARGIN;
  return [Math.min(left, gridLeft), Math.max(right, sheet.left + sheet.size - (gridLeft - sheet.left))];
}

/** Whether a rule fits the band whole, stepped bars included. */
function ruleInBand(rule: Rule, size: RuleSize, band: readonly [number, number]): boolean {
  const top = rule.facing > 0 ? rule.edge : rule.edge - size.step3;
  return top >= band[0] && top + size.step3 <= band[1];
}

function rulesFor(block: Bounds, layout: DataLayout, size: RuleSize, tiling: DataTiling): Rule[] {
  const [left, right] = ruleSpan(block, layout);
  const width = Math.max(1, right - left);
  const { band, tiles } = tiling;
  // Copies of the block are exact copies, rules included; a repeated copy's
  // rule shows only whole, like its items, while the placed copy's always shows.
  const rules: Rule[] = [];
  for (const { dy } of tiles) {
    const rule = { edge: block.top + dy - size.gap, facing: -1, left, mirrored: false, seed: 11, width };
    if (!band || dy === 0 || ruleInBand(rule, size, band)) rules.push(rule);
  }
  const last = tiles[tiles.length - 1]?.dy ?? 0;
  const closing = { edge: block.bottom + last + size.gap, facing: 1, left, mirrored: true, seed: 97, width };
  if (!band || last === 0 || ruleInBand(closing, size, band)) rules.push(closing);
  return rules;
}

export function drawRules(
  context: Paint2D,
  layout: DataLayout,
  tiling: DataTiling,
  plan: DataPlan,
  time: number,
  settings: DataTextSettings,
  music: DataMusic | null = null,
): void {
  if (!layout.block) return;
  const size = ruleSize(layout);
  const age = time - plan.first - RULE_DELAY;
  const out = leaving(plan, time);
  const batch: Batch = { flash: [], ink: [] };
  const react = ruleMusic(music);
  for (const rule of rulesFor(layout.block, layout, size, tiling)) addRule(batch, rule, size, age, out, react);
  fillBatch(context, batch.ink, settings.type.color);
  fillBatch(context, batch.flash, FLASH);
}
