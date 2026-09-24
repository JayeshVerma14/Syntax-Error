/**
 * Colour quantization against the ink list.
 *
 * Tone mapping alone can only band an image by brightness. Matching each cell's
 * actual RGB to the closest ink is what keeps hair black, skin warm and a
 * background its own hue inside a small palette, and error diffusion is what
 * turns the hard boundaries between those inks into mixed, grainy transitions.
 */

import type { ColorMatch } from "./engine-constants";
import type { SourceGrid } from "./engine-source";

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function channel(value: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, value)) * 255);
  return byte.toString(16).padStart(2, "0").toUpperCase();
}

export function rgbToHex([red, green, blue]: Rgb): string {
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/**
 * Weighted squared distance. The green channel carries most perceived
 * lightness, so weighting it avoids matching a mid grey to a saturated hue.
 */
function distance(a: Rgb, b: Rgb): number {
  const dr = (a[0] - b[0]) * 0.9;
  const dg = (a[1] - b[1]) * 1.2;
  const db = (a[2] - b[2]) * 0.7;
  return dr * dr + dg * dg + db * db;
}

function twoNearest(
  color: Rgb,
  palette: readonly Rgb[],
): { first: number; firstDistance: number; second: number; secondDistance: number } {
  let first = 0;
  let firstDistance = Number.POSITIVE_INFINITY;
  let second = 0;
  let secondDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index += 1) {
    const value = distance(color, palette[index]);
    if (value < firstDistance) {
      second = first;
      secondDistance = firstDistance;
      first = index;
      firstDistance = value;
    } else if (value < secondDistance) {
      second = index;
      secondDistance = value;
    }
  }
  return { first, firstDistance, second, secondDistance };
}

/** Blends toward the runner-up ink so a palette reads as a gradient, not bands. */
function blend(color: Rgb, palette: readonly Rgb[]): Rgb {
  if (palette.length === 1) return palette[0];
  const { first, firstDistance, second, secondDistance } = twoNearest(
    color,
    palette,
  );
  const total = firstDistance + secondDistance;
  if (total <= 0) return palette[first];
  // Inverse-distance weight: the closer ink dominates.
  const weight = secondDistance / total;
  const a = palette[first];
  const b = palette[second];
  return [
    a[0] * weight + b[0] * (1 - weight),
    a[1] * weight + b[1] * (1 - weight),
    a[2] * weight + b[2] * (1 - weight),
  ];
}

export type QuantizeInput = Readonly<{
  /** Floyd-Steinberg in colour space, for mixed transitions between inks. */
  diffuse: boolean;
  grid: SourceGrid;
  inks: readonly string[];
  match: ColorMatch;
}>;

/**
 * Returns one hex colour per cell, parallel to the grid. `tone` returns an
 * empty result because that mode is driven by the ink ramp instead.
 */
export function quantizeGrid({
  diffuse,
  grid,
  inks,
  match,
}: QuantizeInput): readonly string[] {
  if (match === "tone" || inks.length === 0) return [];
  const palette = inks.map(hexToRgb);
  const count = grid.cols * grid.rows;
  const output: string[] = new Array<string>(count);

  // A working copy so diffusion can push quantization error into neighbours.
  const working = new Float32Array(grid.color);

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.cols; column += 1) {
      const index = row * grid.cols + column;
      const offset = index * 3;
      const source: Rgb = [
        working[offset],
        working[offset + 1],
        working[offset + 2],
      ];

      const picked =
        match === "blend"
          ? blend(source, palette)
          : palette[twoNearest(source, palette).first];
      output[index] = rgbToHex(picked);

      if (!diffuse) continue;

      const errorR = source[0] - picked[0];
      const errorG = source[1] - picked[1];
      const errorB = source[2] - picked[2];
      const push = (targetColumn: number, targetRow: number, factor: number) => {
        if (
          targetColumn < 0 ||
          targetRow < 0 ||
          targetColumn >= grid.cols ||
          targetRow >= grid.rows
        ) {
          return;
        }
        const target = (targetRow * grid.cols + targetColumn) * 3;
        working[target] += errorR * factor;
        working[target + 1] += errorG * factor;
        working[target + 2] += errorB * factor;
      };
      push(column + 1, row, 7 / 16);
      push(column - 1, row + 1, 3 / 16);
      push(column, row + 1, 5 / 16);
      push(column + 1, row + 1, 1 / 16);
    }
  }

  return output;
}
