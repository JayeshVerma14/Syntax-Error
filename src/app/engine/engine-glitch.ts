/**
 * Glitch.
 *
 * Works in grid space rather than on finished pixels, so a glitched frame is
 * still made of the same marks and stays deterministic: the same timeline time
 * always produces the same displacement, in preview and in an exported frame.
 *
 * Three effects, matching what the reference loop does: horizontal slices
 * shifted sideways, rectangular blocks smeared from elsewhere on the sheet,
 * and a colour-channel split that fringes the marks.
 */

import type { GlitchSettings } from "./engine-settings";

/** Deterministic 32-bit hash; the frame seed makes it advance over time. */
function hash(a: number, b: number, seed: number): number {
  let value = Math.imul(a + 0x9e37, 2_246_822_519);
  value ^= Math.imul(b + 0x85eb, 3_266_489_917);
  value ^= Math.imul(seed + 0xc2b2, 2_654_435_761);
  value = Math.imul(value ^ (value >>> 15), 2_246_822_519);
  return (value ^ (value >>> 13)) >>> 0;
}

function unit(a: number, b: number, seed: number): number {
  return hash(a, b, seed) / 4_294_967_295;
}

export type GlitchPlan = Readonly<{
  /** Per-cell source offset, so a cell can draw another cell's content. */
  sample: (column: number, row: number) => readonly [number, number];
  /** Extra passes drawn behind the sheet as coloured fringes. */
  splits: readonly Readonly<{ color: string; dx: number; dy: number }>[];
}>;

const IDENTITY: GlitchPlan = {
  sample: (column, row) => [column, row],
  splits: [],
};

export function createGlitchPlan(
  glitch: GlitchSettings,
  cols: number,
  rows: number,
  progress: number,
): GlitchPlan {
  if (!glitch.enabled || glitch.amount <= 0) return IDENTITY;

  const strength = Math.min(1, glitch.amount / 100);
  // Quantised time so the glitch holds for a beat instead of crawling.
  const seed =
    glitch.seed + Math.floor(progress * Math.max(1, glitch.rate));

  // Slices: contiguous bands of rows displaced horizontally.
  const sliceHeight = Math.max(1, Math.round(glitch.sliceHeight));
  const maxShift = Math.max(1, Math.round((cols * strength) / 4));

  // Blocks: a few rectangles that read their content from elsewhere.
  const blockCount = Math.round(glitch.blocks * strength);
  const blocks: {
    dx: number;
    dy: number;
    h: number;
    w: number;
    x: number;
    y: number;
  }[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    const w = Math.max(1, Math.round(unit(index, 1, seed) * cols * 0.35));
    const h = Math.max(1, Math.round(unit(index, 2, seed) * rows * 0.18));
    blocks.push({
      dx: Math.round((unit(index, 3, seed) - 0.5) * cols * 0.5 * strength),
      dy: Math.round((unit(index, 4, seed) - 0.5) * rows * 0.2 * strength),
      h,
      w,
      x: Math.round(unit(index, 5, seed) * Math.max(1, cols - w)),
      y: Math.round(unit(index, 6, seed) * Math.max(1, rows - h)),
    });
  }

  const sample = (column: number, row: number): readonly [number, number] => {
    let sourceColumn = column;
    let sourceRow = row;

    for (const block of blocks) {
      if (
        column >= block.x &&
        column < block.x + block.w &&
        row >= block.y &&
        row < block.y + block.h
      ) {
        sourceColumn = column + block.dx;
        sourceRow = row + block.dy;
        break;
      }
    }

    const band = Math.floor(sourceRow / sliceHeight);
    const roll = unit(band, 7, seed);
    // Only some bands tear, so the sheet stays readable underneath.
    if (roll < glitch.density / 100) {
      const shift = Math.round((unit(band, 8, seed) - 0.5) * 2 * maxShift);
      sourceColumn += shift;
    }

    // Wrap rather than clamp: a clamped edge smears into a solid bar.
    const wrappedColumn = ((sourceColumn % cols) + cols) % cols;
    const wrappedRow = ((sourceRow % rows) + rows) % rows;
    return [wrappedColumn, wrappedRow];
  };

  const offset = Math.max(1, Math.round(cols * 0.01 * strength));
  const splits =
    glitch.split > 0
      ? [
          {
            color: `rgba(255,0,64,${(glitch.split / 100) * 0.85})`,
            dx: -offset,
            dy: 0,
          },
          {
            color: `rgba(0,224,255,${(glitch.split / 100) * 0.85})`,
            dx: offset,
            dy: 0,
          },
        ]
      : [];

  return { sample, splits };
}
