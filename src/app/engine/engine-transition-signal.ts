/**
 * Two signal fillers.
 *
 * Slice: the picture tears into bands that jump sideways in held glitch
 * steps, while dark slabs slam in from alternating sides. Each leading edge
 * is a white-hot bar with red and cyan fringes and a streak of light trailing
 * behind it, longest while the slab is fastest, so the filler carries its own
 * light over an empty frame. Bright tear bands flash across the frame as the
 * slabs slam shut and again as they break open; then the slabs whip on out
 * the far side to uncover the next shot, which tears and settles.
 *
 * Scan: a CRT beam with a lens streak sweeps through the frame and the
 * picture shuts off behind it, every other line first, like an interlaced
 * tube. Then the tube powers down: a bright line across the middle shrinks to
 * a hot dot and fades. A second beam draws the next shot back in, line by line.
 *
 * A beat jolts the slabs and the torn bands further and flickers more lines
 * across the held dark; under the scan it thickens the beam and the
 * power-down line. The bass swells the beam's glow and warms the slabs' colour
 * fringes and light trails.
 */

import type { TransitionDirection } from "./engine-transition";
import {
  clamp01,
  drawDarkTexture,
  drawGrain,
  easeInCubic,
  easeOutExpo,
  fillDark,
  fillQuads,
  flareStamper,
  hash,
  passShare,
  rgba,
  type Rgb,
  stageOf,
  type TransitionPaint,
} from "./engine-transition-kit";
import type { Paint2D } from "./engine-units";

const RED = { b: 85, g: 42, r: 255 };
const CYAN = { b: 255, g: 245, r: 42 };

function fillHeld(paint: TransitionPaint): void {
  const { context, height, width } = paint;
  context.globalAlpha = paint.cover;
  context.fillStyle = paint.fill;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 1;
  drawDarkTexture(paint, 1, null);
}

const heatOf = (paint: TransitionPaint) => clamp01(0.35 + 0.75 * paint.intensity);

type SliceEdges = {
  cover: number[];
  cyan: number[];
  /** Light trails that brighten towards their right end. */
  fallLeft: number[];
  /** Light trails that brighten towards their left end. */
  fallRight: number[];
  hot: number[];
  red: number[];
};

/** One slab's cover and, while it moves, its hot edge, colour fringes and light trail. */
function slab(paint: TransitionPaint, edges: SliceEdges, index: number, top: number, thickness: number): void {
  const { block, seed, tick, width } = paint;
  const { enter, leave } = stageOf(paint.u, paint.hold);
  const along = clamp01(1 - (top + thickness / 2) / paint.height);
  const fromLeft = (index + (hash(index, seed + 1) < 0.2 ? 1 : 0)) % 2 === 0;
  const covering = enter < 1;
  const pass = covering ? enter : leave;
  const start = 0.5 * along + 0.25 * hash(index, seed + (covering ? 2 : 9));
  const travel = easeOutExpo(clamp01((pass - start) / 0.25));
  const moving = travel > 0 && travel < 1;
  const jitter = moving ? (hash(index, tick + seed) - 0.5) * block * 0.5 * (1 + 2 * paint.drive.beat) : 0;
  const reached = Math.min(width, Math.max(0, travel * width + jitter));
  // The moving edge, and which way it moves; covering, the slab reaches in
  // from its side, uncovering, it carries on out the other.
  const edge = fromLeft ? reached : width - reached;
  const motion = fromLeft ? 1 : -1;
  const from = covering === fromLeft ? 0 : edge;
  const to = covering === fromLeft ? edge : width;
  if (to - from <= 0) return;
  edges.cover.push(from, top, to - from, thickness);
  if (!moving) return;
  const bar = Math.max(3, block * 0.12);
  const strip = (list: number[], centre: number, size: number) => list.push(centre - size / 2, top, size, thickness);
  strip(edges.hot, edge, bar);
  strip(edges.red, edge + motion * bar * 1.4, bar * 1.2);
  strip(edges.cyan, edge - motion * bar * 2.2, bar * 1.2);
  // The trail is longest while the slab is fastest, right after it sets off.
  const trail = Math.min(width * 0.5, block * 0.8 + width * 0.45 * Math.sqrt(1 - travel));
  if (motion > 0) edges.fallLeft.push(edge - trail, top, trail, thickness);
  else edges.fallRight.push(edge, top, trail, thickness);
}

export function drawSlice(paint: TransitionPaint): void {
  const { enter, leave } = stageOf(paint.u, paint.hold);
  if (enter >= 1 && leave <= 0) {
    fillHeld(paint);
    drawHairlines(paint);
    drawTearFlash(paint);
    return;
  }
  const { block, height, seed } = paint;
  const edges: SliceEdges = { cover: [], cyan: [], fallLeft: [], fallRight: [], hot: [], red: [] };
  let bottom = height;
  for (let index = 0; bottom > 0; index += 1) {
    const thickness = block * (0.16 + 0.62 * hash(index, seed + 5));
    // Slabs overlap a hair, so a closed cover has no seams.
    slab(paint, edges, index, bottom - thickness, thickness + 0.5);
    bottom -= thickness;
  }
  fillDark(paint, edges.cover, 0.7);
  const heat = heatOf(paint);
  const warm = 1 + 0.6 * paint.drive.bass;
  drawTrails(paint, edges, 0.8 * heat * warm);
  paint.context.globalAlpha = 1;
  fillQuads(paint, edges.cyan, rgba(CYAN, 0.55 * heat * warm));
  fillQuads(paint, edges.red, rgba(RED, 0.65 * heat * warm));
  fillQuads(paint, edges.hot, rgba(paint.hot, heat));
  drawTearFlash(paint);
}

const TRAIL_PIXELS = 128;
let cachedTrails: { key: string; left: OffscreenCanvas; right: OffscreenCanvas } | null = null;

/** Two strips of the glow colour fading to nothing, one each way, made once per colour. */
function trailSprites(color: Rgb): { left: OffscreenCanvas; right: OffscreenCanvas } | null {
  const key = `${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)}`;
  if (cachedTrails && cachedTrails.key === key) return cachedTrails;
  if (typeof OffscreenCanvas === "undefined") return null;
  const left = trailStrip(color, false);
  const right = trailStrip(color, true);
  if (!left || !right) return null;
  cachedTrails = { key, left, right };
  return cachedTrails;
}

function trailStrip(color: Rgb, brightLeft: boolean): OffscreenCanvas | null {
  const canvas = new OffscreenCanvas(TRAIL_PIXELS, 2);
  const paint = canvas.getContext("2d");
  if (!paint) return null;
  const gradient = paint.createLinearGradient(brightLeft ? TRAIL_PIXELS : 0, 0, brightLeft ? 0 : TRAIL_PIXELS, 0);
  gradient.addColorStop(0, rgba(color, 0));
  gradient.addColorStop(0.5, rgba(color, 0.3));
  gradient.addColorStop(0.85, rgba(color, 0.65));
  gradient.addColorStop(1, rgba(color, 1));
  paint.fillStyle = gradient;
  paint.fillRect(0, 0, TRAIL_PIXELS, 2);
  return canvas;
}

/** Stretches one trail strip over each rectangle; bound per strip, so the loop passes numbers only. */
function trailStamper(paint: TransitionPaint, brightLeft: boolean): (x: number, y: number, w: number, h: number) => void {
  const sprites = trailSprites(paint.glow);
  const sprite = sprites ? (brightLeft ? sprites.right : sprites.left) : null;
  const context = paint.context;
  return (x, y, w, h) => {
    if (sprite) context.drawImage(sprite, x, y, w, h);
  };
}

function drawTrailSet(paint: TransitionPaint, quads: readonly number[], brightLeft: boolean): void {
  if (quads.length === 0) return;
  const stamp = trailStamper(paint, brightLeft);
  for (let index = 0; index < quads.length; index += 4) stamp(quads[index], quads[index + 1], quads[index + 2], quads[index + 3]);
}

function drawTrails(paint: TransitionPaint, edges: SliceEdges, alpha: number): void {
  if (alpha <= 0.01) return;
  paint.context.globalAlpha = clamp01(alpha);
  drawTrailSet(paint, edges.fallLeft, false);
  drawTrailSet(paint, edges.fallRight, true);
  paint.context.globalAlpha = 1;
}

/** 0..1: a flash peaking `share` of the filler after a moment and dying away fast. */
function flashAt(share: number): number {
  if (share < -0.025) return 0;
  return share < 0 ? 1 + share / 0.025 : Math.exp(-share / 0.06);
}

/** Bright full-width tear bands as the slabs slam shut, and fainter ones as they break open. */
function drawTearFlash(paint: TransitionPaint): void {
  const pass = passShare(paint.hold);
  const flash = Math.max(flashAt(paint.u - pass), 0.6 * flashAt(1 - pass - paint.u)) * heatOf(paint);
  if (flash <= 0.01) return;
  const { block, context, height, seed, tick, width } = paint;
  const step = tick >> 1;
  const halos: number[] = [];
  const cores: number[] = [];
  for (let band = 0; band < 3; band += 1) {
    const y = hash(band + seed * 5, step) * height;
    const thickness = block * (0.03 + 0.12 * hash(band, seed + step + 21));
    halos.push(0, y - thickness * 2, width, thickness * 4);
    cores.push(0, y - thickness / 2, width, thickness);
  }
  context.globalAlpha = 1;
  fillQuads(paint, halos, rgba(paint.glow, 0.22 * flash));
  fillQuads(paint, cores, rgba(paint.hot, flash));
}

/** A few thin flickering lines across the held dark; a beat flickers more of them. */
function drawHairlines(paint: TransitionPaint): void {
  const { block, context, drive, height, seed, tick, width } = paint;
  const line = Math.max(1, block * 0.02);
  const lines = 4 + Math.round(8 * drive.beat);
  const lit = 0.45 + 0.35 * drive.beat;
  context.globalAlpha = 1;
  context.fillStyle = rgba(paint.glow, 0.5 * paint.intensity * (1 + drive.beat));
  for (let index = 0; index < lines; index += 1) {
    if (hash(index, tick + seed * 3) > lit) continue;
    const y = hash(index, tick + seed) * height;
    const from = hash(index, tick + 7) * width * 0.6;
    context.fillRect(from, y, width * (0.2 + 0.6 * hash(index, tick + 9)), line);
  }
}

type Bands = Readonly<{ amount: number; beat: number; seed: number }>;

let scratch: { canvas: OffscreenCanvas; paint: OffscreenCanvasRenderingContext2D } | null = null;

function scratchOf(width: number, height: number): OffscreenCanvasRenderingContext2D | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  if (!scratch || scratch.canvas.width !== width || scratch.canvas.height !== height) {
    const canvas = new OffscreenCanvas(width, height);
    const paint = canvas.getContext("2d");
    scratch = paint ? { canvas, paint } : null;
  }
  return scratch?.paint ?? null;
}

/** How hard the picture tears at a point of the filler; 0 while covered. */
export function tearAmount(u: number, hold: number): number {
  const { enter, leave } = stageOf(u, hold);
  if (enter < 1) return enter ** 1.4;
  if (leave <= 0) return 0;
  return (1 - leave) ** 1.6;
}

/**
 * Tears the finished picture: bands of it shift sideways in held glitch
 * steps (`seconds` from the cut sets the step), wrapping round so no gap
 * opens. Works on the canvas pixels of the frame, so it runs before the cover
 * is laid and only for an unrotated frame.
 */
export function tearScene(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  direction: TransitionDirection,
  u: number,
  hold: number,
  intensity: number,
  seed: number,
  seconds: number,
): void {
  const amount = tearAmount(u, hold) * intensity;
  if (amount < 0.01) return;
  const matrix = context.getTransform();
  if (Math.abs(matrix.b) > 1e-6 || Math.abs(matrix.c) > 1e-6 || matrix.a <= 0 || matrix.d <= 0) return;
  const canvas = context.canvas;
  const left = Math.max(0, Math.round(matrix.e));
  const top = Math.max(0, Math.round(matrix.f));
  const width = Math.min(canvas.width, Math.round(matrix.e + frame.width * matrix.a)) - left;
  const height = Math.min(canvas.height, Math.round(matrix.f + frame.height * matrix.d)) - top;
  if (width < 2 || height < 2) return;
  const copy = scratchOf(width, height);
  if (!copy) return;
  copy.clearRect(0, 0, width, height);
  copy.drawImage(canvas, left, top, width, height, 0, 0, width, height);
  const source = copy.canvas;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(left, top, width, height);
  // Bound here so the band loop hands canvas calls numbers only.
  const rows = direction === "up" || direction === "down";
  const blit = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => {
    if (sw >= 1 && sh >= 1) context.drawImage(source, sx, sy, sw, sh, left + dx, top + dy, sw, sh);
  };
  const bands: Bands = { amount, beat: Math.floor(seconds * 15), seed };
  if (rows) tearRows(blit, width, height, bands);
  else tearColumns(blit, width, height, bands);
  context.restore();
}

type Blit = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => void;

/** Sideways shift of one band, in device pixels; most bands stay put. */
function bandShift(index: number, bands: Bands, across: number): number {
  const salt = bands.seed * 13 + index;
  if (hash(salt, bands.beat) < 0.45) return 0;
  const big = hash(salt, bands.beat + 3) < 0.15 ? 2.2 : 1;
  const shift = (hash(salt, bands.beat + 1) - 0.5) * 2 * across * 0.26 * big * bands.amount;
  return ((Math.round(shift) % across) + across) % across;
}

function bandThickness(index: number, bands: Bands, along: number): number {
  return Math.max(2, Math.round(along * (0.012 + 0.07 * hash(bands.seed * 17 + index, bands.beat >> 1))));
}

function tearRows(blit: Blit, width: number, height: number, bands: Bands): void {
  for (let y = 0, index = 0; y < height; index += 1) {
    const size = Math.min(height - y, bandThickness(index, bands, height));
    const shift = bandShift(index, bands, width);
    blit(0, y, width - shift, size, shift, y);
    blit(width - shift, y, shift, size, 0, y);
    y += size;
  }
}

function tearColumns(blit: Blit, width: number, height: number, bands: Bands): void {
  for (let x = 0, index = 0; x < width; index += 1) {
    const size = Math.min(width - x, bandThickness(index, bands, width));
    const shift = bandShift(index, bands, height);
    blit(x, 0, size, height - shift, x, shift);
    blit(x, height - shift, size, shift, x, 0);
    x += size;
  }
}

/** The scan beam's travel ease: quick through the middle of the frame. */
const beamEase = (t: number) => 0.35 * t + 0.65 * t * t * (3 - 2 * t);

/** Share of the filler the tube takes to power down after the first beam has passed. */
const POWER_DOWN = 0.13;

export function drawScan(paint: TransitionPaint): void {
  const { enter, leave } = stageOf(paint.u, paint.hold);
  let dark: number[] | null = null;
  if (enter >= 1 && leave <= 0) {
    fillHeld(paint);
  } else {
    const covering = enter < 1;
    dark = scanPass(paint, covering ? enter : leave, covering);
  }
  const down = (paint.u - passShare(paint.hold)) / POWER_DOWN;
  if (down >= 0 && down < 1) drawPowerDown(paint, down);
  drawGrain(paint, 0.7, dark);
}

/** Lays the cover for one beam pass and draws the beam; returns the cover. */
function scanPass(paint: TransitionPaint, pass: number, covering: boolean): number[] {
  const { block, height, width } = paint;
  const pitch = Math.max(3, block / 9);
  const lag = block * 1.6;
  const beam = height + block * 0.6 + (-(lag + block * 1.2) - height - block * 0.6) * beamEase(pass);
  const cover: number[] = [];
  // Past the interlaced band the picture is fully off (covering) or still off (uncovering).
  if (covering && beam + lag < height) cover.push(0, beam + lag, width, height - beam - lag + 1);
  if (!covering && beam > 0) cover.push(0, -1, width, beam + 1);
  const first = Math.floor(beam / pitch) * pitch;
  for (let y = first; y < beam + lag && y < height; y += pitch) {
    const line = covering ? y : y + pitch / 2;
    if (line + pitch / 2 > beam && line < beam + lag && line + pitch / 2 > 0) {
      cover.push(0, Math.max(beam, line), width, pitch / 2 + line - Math.max(beam, line));
    }
  }
  fillDark(paint, cover, 0.7);
  drawBeam(paint, beam);
  return cover;
}

/**
 * The tube powering down, `progress` 0..1: a bright line across the middle
 * of the dark shrinks to a hot dot, which then fades.
 */
function drawPowerDown(paint: TransitionPaint, progress: number): void {
  const { block, context, drive, height, width } = paint;
  const strength = paint.intensity * (1 - clamp01((progress - 0.4) / 0.6));
  if (strength <= 0.01) return;
  const middleX = width / 2;
  const middleY = height / 2;
  const half = (width / 2) * (1 - easeInCubic(clamp01(progress / 0.55)));
  if (half > 0.5) {
    // A soft glow round the line: one radial gradient squashed into an ellipse.
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, rgba(paint.glow, 0.3 * strength));
    glow.addColorStop(1, rgba(paint.glow, 0));
    context.save();
    context.translate(middleX, middleY);
    context.scale(half * 1.15, block * 0.45);
    context.globalAlpha = 1;
    context.fillStyle = glow;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
    // A beat thickens the line.
    const core = Math.max(2, block * 0.045) * (1 - 0.5 * progress) * (1 + drive.beat);
    context.globalAlpha = 1;
    context.fillStyle = rgba(paint.hot, strength);
    context.fillRect(middleX - half, middleY - core / 2, half * 2, core);
  }
  flareStamper(paint)(middleX, middleY, block * (0.3 + 0.5 * (1 - progress)), 0.9 * strength);
  context.globalAlpha = 1;
}

/** The beam: a soft glow band, a lens streak, a hot core and RGB fringes. */
function drawBeam(paint: TransitionPaint, beam: number): void {
  const { block, context, drive, height, width } = paint;
  // The bass swells the beam's glow; a beat flares it.
  const strength = paint.intensity * (1 + 0.5 * drive.bass + 0.5 * drive.beat);
  const swell = 1 + 0.6 * drive.bass;
  if (beam < -block * 2 || beam > height + block * 2 || strength <= 0.01) return;
  context.globalAlpha = 1;
  const glow = context.createLinearGradient(0, beam - block * 1.2 * swell, 0, beam + block * 2.2 * swell);
  glow.addColorStop(0, rgba(paint.glow, 0));
  glow.addColorStop(0.35, rgba(paint.glow, 0.5 * strength));
  glow.addColorStop(1, rgba(paint.glow, 0));
  context.fillStyle = glow;
  context.fillRect(0, beam - block * 1.2 * swell, width, block * 3.4 * swell);
  const radius = block * 1.1;
  const streak = context.createRadialGradient(0, 0, 0, 0, 0, radius);
  streak.addColorStop(0, rgba(paint.hot, 0.8 * strength));
  streak.addColorStop(1, rgba(paint.glow, 0));
  context.save();
  context.translate(width / 2, beam);
  context.scale((width * 0.55) / radius, 0.35);
  context.fillStyle = streak;
  context.fillRect(-radius, -radius, radius * 2, radius * 2);
  context.restore();
  const core = Math.max(2, block * 0.035) * (1 + drive.beat);
  context.fillStyle = rgba(RED, 0.6 * strength);
  context.fillRect(0, beam - core * 2.5, width, core);
  context.fillStyle = rgba(CYAN, 0.5 * strength);
  context.fillRect(0, beam + core * 1.5, width, core);
  context.fillStyle = rgba(paint.hot, clamp01(0.35 + 0.75 * strength));
  context.fillRect(0, beam - core / 2, width, core);
}
