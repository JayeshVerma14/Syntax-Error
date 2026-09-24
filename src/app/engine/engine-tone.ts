/**
 * Tone shaping and dithering. Every engine returns a 0..1 field the unit stage
 * reads as "how much ink belongs in this cell", so switching dither never
 * changes the grid, only the distribution of tone across it.
 */

import type { DitherKind } from "./engine-constants";
import type { EngineSettings } from "./engine-settings";
import type { SourceGrid } from "./engine-source";

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function bayer8(): number[][] {
  // Recursive construction keeps the 8x8 matrix consistent with the 4x4 one.
  const matrix: number[][] = [];
  for (let y = 0; y < 8; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < 8; x += 1) {
      const quadrant = BAYER_4[y >> 1][x >> 1];
      const inner = BAYER_4[y & 3][x & 3] & 3;
      row.push((quadrant * 4 + inner) % 64);
    }
    matrix.push(row);
  }
  return matrix;
}

const BAYER_8 = bayer8();

/**
 * Deterministic void-and-cluster style noise. A hash keeps it reproducible so
 * exported frames match the preview exactly.
 */
function blueNoise(x: number, y: number): number {
  let hash = (x * 73_856_093) ^ (y * 19_349_663);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const white = hash / 4_294_967_295;
  // Bias toward a mid-frequency distribution rather than pure white noise.
  const ordered = BAYER_8[y & 7][x & 7] / 64;
  return (white * 0.45 + ordered * 0.55) % 1;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function shapeTone(value: number, settings: EngineSettings): number {
  const lightness = settings.lightness / 100;
  const contrast = settings.contrast / 100;
  let tone = clamp01(value + lightness);
  if (contrast !== 0) {
    const amount = contrast > 0 ? 1 / (1 - contrast * 0.99) : 1 + contrast;
    tone = clamp01((tone - 0.5) * amount + 0.5);
  }
  tone = clamp01(settings.response(tone));
  return settings.invert ? 1 - tone : tone;
}

function thresholdField(
  grid: SourceGrid,
  settings: EngineSettings,
  shaped: Float32Array,
  kind: DitherKind,
): Float32Array {
  const output = new Float32Array(shaped.length);
  if (kind === "threshold") {
    const cutoff = settings.cutoff / 100;
    for (let index = 0; index < shaped.length; index += 1) {
      output[index] = shaped[index] >= cutoff ? 1 : 0;
    }
    return output;
  }
  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.cols; x += 1) {
      const index = y * grid.cols + x;
      const level =
        kind === "bayer4"
          ? (BAYER_4[y & 3][x & 3] + 0.5) / 16
          : kind === "bayer8"
            ? (BAYER_8[y & 7][x & 7] + 0.5) / 64
            : blueNoise(x, y);
      output[index] = shaped[index] >= level ? 1 : 0;
    }
  }
  return output;
}

function floydSteinberg(grid: SourceGrid, shaped: Float32Array): Float32Array {
  const working = Float32Array.from(shaped);
  const output = new Float32Array(shaped.length);
  const { cols, rows } = grid;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      const old = working[index];
      const next = old >= 0.5 ? 1 : 0;
      output[index] = next;
      const error = old - next;
      if (x + 1 < cols) working[index + 1] += (error * 7) / 16;
      if (y + 1 < rows) {
        if (x > 0) working[index + cols - 1] += (error * 3) / 16;
        working[index + cols] += (error * 5) / 16;
        if (x + 1 < cols) working[index + cols + 1] += error / 16;
      }
    }
  }
  return output;
}

/**
 * Returns the ink field the unit stage draws. `none` keeps continuous tone so
 * unit size can carry the gradient; every other engine returns a binary field.
 */
export function buildToneField(
  grid: SourceGrid,
  settings: EngineSettings,
): Float32Array {
  const shaped = new Float32Array(grid.tone.length);
  for (let index = 0; index < grid.tone.length; index += 1) {
    shaped[index] = shapeTone(grid.tone[index], settings);
  }
  if (settings.dither === "none") return shaped;
  if (settings.dither === "floyd") return floydSteinberg(grid, shaped);
  return thresholdField(grid, settings, shaped, settings.dither);
}
