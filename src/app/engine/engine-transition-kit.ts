/**
 * Shared pieces of the transition fillers: a small integer hash, easing, the
 * colours a filler paints with, where a filler is between covering and
 * uncovering, and the texture of its dark hold (a faint large grid and sparse
 * flickering glints stamped from one soft flare sprite).
 *
 * Styles paint in their own axes: travel always runs up the canvas, from the
 * bottom edge to the top, and the caller turns the canvas for other directions.
 * A beat flashes the dark's grid and lights more glints; the highs sparkle the
 * glints and the grain, and the mids breathe the grid.
 *
 * Everything is drawn with fillRect and drawImage, never with many-rect paths
 * or clip(): on a GPU canvas those cost tens of milliseconds a frame. The dark
 * is handed around as a list of rectangles, and its texture is laid inside
 * those rectangles only.
 */

import type { TransitionDrive } from "./engine-transition-audio";
import type { Paint2D } from "./engine-units";

export function hash(value: number, salt: number): number {
  let h = Math.imul(value + 419, 2_654_435_761) ^ Math.imul(salt + 13, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const easeInCubic = (t: number) => t * t * t;
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export type Rgb = Readonly<{ b: number; g: number; r: number }>;

export const WHITE: Rgb = { b: 255, g: 255, r: 255 };

export function hexToRgb(hex: string): Rgb {
  const value = /^#[0-9A-F]{6}$/i.test(hex) ? Number.parseInt(hex.slice(1), 16) : 0xffffff;
  return { b: value & 255, g: (value >> 8) & 255, r: (value >> 16) & 255 };
}

export function mixRgb(from: Rgb, to: Rgb, share: number): Rgb {
  return {
    b: from.b + (to.b - from.b) * share,
    g: from.g + (to.g - from.g) * share,
    r: from.r + (to.r - from.r) * share,
  };
}

export function rgba(color: Rgb, alpha: number): string {
  return `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${clamp01(alpha).toFixed(3)})`;
}

/** Everything one style needs to paint a frame, in the filler's own axes. */
export type TransitionPaint = Readonly<{
  /** Side of one grid pixel, in frame units. */
  block: number;
  context: Paint2D;
  /** 0..1: opacity of the cover at full strength. */
  cover: number;
  /** The music; all zeros in silence. */
  drive: TransitionDrive;
  /** CSS colour of the cover. */
  fill: string;
  glow: Rgb;
  height: number;
  /** Share of the filler spent fully covered; the cut sits in it. Merged fillers hold longer. */
  hold: number;
  /** The white-hot core of the glow colour. */
  hot: Rgb;
  /** 0..1. */
  intensity: number;
  /** Frame-to-device scale, so sprites stay sharp in a 4K export. */
  scale: number;
  /** Differs per filler, so each cut looks its own. */
  seed: number;
  /** Flicker clock: 24 steps a second, counted from the cut. */
  tick: number;
  /** 0..1 through the filler; the cut is at 0.5. */
  u: number;
  /** The frame's shorter side, for light that keeps its size whatever the block count. */
  unit: number;
  width: number;
}>;

export type Stage = Readonly<{
  /** 0..1 progress of the covering pass; 1 once covered. */
  enter: number;
  /** 0..1 progress of the uncovering pass; 0 until it starts. */
  leave: number;
}>;

/**
 * Share of the filler one pass takes. Merged fillers hold far longer than
 * the Hold control allows, so the hold may come close to 1.
 */
export function passShare(hold: number): number {
  return Math.max(0.005, (1 - Math.min(0.99, Math.max(0, hold))) / 2);
}

/** Splits the filler into its covering pass, the held cover and the uncovering pass. */
export function stageOf(u: number, hold: number): Stage {
  const pass = passShare(hold);
  return { enter: clamp01(u / pass), leave: clamp01((u - (1 - pass)) / pass) };
}

/** Grid lines fall on the frame centre, so the pixels sit symmetric. */
export function gridStart(size: number, block: number): number {
  return size / 2 - Math.ceil(size / 2 / block) * block;
}

const SPRITE_PIXELS = 96;
let cachedSprite: { key: string; sprite: OffscreenCanvas | null } | null = null;

/** A soft round flare with a faint cross streak, stamped for glints and hot corners. */
export function flareSprite(color: Rgb): OffscreenCanvas | null {
  const key = `${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)}`;
  if (cachedSprite && cachedSprite.key === key) return cachedSprite.sprite;
  let sprite: OffscreenCanvas | null = null;
  if (typeof OffscreenCanvas !== "undefined") {
    sprite = new OffscreenCanvas(SPRITE_PIXELS, SPRITE_PIXELS);
    const paint = sprite.getContext("2d");
    if (paint) paintFlare(paint, color);
    else sprite = null;
  }
  cachedSprite = { key, sprite };
  return sprite;
}

function paintFlare(paint: OffscreenCanvasRenderingContext2D, color: Rgb): void {
  const middle = SPRITE_PIXELS / 2;
  const halo = paint.createRadialGradient(middle, middle, 0, middle, middle, middle);
  halo.addColorStop(0, rgba(WHITE, 1));
  halo.addColorStop(0.08, rgba(mixRgb(color, WHITE, 0.6), 0.9));
  halo.addColorStop(0.3, rgba(color, 0.28));
  halo.addColorStop(1, rgba(color, 0));
  paint.fillStyle = halo;
  paint.fillRect(0, 0, SPRITE_PIXELS, SPRITE_PIXELS);
  // Thin streaks, brightest at the centre, fading along both axes.
  const streak = paint.createLinearGradient(0, 0, SPRITE_PIXELS, 0);
  streak.addColorStop(0, rgba(color, 0));
  streak.addColorStop(0.5, rgba(WHITE, 0.85));
  streak.addColorStop(1, rgba(color, 0));
  paint.fillStyle = streak;
  paint.fillRect(0, middle - 1, SPRITE_PIXELS, 2);
  paint.setTransform(0, 1, 1, 0, 0, 0);
  paint.fillRect(0, middle - 1, SPRITE_PIXELS, 2);
  paint.setTransform(1, 0, 0, 1, 0, 0);
}

/** Stamps flares centred on points; bound before loops so they pass numbers only. */
export function flareStamper(
  paint: TransitionPaint,
): (x: number, y: number, radius: number, alpha: number) => void {
  const sprite = flareSprite(paint.glow);
  const context = paint.context;
  if (!sprite) return () => undefined;
  return (x, y, radius, alpha) => {
    if (alpha <= 0.004 || radius <= 0) return;
    context.globalAlpha = clamp01(alpha);
    context.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  };
}

/** The dark as x, y, width, height quadruples; null is the whole canvas. */
export type DarkRects = readonly number[] | null;

/** Fills x, y, width, height quadruples with one style. */
export function fillQuads(paint: TransitionPaint, quads: readonly number[], style: CanvasPattern | string): void {
  if (quads.length === 0) return;
  const context = paint.context;
  context.fillStyle = style;
  for (let index = 0; index < quads.length; index += 4) {
    context.fillRect(quads[index], quads[index + 1], quads[index + 2], quads[index + 3]);
  }
}

/** The cover itself: the dark rectangles at the cover's opacity, then their texture. */
export function fillDark(paint: TransitionPaint, quads: readonly number[], texture: number): void {
  if (quads.length === 0) return;
  paint.context.globalAlpha = paint.cover;
  fillQuads(paint, quads, paint.fill);
  paint.context.globalAlpha = 1;
  drawDarkTexture(paint, texture, quads);
}

/** Whether a point lies in one of the rectangles; bound once, so loops pass numbers only. */
function insideOf(quads: readonly number[]): (x: number, y: number) => boolean {
  return (x, y) => {
    for (let index = 0; index < quads.length; index += 4) {
      const left = quads[index];
      const top = quads[index + 1];
      if (x >= left && y >= top && x < left + quads[index + 2] && y < top + quads[index + 3]) return true;
    }
    return false;
  };
}

/**
 * The texture of the dark: a faint grid on the pixel lines and a few tiny
 * clusters of lit pixels that flicker on and off, laid inside `dark` only.
 */
export function drawDarkTexture(paint: TransitionPaint, amount: number, dark: DarkRects): void {
  const strength = amount * paint.intensity;
  if (strength <= 0.01) return;
  const quads = dark ?? [0, 0, paint.width, paint.height];
  drawGridLines(paint, strength, quads);
  drawGlints(paint, strength, dark === null ? null : insideOf(quads));
}

/**
 * Rectangles may overlap their neighbours by up to this much, to hide seams;
 * a grid line this close to a rectangle's far edge belongs to the neighbour.
 */
const SEAM = 0.5;

/**
 * Grid lines inside each rectangle. A rectangle owns the lines on its left
 * and top edges and not those on its right and bottom ones, so a line shared
 * by two neighbours is drawn once.
 */
function drawGridLines(paint: TransitionPaint, strength: number, quads: readonly number[]): void {
  const { block, context, drive, height, width } = paint;
  const line = Math.max(1, block * 0.012);
  const x0 = gridStart(width, block);
  const y0 = gridStart(height, block);
  const firstLine = (from: number, origin: number) => origin + Math.ceil((from - SEAM - origin) / block) * block;
  const slack = SEAM;
  context.globalAlpha = 1;
  // A beat lights the grid up, as if a flash exposed it; the mids breathe it.
  context.fillStyle = rgba(paint.glow, 0.07 * strength * (1 + 1.5 * drive.mid + 5 * drive.beat));
  for (let index = 0; index < quads.length; index += 4) {
    const left = quads[index];
    const top = quads[index + 1];
    const right = left + quads[index + 2];
    const bottom = top + quads[index + 3];
    for (let x = firstLine(left, x0); x < right - slack; x += block) {
      context.fillRect(x - line / 2, top, line, bottom - top);
    }
    for (let y = firstLine(top, y0); y < bottom - slack; y += block) {
      context.fillRect(left, y - line / 2, right - left, line);
    }
  }
}

type Inside = ((x: number, y: number) => boolean) | null;

function drawGlints(paint: TransitionPaint, strength: number, inside: Inside): void {
  const { block, context, drive, height, seed, tick, width } = paint;
  const dot = Math.max(1, block / 26);
  const room = Math.max(0.5, (width * height) / (block * block * 64));
  const sites = Math.round(26 * strength * room * (1 + 1.2 * drive.high + 2 * drive.beat));
  // A beat lights more of them at once.
  const lit = 0.34 + 0.4 * drive.beat;
  const stamp = flareStamper(paint);
  const halos: number[] = [];
  context.globalAlpha = 1;
  context.fillStyle = rgba(paint.hot, 0.85);
  for (let site = 0; site < sites; site += 1) {
    const salt = seed * 131 + site;
    // Each site blinks for a few ticks at a time, then rests.
    const blink = Math.floor((tick + hash(salt, 1) * 7) / 3);
    if (hash(salt, blink + 17) > lit) continue;
    const x = Math.floor((hash(salt, 2) * width) / dot) * dot;
    const y = Math.floor((hash(salt, 3) * height) / dot) * dot;
    if (inside && !inside(x, y)) continue;
    const shape = Math.floor(hash(salt, blink + 5) * 16);
    context.fillRect(x, y, dot, dot);
    if (shape & 1) context.fillRect(x + dot, y, dot, dot);
    if (shape & 2) context.fillRect(x, y + dot * 2, dot * 3, dot);
    if (shape & 4) context.fillRect(x - dot * 2, y + dot, dot, dot * 2);
    if (shape & 8) halos.push(x + dot / 2, y + dot / 2);
  }
  for (let index = 0; index < halos.length; index += 2) {
    stamp(halos[index], halos[index + 1], dot * 7, 0.45 * strength * (1 + drive.beat));
  }
  context.globalAlpha = 1;
}

const GRAIN_PIXELS = 256;
let cachedGrain: OffscreenCanvas | null | undefined;

/** A tile of light and dark specks of random strength, made once. */
function grainTile(): OffscreenCanvas | null {
  if (cachedGrain !== undefined) return cachedGrain;
  cachedGrain = null;
  if (typeof OffscreenCanvas === "undefined" || typeof ImageData === "undefined") return null;
  const canvas = new OffscreenCanvas(GRAIN_PIXELS, GRAIN_PIXELS);
  const paint = canvas.getContext("2d");
  if (!paint) return null;
  const image = new ImageData(GRAIN_PIXELS, GRAIN_PIXELS);
  fillGrain(image.data);
  paint.putImageData(image, 0, 0);
  cachedGrain = canvas;
  return canvas;
}

function fillGrain(data: Uint8ClampedArray): void {
  for (let index = 0; index < GRAIN_PIXELS * GRAIN_PIXELS; index += 1) {
    const value = hash(index, 71);
    const tone = value > 0.5 ? 255 : 0;
    data[index * 4] = tone;
    data[index * 4 + 1] = tone;
    data[index * 4 + 2] = tone;
    data[index * 4 + 3] = Math.abs(value - 0.5) * 510;
  }
}

/**
 * Film grain over the dark and nowhere else, one device pixel per speck,
 * jumping to a new place every flicker step.
 */
export function drawGrain(paint: TransitionPaint, amount: number, dark: DarkRects): void {
  const strength = amount * paint.intensity;
  const tile = strength > 0.01 ? grainTile() : null;
  if (!tile) return;
  const { context, height, scale, tick, width } = paint;
  const pattern = context.createPattern(tile, "repeat");
  if (!pattern) return;
  const span = GRAIN_PIXELS / scale;
  pattern.setTransform({ a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: hash(tick, 3) * span, f: hash(tick, 4) * span });
  // The highs boil the grain.
  context.globalAlpha = 0.16 * strength * (1 + 0.8 * paint.drive.high);
  fillQuads(paint, dark ?? [0, 0, width, height], pattern);
  context.globalAlpha = 1;
}
