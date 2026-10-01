/**
 * The glow filler, after the reference light leak: a stepped dome of large,
 * white-hot square pixels rises up through the frame inside a soft bloom and
 * leaves the frame dark behind it. The dark holds with a faint grid and a few
 * flickering glints while the shot changes underneath, then a second dome
 * rises the same way and the new shot opens up behind it.
 *
 * The pixels snap to a fixed grid while the bloom glides, as in the
 * reference, so the dome climbs row by row inside a halo that moves smoothly.
 * The bloom is measured in frame units, not grid pixels, so it stays a big
 * soft light leak however fine the grid. It is a tiny field image scaled up
 * with smoothing: one upload and one textured quad per frame, however large
 * the export.
 *
 * The bass swells the bloom, brighter and spreading further both ways, and a
 * beat flares the dim row behind the hot edge and the flares where steps meet.
 */

import {
  clamp01,
  drawDarkTexture,
  drawGrain,
  fillDark,
  fillQuads,
  flareStamper,
  gridStart,
  rgba,
  type Rgb,
  stageOf,
  type TransitionPaint,
} from "./engine-transition-kit";

type Dome = Readonly<{
  apex: number;
  bulge: number;
  centre: number;
  radius: number;
}>;

/**
 * Where the dome's leading edge crosses a column; larger is further back.
 * The profile is rounder than a cone and steeper than a circle, so the
 * snapped pixels step down about one row per column, as in the reference.
 */
function frontAt(dome: Dome, x: number): number {
  const reach = Math.min(1, Math.abs(x - dome.centre) / dome.radius);
  return dome.apex + dome.bulge * reach ** 1.8;
}

/** Gentle ease: mostly linear so the dome never idles off screen. */
const travelEase = (t: number) => 0.45 * t + 0.55 * t * t * (3 - 2 * t);

/** The bloom's length scale: a sixth of the frame's shorter side. */
const lightUnit = (paint: TransitionPaint) => paint.unit / 6;

function domeAt(paint: TransitionPaint, pass: number): Dome {
  const { block, height, width } = paint;
  const shape = { apex: 0, bulge: 0.5 * Math.min(width, height * 1.3), centre: width / 2, radius: width / 2 };
  const edgeDrop = frontAt(shape, 0);
  // It starts just below the frame and travels until its glow has left the top.
  const start = height + block * 1.2;
  const end = -(edgeDrop + Math.max(block * 2.5, lightUnit(paint) * 1.2));
  return { ...shape, apex: start + (end - start) * travelEase(pass) };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export function drawGlow(paint: TransitionPaint): void {
  const { context, height, width } = paint;
  const { enter, leave } = stageOf(paint.u, paint.hold);
  if (enter >= 1 && leave <= 0) {
    // Held: the whole frame dark, with its grid and glints.
    context.globalAlpha = paint.cover;
    context.fillStyle = paint.fill;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
    drawDarkTexture(paint, 1, null);
    drawGrain(paint, 0.5, null);
    return;
  }
  const covering = enter < 1;
  const pass = covering ? enter : leave;
  const dome = domeAt(paint, pass);
  const tops = pixelRows(paint, dome);
  const dark = darkColumns(paint, tops, covering);
  fillDark(paint, dark, 1);
  // The light swells in as the dome arrives and sinks away with its tail.
  const fade = smooth(clamp01(pass / 0.1)) * smooth(clamp01((1 - pass) / 0.35));
  // Uncovering, the light clears off the new shot sooner than it sinks into the dark.
  paintBloom(paint, dome, fade, covering ? 1 : 1.6);
  paintPixels(paint, tops, fade);
  drawGrain(paint, 0.5 + 0.5 * fade, dark);
}

/** Top edge of the hot pixel in each grid column, snapped to the grid. */
function pixelRows(paint: TransitionPaint, dome: Dome): number[] {
  const { block, height, width } = paint;
  const x0 = gridStart(width, block);
  const y0 = gridStart(height, block);
  const tops: number[] = [];
  for (let x = x0; x < width; x += block) {
    const front = frontAt(dome, x + block / 2);
    tops.push(y0 + Math.floor((front - y0) / block) * block);
  }
  return tops;
}

/**
 * The cover as one rectangle per grid column: behind the dome while it
 * covers, ahead of it while it uncovers.
 */
function darkColumns(paint: TransitionPaint, tops: readonly number[], covering: boolean): number[] {
  const { block, height, width } = paint;
  const x0 = gridStart(width, block);
  const dark: number[] = [];
  for (let column = 0; column < tops.length; column += 1) {
    const x = x0 + column * block;
    const top = tops[column];
    if (covering && top < height) {
      dark.push(x, Math.max(-1, top), block, height + 1 - Math.max(-1, top));
    } else if (!covering && top + block > 0) {
      dark.push(x, -1, block, Math.min(height + 1, top + block) + 1);
    }
  }
  return dark;
}

type BloomLayer = {
  canvas: OffscreenCanvas;
  image: ImageData;
  paint: OffscreenCanvasRenderingContext2D;
};

let bloomLayer: BloomLayer | null = null;

function bloomOf(columns: number, rows: number): BloomLayer | null {
  if (bloomLayer && bloomLayer.image.width === columns && bloomLayer.image.height === rows) {
    return bloomLayer;
  }
  if (typeof OffscreenCanvas === "undefined" || typeof ImageData === "undefined") return null;
  const canvas = new OffscreenCanvas(columns, rows);
  const paint = canvas.getContext("2d");
  if (!paint) return null;
  bloomLayer = { canvas, image: new ImageData(columns, rows), paint };
  return bloomLayer;
}

/** Bloom texels per light unit; enough that the scaled field stays round. */
const TEXELS_PER_UNIT = 3;

/**
 * Light as a function of distance from the leading edge, in light units:
 * a hot core just behind the edge, a short spill ahead of it and a longer
 * glow that sinks into the dark behind it. `behind` and `ahead` scale how
 * fast it falls off on each side.
 */
export function bloomAt(distance: number, behind = 1, ahead = 1): number {
  const core = distance < 0 ? Math.exp(distance * 1.7 * ahead) : Math.exp(-distance * 0.75 * behind);
  const spill = distance < 0 ? Math.exp(distance * 0.55 * ahead) : Math.exp(-distance * 0.3 * behind);
  return 0.95 * core + 0.3 * spill;
}

function paintBloom(paint: TransitionPaint, dome: Dome, fade: number, behind: number): void {
  const { bass, beat } = paint.drive;
  const strength = paint.intensity * fade * (1 + 0.5 * bass + 0.5 * beat);
  if (strength <= 0.01) return;
  const { context, height, width } = paint;
  const unit = lightUnit(paint);
  const texel = unit / TEXELS_PER_UNIT;
  const columns = Math.ceil(width / texel) + 2;
  const rows = Math.ceil(height / texel) + 2;
  const layer = bloomOf(columns, rows);
  if (!layer) return;
  // The bass swells the bloom: it falls off slower on both sides of the edge.
  const field: BloomField = {
    ahead: 1 / (1 + 0.5 * bass),
    behind: behind / (1 + 0.7 * bass),
    columns,
    dome,
    rows,
    strength,
    texel,
    unit,
  };
  fillBloom(layer.image.data, field, paint.glow);
  layer.paint.putImageData(layer.image, 0, 0);
  context.globalAlpha = 1;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(layer.canvas, -texel, -texel, columns * texel, rows * texel);
}

type BloomField = Readonly<{
  ahead: number;
  behind: number;
  columns: number;
  dome: Dome;
  rows: number;
  strength: number;
  texel: number;
  unit: number;
}>;

function fillBloom(data: Uint8ClampedArray, field: BloomField, color: Rgb): void {
  const { ahead, behind, columns, dome, rows, strength, texel, unit } = field;
  const { b, g, r } = color;
  let offset = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = (row - 0.5) * texel;
    for (let column = 0; column < columns; column += 1) {
      const x = (column - 0.5) * texel;
      const light = bloomAt((y - frontAt(dome, x)) / unit, behind, ahead) * strength;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = Math.min(255, light * 255);
      offset += 4;
    }
  }
}

/** The hard pixels: the hot stepped edge, its dimmer echo, and flares where steps meet. */
function paintPixels(paint: TransitionPaint, tops: readonly number[], fade: number): void {
  const { block, context, height, width } = paint;
  const x0 = gridStart(width, block);
  const heat = clamp01(0.35 + 0.75 * paint.intensity) * clamp01(fade * 3);
  if (heat <= 0.01) return;
  const last = tops.length - 1;
  const edge: number[] = [];
  const echo: number[] = [];
  for (let column = 0; column <= last; column += 1) {
    const x = x0 + column * block;
    const top = tops[column];
    if (top < height && top + block > 0) {
      // A step of more than one row fills in, so the edge never breaks apart.
      const neighbour = Math.min(tops[Math.max(0, column - 1)], tops[Math.min(last, column + 1)]);
      const runTop = Math.min(top, neighbour + block);
      edge.push(x, runTop, block, top + block - runTop);
    }
    if (top + block < height && top + block * 2 > 0) echo.push(x, top + block, block, block);
  }
  context.globalAlpha = 1;
  fillQuads(paint, edge, rgba(paint.hot, heat));
  // The dim row behind the edge; the bass warms it and a beat flares it.
  const { bass, beat } = paint.drive;
  fillQuads(paint, echo, rgba(paint.glow, heat * 0.3 * (1 + bass + 1.5 * beat)));
  const stamp = flareStamper(paint);
  for (let column = 0; column < last; column += 1) {
    const upper = Math.min(tops[column], tops[column + 1]);
    const lower = Math.max(tops[column], tops[column + 1]);
    if (lower === upper || lower > height || lower < 0) continue;
    stamp(x0 + (column + 1) * block, upper + block, block * 0.55 * (1 + 0.8 * beat), heat * 0.9);
  }
  context.globalAlpha = 1;
}
