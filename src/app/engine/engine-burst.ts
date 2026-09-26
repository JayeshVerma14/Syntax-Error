/**
 * The burst: rays of characters thrown out from one point, as in the glyph
 * films where a field of dashes and slashes explodes out from behind the
 * text. Each ray is drawn in the character whose stroke matches its angle, so
 * the burst reads as lines even though every mark sits on the text grid.
 *
 * A burst is a pure function of loop phase: rays shoot out, their tails leave
 * the origin, and they fly past the reach and vanish, so every burst starts
 * and ends empty and the loop closes cleanly.
 */

import { MAX_BURST_RAYS } from "./engine-constants";
import type { BurstSettings } from "./engine-settings";

export type BurstCell = Readonly<{ column: number; glyph: string; row: number }>;

const TAU = Math.PI * 2;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 131, 2_654_435_761) ^ Math.imul(salt + 71, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

function wrap(value: number): number {
  return value - Math.floor(value);
}

/** The character whose stroke runs along a direction, in screen axes. */
export function strokeGlyph(angle: number): string {
  const degrees = ((((angle * 180) / Math.PI) % 180) + 180) % 180;
  if (degrees < 22.5 || degrees >= 157.5) return "-";
  if (degrees < 67.5) return "\\";
  if (degrees < 112.5) return "|";
  return "/";
}

export type BurstGrid = Readonly<{
  cellHeight: number;
  cellWidth: number;
  cols: number;
  height: number;
  rows: number;
  width: number;
}>;

/**
 * Collects the grid cells the burst covers at this loop phase. Cells the
 * subject already occupies are left to the subject.
 */
export function collectBurst(
  burst: BurstSettings,
  grid: BurstGrid,
  progress: number,
  occupied: Uint8Array | null,
): BurstCell[] {
  if (!burst.enabled) return [];
  const rays = Math.max(1, Math.min(MAX_BURST_RAYS, Math.round(burst.rays)));
  const count = Math.max(1, Math.round(burst.count));
  const cycle = progress * count;
  const phase = wrap(cycle);
  const index = Math.floor(cycle) % count;

  const reach = (Math.hypot(grid.width, grid.height) * burst.reach) / 100;
  const outer = reach * (1 - (1 - Math.min(1, phase / 0.75)) ** 3);
  const inner = reach * Math.max(0, (phase - 0.3) / 0.7) ** 1.6;
  if (outer <= 0 || inner >= outer) return [];

  const originX = ((burst.origin.x + 1) / 2) * grid.width;
  const originY = ((burst.origin.y + 1) / 2) * grid.height;
  const halfWidth = (Math.max(0.2, burst.thickness) * grid.cellWidth) / 2;
  const spacing = TAU / rays;
  // Each burst in the loop throws its rays at a slightly different angle.
  const offset = hash(index, 3) * spacing;
  const glyphs = Array.from({ length: rays }, (_, ray) =>
    strokeGlyph(offset + ray * spacing),
  );

  const cells: BurstCell[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    const dy = (row + 0.5) * grid.cellHeight - originY;
    for (let column = 0; column < grid.cols; column += 1) {
      if (occupied && occupied[row * grid.cols + column]) continue;
      const dx = (column + 0.5) * grid.cellWidth - originX;
      const radius = Math.hypot(dx, dy);
      if (radius > outer || radius < 1) continue;
      const angle = Math.atan2(dy, dx) - offset;
      const ray = ((Math.round(angle / spacing) % rays) + rays) % rays;
      const delta = angle - Math.round(angle / spacing) * spacing;
      if (Math.abs(radius * Math.sin(delta)) > halfWidth || Math.cos(delta) <= 0) {
        continue;
      }
      // Rays run to different lengths, so the burst front is ragged.
      const length = 0.55 + 0.45 * hash(ray, index + 11);
      if (radius > outer * length || radius < inner * length) continue;
      const texture = hash(column * 7919 + row, index + 29);
      let glyph = glyphs[ray];
      if (outer * length - radius < grid.cellWidth * 1.5) glyph = "*";
      else if (texture < 0.1) glyph = "o";
      else if (texture < 0.18) glyph = ":";
      cells.push({ column, glyph, row });
    }
  }
  return cells;
}
