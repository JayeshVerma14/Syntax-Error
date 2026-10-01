/**
 * A subtle CRT monitor pass over the finished frame: faint scanlines that
 * crawl slowly down the screen, and a soft band of light rolling over it the
 * way a tube's refresh bar does, with optional film grain boiling over the
 * whole picture. It draws last, above the sheet, the code roll and every
 * caption, so the whole picture reads as one screen.
 *
 * Motion is a whole number of cycles per timeline loop, so the loop seam is
 * invisible, and every frame is a pure function of loop progress.
 */

import type { Paint2D } from "./engine-units";
import { readBoolean, readNumber, type Values } from "./engine-values";

export const crtTargets = {
  band: "crt.band",
  enabled: "crt.enabled",
  grain: "crt.grain",
  passes: "crt.passes",
  spacing: "crt.spacing",
  strength: "crt.strength",
} as const;

export type CrtSettings = Readonly<{
  /** 0..100: brightness of the rolling band. */
  band: number;
  enabled: boolean;
  /** 0..100: how strong the film grain is. */
  grain: number;
  /** Whole band passes per timeline loop. */
  passes: number;
  /** Scanline pitch in frame pixels. */
  spacing: number;
  /** 0..100: how dark the scanlines are. */
  strength: number;
}>;

export const MIN_CRT_SPACING = 2;
export const MAX_CRT_SPACING = 12;
export const MAX_CRT_PASSES = 4;

export function readCrt(values: Values): CrtSettings {
  return {
    band: Math.min(100, Math.max(0, readNumber(values, crtTargets.band, 35))),
    enabled: readBoolean(values, crtTargets.enabled, false),
    grain: Math.min(100, Math.max(0, readNumber(values, crtTargets.grain, 0))),
    passes: Math.min(
      MAX_CRT_PASSES,
      Math.max(1, Math.round(readNumber(values, crtTargets.passes, 1))),
    ),
    spacing: Math.min(
      MAX_CRT_SPACING,
      Math.max(MIN_CRT_SPACING, readNumber(values, crtTargets.spacing, 4)),
    ),
    strength: Math.min(100, Math.max(0, readNumber(values, crtTargets.strength, 30))),
  };
}

/** Scanlines crawl this many line pitches for each pass of the band. */
const CRAWL_PITCHES_PER_PASS = 6;
/** The band's height as a share of the frame. */
const BAND_SHARE = 0.24;
const BAND_STRIPS = 24;
/** A faint shimmer in the scanlines, in whole cycles per band pass. */
const SHIMMER_PER_PASS = 30;

export type CrtPhase = Readonly<{
  /** Top of the band as a share of the frame; it enters above and leaves below. */
  bandTop: number;
  /** Scanline offset within one pitch, 0..1. */
  crawl: number;
  /** Multiplier on scanline darkness, close to 1. */
  shimmer: number;
}>;

/** Where the CRT motion sits at a loop position; progress 0 and 1 agree. */
export function crtPhase(progress: number, passes: number): CrtPhase {
  const wrapped = ((progress % 1) + 1) % 1;
  const pass = wrapped * passes;
  const bandTravel = pass - Math.floor(pass);
  const crawl = (pass * CRAWL_PITCHES_PER_PASS) % 1;
  return {
    bandTop: -BAND_SHARE + bandTravel * (1 + BAND_SHARE),
    crawl,
    shimmer: 1 + 0.06 * Math.sin(pass * SHIMMER_PER_PASS * Math.PI * 2),
  };
}

/** Grain re-rolls this many times per second, like film. */
const GRAIN_FPS = 24;
const GRAIN_TILE = 256;
let grainTile: OffscreenCanvas | null = null;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 97, 2_654_435_761) ^ Math.imul(salt + 13, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/**
 * One tile of speckle, built once: light and dark specks with a faint tint,
 * mostly clear so the picture shows through.
 */
function grainSource(): OffscreenCanvas | null {
  if (grainTile) return grainTile;
  if (typeof OffscreenCanvas === "undefined") return null;
  const tile = new OffscreenCanvas(GRAIN_TILE, GRAIN_TILE);
  const context = tile.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(GRAIN_TILE, GRAIN_TILE);
  const data = image.data;
  for (let index = 0; index < GRAIN_TILE * GRAIN_TILE; index += 1) {
    const value = hash(index, 1);
    const light = value > 0.5;
    const tint = hash(index, 2);
    data[index * 4] = light ? 200 + 55 * tint : 20 * tint;
    data[index * 4 + 1] = light ? 200 + 55 * hash(index, 3) : 10;
    data[index * 4 + 2] = light ? 255 : 40 + 40 * tint;
    data[index * 4 + 3] = Math.round(Math.abs(value - 0.5) * 2 * 255);
  }
  context.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

/** Film grain over the frame, re-rolled on a steady beat that closes the loop. */
function drawGrain(
  context: Paint2D,
  width: number,
  height: number,
  strength: number,
  progress: number,
  loopSeconds: number,
): void {
  const tile = grainSource();
  if (!tile || strength <= 0) return;
  const ticks = Math.max(1, Math.round(loopSeconds * GRAIN_FPS));
  const tick = Math.floor((((progress % 1) + 1) % 1) * ticks) % ticks;
  // Specks two pixels wide on a 1080 frame, and as coarse at any export size.
  const size = GRAIN_TILE * 2 * Math.max(0.5, width / 1080);
  const offsetX = -hash(tick, 7) * size;
  const offsetY = -hash(tick, 8) * size;
  const stamp = (x: number, y: number) => context.drawImage(tile, x, y, size, size);
  context.imageSmoothingEnabled = false;
  context.globalAlpha = Math.min(1, (strength / 100) * 0.7);
  for (let y = offsetY; y < height; y += size) {
    for (let x = offsetX; x < width; x += size) stamp(x, y);
  }
  context.imageSmoothingEnabled = true;
}

export function drawCrt(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  crt: CrtSettings,
  progress: number,
  loopSeconds = 4,
): void {
  if (!crt.enabled) return;
  const { height, width } = frame;
  const phase = crtPhase(progress, crt.passes);
  const lineAlpha = Math.min(0.6, (crt.strength / 100) * 0.45 * phase.shimmer);

  context.save();
  context.globalCompositeOperation = "source-over";

  // Scanlines: the dark half of every pitch, moved down by the crawl.
  if (lineAlpha > 0) {
    const pitch = crt.spacing;
    const thickness = Math.max(1, pitch * 0.5);
    context.fillStyle = "#000000";
    context.globalAlpha = lineAlpha;
    for (let y = (phase.crawl - 1) * pitch; y < height; y += pitch) {
      context.fillRect(0, y, width, thickness);
    }
  }

  // The rolling band: a soft bar of light, brightest in its middle.
  const bandAlpha = (crt.band / 100) * 0.12;
  if (bandAlpha > 0) {
    const bandHeight = height * BAND_SHARE;
    const top = phase.bandTop * height;
    const strip = bandHeight / BAND_STRIPS;
    context.fillStyle = "#FFFFFF";
    for (let index = 0; index < BAND_STRIPS; index += 1) {
      const middle = (index + 0.5) / BAND_STRIPS;
      const falloff = Math.sin(middle * Math.PI) ** 2;
      context.globalAlpha = bandAlpha * falloff;
      context.fillRect(0, top + index * strip, width, strip + 0.5);
    }
  }
  drawGrain(context, width, height, crt.grain, progress, loopSeconds);
  context.restore();
}
