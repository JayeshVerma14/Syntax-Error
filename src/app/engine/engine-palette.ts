/**
 * Ink selection.
 *
 * Three ways to get from a sampled cell to an ink:
 * - `tone` ramps the ordered ink list by brightness, which posterises;
 * - `nearest` matches the cell's actual colour to the closest ink, which is
 *   what keeps distinct hues distinct inside a small palette;
 * - `blend` weights the two closest inks, which smooths the boundary between
 *   them.
 *
 * Full palette spreads the stock swatches across the sheet, and source mode
 * keeps the sampled pixel colour untouched.
 */

import { SWATCHES } from "./engine-constants";
import type { EngineSettings } from "./engine-settings";

function toHex(component: number): string {
  const value = Math.round(Math.min(1, Math.max(0, component)) * 255);
  return value.toString(16).padStart(2, "0").toUpperCase();
}

export function inkForTone(inks: readonly string[], tone: number): string {
  if (inks.length === 0) return "#000000";
  if (inks.length === 1) return inks[0];
  const index = Math.min(
    inks.length - 1,
    Math.max(0, Math.floor(tone * inks.length)),
  );
  return inks[index];
}

/** Rec. 709 luma, so greyscale keeps the perceived tone of the original. */
export function toGreyscale(hex: string): string {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const channel = toHex(luma);
  return `#${channel}${channel}${channel}`;
}

/** The three settings a unit colour depends on, resolved once per frame. */
export type PaletteChoice = Readonly<{
  greyscale: boolean;
  inks: readonly string[];
  paletteMode: EngineSettings["paletteMode"];
}>;

export type UnitColorInput = Readonly<{
  color: Float32Array;
  column: number;
  index: number;
  palette: PaletteChoice;
  /** Per-cell quantized inks; empty when the ink ramp drives colour instead. */
  quantized: readonly string[];
  row: number;
  tone: number;
}>;

export function unitColor({
  color,
  column,
  index,
  palette,
  quantized,
  row,
  tone,
}: UnitColorInput): string {
  let hex: string;
  if (palette.paletteMode === "source") {
    const offset = index * 3;
    hex = `#${toHex(color[offset])}${toHex(color[offset + 1])}${toHex(color[offset + 2])}`;
  } else if (palette.paletteMode === "full") {
    // Deterministic per cell so the scatter is stable across frames.
    let hash = Math.imul(column + 3, 2_654_435_761) ^ Math.imul(row + 5, 2_246_822_519);
    hash = (hash ^ (hash >>> 16)) >>> 0;
    hex = SWATCHES[hash % SWATCHES.length];
  } else if (quantized.length > index) {
    hex = quantized[index];
  } else {
    hex = inkForTone(palette.inks, tone);
  }
  return palette.greyscale ? toGreyscale(hex) : hex;
}
