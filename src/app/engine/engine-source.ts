/**
 * Source material becomes one sampled tone grid. Everything downstream reads
 * that grid, so image, vector, footage, and wordmark sources stay
 * interchangeable for the grid, unit, tone, and palette stages.
 *
 * Decoded drawables are cached per media resource. The React canvas registers
 * the object URL runtime resolved for an asset; the export renderer awaits the
 * same entry so an artifact is never silently empty. Footage frames come from
 * `engine-footage`, which owns the only media element.
 */

import { MAX_CELLS_PER_AXIS, MIN_CELL_PX } from "./engine-constants";
import { applyTextCase, fontStackFor } from "./engine-fonts";
import { releaseFootage } from "./engine-footage";
import type { TypeSettings } from "./engine-settings";

export type SourceGrid = Readonly<{
  /** Linear RGB triples per cell, row-major, parallel to `tone`. */
  color: Float32Array;
  cols: number;
  rows: number;
  /** Perceptual luminance in 0..1, row-major. */
  tone: Float32Array;
}>;

/** Image and SVG sources both decode to an image element. */
type Drawable = HTMLImageElement;

type CacheEntry = {
  drawable?: Drawable;
  error?: boolean;
  pending?: Promise<Drawable | null>;
  url: string;
};

const drawables = new Map<string, CacheEntry>();

const IMAGE_POLL_MS = 16;
const IMAGE_TIMEOUT_MS = 30_000;

/**
 * Resolves once the image has loaded, or null when it is broken or never
 * loads. Load state is polled rather than awaited through `decode()`, which
 * only settles after the page renders a frame and so stalls in a background
 * tab. A loaded image always reports a natural size; a broken one reports 0.
 */
function decodeImage(url: string): Promise<Drawable | null> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  const started = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (image.complete) {
        resolve(image.naturalWidth > 0 ? image : null);
      } else if (performance.now() - started > IMAGE_TIMEOUT_MS) {
        resolve(null);
      } else {
        setTimeout(check, IMAGE_POLL_MS);
      }
    };
    check();
  });
}

/** Registers the runtime-resolved object URL for one still source asset. */
export function loadStillSource(
  resourceRef: string,
  url: string,
): Promise<Drawable | null> {
  const existing = drawables.get(resourceRef);
  if (existing && existing.url === url) {
    if (existing.drawable) return Promise.resolve(existing.drawable);
    if (existing.pending) return existing.pending;
    if (existing.error) return Promise.resolve(null);
  }
  const pending = decodeImage(url).then((drawable) => {
    const entry = drawables.get(resourceRef);
    if (entry && entry.url === url) {
      entry.drawable = drawable ?? undefined;
      entry.error = drawable === null;
      entry.pending = undefined;
    }
    return drawable;
  });
  drawables.set(resourceRef, { pending, url });
  return pending;
}

export function peekStillSource(resourceRef: string): Drawable | null {
  return drawables.get(resourceRef)?.drawable ?? null;
}

export function awaitStillSource(
  resourceRef: string,
): Promise<Drawable | null> {
  const entry = drawables.get(resourceRef);
  if (!entry) return Promise.resolve(null);
  if (entry.drawable) return Promise.resolve(entry.drawable);
  return entry.pending ?? Promise.resolve(null);
}

export function releaseSources(activeRefs: readonly string[]): void {
  const active = new Set(activeRefs);
  for (const key of [...drawables.keys()]) {
    if (!active.has(key)) drawables.delete(key);
  }
  releaseFootage(active);
}

/** A detached 2D surface at sampling resolution; it never enters the page. */
function createBuffer(
  width: number,
  height: number,
): OffscreenCanvasRenderingContext2D | null {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  return canvas.getContext("2d", { willReadFrequently: true });
}

/**
 * The decoded source at a fixed sampling resolution, independent of cell
 * size. Summed-area tables of premultiplied RGB let any grid resolution be
 * averaged out of it in constant time per cell, so changing or keyframing the
 * cell size never re-decodes the source.
 */
export type SourceRaster = Readonly<{
  blue: Uint32Array;
  green: Uint32Array;
  height: number;
  red: Uint32Array;
  width: number;
}>;

/**
 * Sampling resolution for a frame: the finest grid the frame can hold (one
 * sample per minimum cell), capped so a large artboard stays bounded. The
 * grid itself is capped at the same size per axis, so it never outresolves
 * this raster.
 */
function sampleSize(
  frameWidth: number,
  frameHeight: number,
): { height: number; width: number } {
  const longEdge = Math.max(1, frameWidth, frameHeight);
  const scale = Math.min(1 / MIN_CELL_PX, MAX_CELLS_PER_AXIS / longEdge);
  return {
    height: Math.max(1, Math.round(frameHeight * scale)),
    width: Math.max(1, Math.round(frameWidth * scale)),
  };
}

/** Builds 32-bit summed-area tables with a zero border row and column. */
function toRaster(
  context: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): SourceRaster {
  const pixels = context.getImageData(0, 0, width, height).data;
  const stride = width + 1;
  const red = new Uint32Array(stride * (height + 1));
  const green = new Uint32Array(stride * (height + 1));
  const blue = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowRed = 0;
    let rowGreen = 0;
    let rowBlue = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = pixels[offset + 3];
      // Premultiplied, so transparent areas carry no tone.
      rowRed += Math.round((pixels[offset] * alpha) / 255);
      rowGreen += Math.round((pixels[offset + 1] * alpha) / 255);
      rowBlue += Math.round((pixels[offset + 2] * alpha) / 255);
      const cell = (y + 1) * stride + (x + 1);
      const above = y * stride + (x + 1);
      red[cell] = red[above] + rowRed;
      green[cell] = green[above] + rowGreen;
      blue[cell] = blue[above] + rowBlue;
    }
  }
  return { blue, green, height, red, width };
}

/** Scales a drawable to cover the target, cropping overflow like the canvas rule. */
function coverRect(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): { height: number; width: number; x: number; y: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { height, width, x: 0, y: 0 };
  }
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    height: drawHeight,
    width: drawWidth,
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
  };
}

export function rasterizeDrawable(
  drawable: Drawable,
  frameWidth: number,
  frameHeight: number,
): SourceRaster | null {
  const size = sampleSize(frameWidth, frameHeight);
  const context = createBuffer(size.width, size.height);
  if (!context) return null;
  const rect = coverRect(drawable.width, drawable.height, size.width, size.height);
  context.clearRect(0, 0, size.width, size.height);
  context.drawImage(drawable, rect.x, rect.y, rect.width, rect.height);
  return toRaster(context, size.width, size.height);
}

export function rasterizeFootage(
  element: HTMLVideoElement,
  frameWidth: number,
  frameHeight: number,
): SourceRaster | null {
  const videoWidth = element.videoWidth;
  const videoHeight = element.videoHeight;
  if (videoWidth <= 0 || videoHeight <= 0) return null;
  const size = sampleSize(frameWidth, frameHeight);
  const context = createBuffer(size.width, size.height);
  if (!context) return null;
  const rect = coverRect(videoWidth, videoHeight, size.width, size.height);
  context.clearRect(0, 0, size.width, size.height);
  context.drawImage(element, rect.x, rect.y, rect.width, rect.height);
  return toRaster(context, size.width, size.height);
}

/**
 * Rasterizes the wordmark at sampling resolution. Typography color and opacity
 * are real tone here: a dimmer wordmark reads as less tone and draws fewer
 * units.
 */
export function rasterizeWordmark(
  text: string,
  type: TypeSettings,
  frameWidth: number,
  frameHeight: number,
): SourceRaster | null {
  const size = sampleSize(frameWidth, frameHeight);
  const context = createBuffer(size.width, size.height);
  if (!context) return null;
  context.clearRect(0, 0, size.width, size.height);
  const content = applyTextCase(text, type.textCase).trim();
  if (content.length === 0) return toRaster(context, size.width, size.height);

  context.save();
  context.scale(size.width / Math.max(1, frameWidth), size.height / Math.max(1, frameHeight));
  context.globalAlpha = type.opacity / 100;
  context.fillStyle = type.color;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const lines = content.split(/\r?\n/);
  let fontSize = type.fontSize;
  const family = fontStackFor(type);
  const applyFont = () => {
    context.font = `${type.fontWeight} ${fontSize}px ${family}`;
    context.letterSpacing = `${(type.letterSpacing * fontSize).toFixed(2)}px`;
  };
  applyFont();

  // Shrink to fit the artboard so a long wordmark never crops to a blank grid.
  const widest = () =>
    lines.reduce((max, line) => Math.max(max, context.measureText(line).width), 0);
  let guard = 0;
  while (widest() > frameWidth * 0.92 && fontSize > 8 && guard < 64) {
    fontSize *= 0.92;
    applyFont();
    guard += 1;
  }
  const lineStep = fontSize * type.lineHeight;
  const blockHeight = lineStep * lines.length;
  const startY = frameHeight / 2 - blockHeight / 2 + lineStep / 2;
  lines.forEach((line, index) => {
    context.fillText(line, frameWidth / 2, startY + index * lineStep);
  });
  context.restore();
  return toRaster(context, size.width, size.height);
}

/**
 * Box-averages the raster into a cols-by-rows grid. Each cell reads four
 * table entries per channel, so a grid of any density costs one pass over its
 * cells and nothing over the source.
 */
export function gridFromRaster(
  raster: SourceRaster,
  cols: number,
  rows: number,
): SourceGrid {
  const tone = new Float32Array(cols * rows);
  const color = new Float32Array(cols * rows * 3);
  const stride = raster.width + 1;
  const bound = (value: number, limit: number) =>
    Math.min(limit, Math.max(0, value));

  for (let row = 0; row < rows; row += 1) {
    const y0 = bound(Math.floor((row * raster.height) / rows), raster.height - 1);
    let y1 = bound(Math.floor(((row + 1) * raster.height) / rows), raster.height);
    if (y1 <= y0) y1 = y0 + 1;
    for (let column = 0; column < cols; column += 1) {
      const x0 = bound(Math.floor((column * raster.width) / cols), raster.width - 1);
      let x1 = bound(Math.floor(((column + 1) * raster.width) / cols), raster.width);
      if (x1 <= x0) x1 = x0 + 1;
      const area = (x1 - x0) * (y1 - y0) * 255;
      const a = y1 * stride + x1;
      const b = y0 * stride + x1;
      const c = y1 * stride + x0;
      const d = y0 * stride + x0;
      const red = (raster.red[a] - raster.red[b] - raster.red[c] + raster.red[d]) / area;
      const green =
        (raster.green[a] - raster.green[b] - raster.green[c] + raster.green[d]) / area;
      const blue =
        (raster.blue[a] - raster.blue[b] - raster.blue[c] + raster.blue[d]) / area;
      const index = row * cols + column;
      tone[index] = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      color[index * 3] = red;
      color[index * 3 + 1] = green;
      color[index * 3 + 2] = blue;
    }
  }
  return { color, cols, rows, tone };
}
