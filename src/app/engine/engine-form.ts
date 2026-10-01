/**
 * Image form: an uploaded image assembles out of glyphs. Every cell the image
 * covers starts as a flickering random character, cycling like a decode, and
 * locks onto the tone character its pixel calls for, until the whole picture
 * stands in one ink. Cells lock in a chosen order (at random, rippling out
 * from the centre, top to bottom, or brightest first) and the formed image
 * holds to the end of the loop.
 *
 * The image is sampled once per upload, grid and size into a tone per cell;
 * every frame is then a pure function of the sequence time.
 */

import { SCRAMBLE_GLYPHS } from "./engine-constants";
import type { Paint2D } from "./engine-units";
import { readBoolean, readHex, readNumber, readString } from "./engine-values";

type Values = Readonly<Record<string, unknown>>;

export const formTargets = {
  cell: "form.cell",
  cover: "form.cover",
  duration: "form.duration",
  enabled: "form.enabled",
  file: "form.file",
  hold: "form.hold",
  ink: "form.ink",
  effect: "form.effect",
  intensity: "form.intensity",
  invert: "form.invert",
  style: "form.style",
  order: "form.order",
  size: "form.size",
  timing: "form.timing",
} as const;

export type FormOrder = "bright" | "centre" | "random" | "top";
export const FORM_ORDERS: readonly FormOrder[] = ["random", "centre", "top", "bright"];
/** Particles: colour blocks gather into the picture, which resolves to the real image. Glyphs: one-ink ASCII decode. */
export type FormStyle = "glyphs" | "particles";
export const FORM_STYLES: readonly FormStyle[] = ["particles", "glyphs"];
/** How the gathered particles turn into the real picture. */
export type FormEffect = "mosaic" | "none";
export const FORM_EFFECTS: readonly FormEffect[] = ["mosaic", "none"];
export type FormTiming = "after" | "start";
export const FORM_TIMINGS: readonly FormTiming[] = ["after", "start"];

export type FormSettings = Readonly<{
  cell: number;
  cover: boolean;
  duration: number;
  enabled: boolean;
  hold: number;
  ink: string;
  effect: FormEffect;
  intensity: number;
  invert: boolean;
  style: FormStyle;
  order: FormOrder;
  size: number;
  timing: FormTiming;
}>;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function readForm(values: Values): FormSettings {
  return {
    cell: clamp(readNumber(values, formTargets.cell, 12), 4, 64),
    cover: readBoolean(values, formTargets.cover, true),
    duration: clamp(readNumber(values, formTargets.duration, 3), 0.2, 30),
    enabled: readBoolean(values, formTargets.enabled, false),
    hold: clamp(readNumber(values, formTargets.hold, 2), 0, 30),
    ink: readHex(values, formTargets.ink, "#FFFFFF"),
    effect: readString(values, formTargets.effect, FORM_EFFECTS, "mosaic"),
    intensity: clamp(readNumber(values, formTargets.intensity, 60), 0, 100),
    invert: readBoolean(values, formTargets.invert, false),
    style: readString(values, formTargets.style, FORM_STYLES, "particles"),
    order: readString(values, formTargets.order, FORM_ORDERS, "random"),
    size: clamp(readNumber(values, formTargets.size, 90), 10, 150),
    timing: readString(values, formTargets.timing, FORM_TIMINGS, "start"),
  };
}

export type FormSchedule = Readonly<{ end: number; formed: number; start: number }>;

/** The layer's place on the sequence clock, or null while it is off. */
export function formSchedule(form: FormSettings, after: number): FormSchedule | null {
  if (!form.enabled) return null;
  const start = form.timing === "start" ? 0 : Math.max(0, Number.isFinite(after) ? after : 0);
  const formed = start + form.duration;
  return { end: formed + form.hold, formed, start };
}

/** Whether the layer hides the sheet at this sequence time. */
export function formCovers(form: FormSettings, plan: FormSchedule | null, time: number): boolean {
  // Holding to the loop end, the image keeps the sheet hidden from its start on.
  return form.cover && plan !== null && time >= plan.start;
}

/** Tone characters from empty to full; the empty step keeps shadows bare. */
const RAMP = [" ", ".", "-", ":", "=", "+", "*", "%", "#", "@"] as const;

/** The image sampled onto the glyph grid. */
export type FormGrid = Readonly<{
  cell: number;
  cols: number;
  /** Top-left of the grid in frame pixels. */
  left: number;
  rows: number;
  /** 0..1 ink per cell, row-major. */
  tone: Float32Array;
  top: number;
  /** The picture itself and where it sits in the frame, for the Particles style. */
  image: CanvasImageSource;
  rect: Readonly<{ height: number; width: number; x: number; y: number }>;
  /** The picture sampled into square blocks of `cell` pixels, RGBA per block. */
  blocks: Readonly<{ cols: number; rgba: Uint8ClampedArray; rows: number; size: number }>;
}>;

let cached: { grid: FormGrid; key: string } | null = null;

/**
 * Samples the image into a tone per cell, fitted inside `size` percent of the
 * frame. Ink is brightness times alpha, so a light logo on a transparent or
 * dark ground forms from its bright parts; Invert flips it for dark art.
 */
export function prepareFormGrid(
  id: string,
  image: CanvasImageSource & { height: number; width: number },
  form: FormSettings,
  frameWidth: number,
  frameHeight: number,
): FormGrid | null {
  const key = [id, form.cell, form.size, form.invert, frameWidth, frameHeight].join("|");
  if (cached?.key === key) return cached.grid;
  if (!(image.width > 0 && image.height > 0) || typeof OffscreenCanvas === "undefined") return null;
  const cell = form.cell;
  // Monospace cells are about 0.6 as wide as they are tall.
  const cellWidth = cell * 0.6;
  const fit = Math.min((frameWidth * form.size) / 100 / image.width, (frameHeight * form.size) / 100 / image.height);
  const cols = Math.max(1, Math.round((image.width * fit) / cellWidth));
  const rows = Math.max(1, Math.round((image.height * fit) / cell));
  const sampler = new OffscreenCanvas(cols, rows);
  const context = sampler.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, cols, rows);
  const pixels = context.getImageData(0, 0, cols, rows).data;
  const tone = new Float32Array(cols * rows);
  for (let index = 0; index < tone.length; index += 1) {
    const offset = index * 4;
    const light = (0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]) / 255;
    const alpha = pixels[offset + 3] / 255;
    tone[index] = (form.invert ? 1 - light : light) * alpha;
  }
  const width = image.width * fit;
  const height = image.height * fit;
  const blockCols = Math.max(1, Math.round(width / cell));
  const blockRows = Math.max(1, Math.round(height / cell));
  const blockSampler = new OffscreenCanvas(blockCols, blockRows);
  const blockContext = blockSampler.getContext("2d", { willReadFrequently: true });
  if (!blockContext) return null;
  blockContext.drawImage(image, 0, 0, blockCols, blockRows);
  const grid: FormGrid = {
    blocks: {
      cols: blockCols,
      rgba: blockContext.getImageData(0, 0, blockCols, blockRows).data,
      rows: blockRows,
      size: cell,
    },
    cell,
    image,
    rect: { height, width, x: (frameWidth - width) / 2, y: (frameHeight - height) / 2 },
    cols,
    left: (frameWidth - cols * cellWidth) / 2,
    rows,
    tone,
    top: (frameHeight - rows * cell) / 2,
  };
  cached = { grid, key };
  return grid;
}

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 61, 2_654_435_761) ^ Math.imul(salt + 29, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** Where a cell falls in the lock order, 0..1. */
function orderOf(form: FormSettings, grid: FormGrid, column: number, row: number, tone: number, seed: number): number {
  const jitter = hash(seed, 2);
  if (form.order === "random") return jitter;
  if (form.order === "top") return clamp(row / Math.max(1, grid.rows - 1) * 0.85 + jitter * 0.15, 0, 1);
  if (form.order === "bright") return clamp((1 - tone) * 0.85 + jitter * 0.15, 0, 1);
  const dx = (column / Math.max(1, grid.cols - 1) - 0.5) * 2;
  const dy = (row / Math.max(1, grid.rows - 1) - 0.5) * 2;
  return clamp((Math.hypot(dx, dy) / Math.SQRT2) * 0.85 + jitter * 0.15, 0, 1);
}

/** Scrambled characters change this many times a second. */
const SCRAMBLE_RATE = 18;

/** Share of Form time spent gathering particles before the picture resolves. */
const GATHER_END = 0.6;

let pixelCanvas: OffscreenCanvas | null = null;

/** Draws the picture at `block`-pixel resolution, hard-edged, like the Mosaic filler. */
function drawPixelated(context: Paint2D, grid: FormGrid, block: number, alpha: number): void {
  const { rect } = grid;
  if (block <= 1.01) {
    context.globalAlpha = alpha;
    context.drawImage(grid.image, rect.x, rect.y, rect.width, rect.height);
    return;
  }
  const cols = Math.max(1, Math.ceil(rect.width / block));
  const rows = Math.max(1, Math.ceil(rect.height / block));
  if (!pixelCanvas || pixelCanvas.width < cols || pixelCanvas.height < rows) {
    pixelCanvas = new OffscreenCanvas(Math.max(cols, pixelCanvas?.width ?? 0), Math.max(rows, pixelCanvas?.height ?? 0));
  }
  const small = pixelCanvas.getContext("2d");
  if (!small) return;
  small.clearRect(0, 0, cols, rows);
  small.imageSmoothingEnabled = true;
  small.drawImage(grid.image, 0, 0, cols, rows);
  context.imageSmoothingEnabled = false;
  context.globalAlpha = alpha;
  context.drawImage(pixelCanvas, 0, 0, cols, rows, rect.x, rect.y, cols * block, rows * block);
  context.imageSmoothingEnabled = true;
}

/**
 * Particles: square blocks in the picture's own colours fly in from a scatter
 * and gather into its shape, then the picture resolves. With Mosaic it comes
 * up as coarse pixels that refine to the crisp image while hot blocks flash
 * and cool across it, as in the Mosaic filler; with None it crossfades.
 */
function drawParticles(
  context: Paint2D,
  form: FormSettings,
  grid: FormGrid,
  progress: number,
  time: number,
): void {
  const { blocks, rect } = grid;
  const size = blocks.size;
  const resolve = clamp((progress - GATHER_END) / (1 - GATHER_END), 0, 1);
  context.save();
  if (resolve < 1) {
    const diagonal = Math.hypot(rect.width, rect.height);
    const fadeOut = 1 - clamp(resolve * 1.6, 0, 1);
    for (let row = 0; row < blocks.rows; row += 1) {
      for (let column = 0; column < blocks.cols; column += 1) {
        const index = row * blocks.cols + column;
        const offset = index * 4;
        const alpha = blocks.rgba[offset + 3];
        if (alpha < 24) continue;
        const dx = (column / Math.max(1, blocks.cols - 1) - 0.5) * 2;
        const dy = (row / Math.max(1, blocks.rows - 1) - 0.5) * 2;
        const jitter = hash(index, 2);
        const order =
          form.order === "random" ? jitter
          : form.order === "top" ? (row / Math.max(1, blocks.rows - 1)) * 0.85 + jitter * 0.15
          : form.order === "bright"
            ? (1 - (blocks.rgba[offset] + blocks.rgba[offset + 1] + blocks.rgba[offset + 2]) / 765) * 0.85 + jitter * 0.15
          : (Math.hypot(dx, dy) / Math.SQRT2) * 0.85 + jitter * 0.15;
        const arrive = order * 0.5 * GATHER_END;
        const travel = clamp((progress - arrive) / (0.5 * GATHER_END), 0, 1);
        if (travel <= 0) continue;
        const eased = 1 - (1 - travel) ** 3;
        const angle = hash(index, 4) * Math.PI * 2;
        const reach = (0.3 + 0.7 * hash(index, 5)) * diagonal * 0.6;
        const targetX = rect.x + (column + 0.5) * (rect.width / blocks.cols);
        const targetY = rect.y + (row + 0.5) * (rect.height / blocks.rows);
        const x = targetX + Math.cos(angle) * reach * (1 - eased);
        const y = targetY + Math.sin(angle) * reach * (1 - eased);
        const side = size * (0.35 + 0.65 * eased);
        context.globalAlpha = clamp(travel * 3, 0, 1) * (alpha / 255) * fadeOut;
        context.fillStyle = `rgb(${blocks.rgba[offset]},${blocks.rgba[offset + 1]},${blocks.rgba[offset + 2]})`;
        context.fillRect(x - side / 2, y - side / 2, side, side);
      }
    }
  }
  if (resolve > 0) {
    if (form.effect === "mosaic" && resolve < 1) {
      // Coarse pixels refine to the crisp picture.
      const coarse = size;
      const block = Math.max(1, Math.round(1 + (coarse - 1) * (1 - resolve) ** 2));
      drawPixelated(context, grid, block, clamp(resolve * 4, 0, 1));
      // Hot blocks flash white and cool, only where the picture has ink.
      const tick = Math.floor(time * 20);
      const flashes = Math.round((form.intensity / 100) * blocks.cols * blocks.rows * 0.06 * (1 - resolve));
      const heat = 1 - resolve;
      for (let flash = 0; flash < flashes; flash += 1) {
        const column = Math.floor(hash(flash, tick * 3 + 1) * blocks.cols);
        const row = Math.floor(hash(flash, tick * 3 + 2) * blocks.rows);
        if (blocks.rgba[(row * blocks.cols + column) * 4 + 3] < 24) continue;
        const cool = hash(flash, tick * 3 + 3);
        context.globalAlpha = heat * (0.35 + 0.6 * cool);
        context.fillStyle = cool > 0.5 ? "#FFFFFF" : "#FFE9A8";
        const pixel = Math.max(block, size);
        const x = rect.x + Math.floor(((column + 0.5) * (rect.width / blocks.cols)) / pixel) * pixel;
        const y = rect.y + Math.floor(((row + 0.5) * (rect.height / blocks.rows)) / pixel) * pixel;
        context.fillRect(x, y, pixel, pixel);
      }
    } else {
      drawPixelated(context, grid, 1, resolve);
    }
  }
  context.restore();
}

export function drawForm(
  context: Paint2D,
  form: FormSettings,
  grid: FormGrid | null | undefined,
  plan: FormSchedule | null,
  time: number,
): void {
  if (!grid || !plan || time < plan.start) return;
  const elapsed = time - plan.start;
  const span = Math.max(1e-6, plan.formed - plan.start);
  if (form.style === "particles") {
    drawParticles(context, form, grid, Math.min(1, elapsed / span), time);
    return;
  }
  const tick = Math.floor(time * SCRAMBLE_RATE);
  const cellWidth = grid.cell * 0.6;
  context.save();
  context.font = `700 ${grid.cell}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = form.ink;
  for (let row = 0; row < grid.rows; row += 1) {
    const y = grid.top + (row + 0.5) * grid.cell;
    for (let column = 0; column < grid.cols; column += 1) {
      const index = row * grid.cols + column;
      const tone = grid.tone[index];
      const step = Math.min(RAMP.length - 1, Math.floor(tone * RAMP.length));
      if (step === 0) continue;
      const seed = index;
      // A cell wakes in order, scrambles for a while, then locks to its tone.
      const order = orderOf(form, grid, column, row, tone, seed);
      const wakes = order * 0.55 * span;
      const locks = wakes + (0.25 + 0.2 * hash(seed, 3)) * span;
      if (elapsed < wakes) continue;
      const glyph =
        elapsed >= Math.min(locks, span)
          ? RAMP[step]
          : SCRAMBLE_GLYPHS[Math.floor(hash(seed, tick + 7) * SCRAMBLE_GLYPHS.length)];
      context.fillText(glyph, grid.left + (column + 0.5) * cellWidth, y);
    }
  }
  context.restore();
}
