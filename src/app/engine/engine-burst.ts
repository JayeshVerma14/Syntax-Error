/**
 * The burst: an explosion of characters thrown out from one point, as in the
 * glyph films where a field of dashes and slashes blasts out from behind the
 * text. One burst is a flash at the origin, streaks that launch fast and
 * coast to a stop, drawn in the stroke character that matches their
 * direction, sparks, a shock ring of dots and a cloud of dust that settles
 * after the blast, all set on the text grid. Streaks leave the origin almost
 * at once and trail long tails while they are fast, so the burst reads as an
 * explosion rather than rays growing out.
 *
 * Every burst is a pure function of loop phase. Bursts fire at the start of
 * whole slots of the loop and Speed sets how long one takes to play out:
 * fast bursts finish early in their slot, slow ones overlap the next burst
 * and wrap round the loop seam, and every loop still closes.
 */

import { MAX_BURST_RAYS, MAX_BURST_SPEED, MIN_BURST_SPEED } from "./engine-constants";
import type { BurstSettings } from "./engine-settings";

export type BurstCell = Readonly<{ column: number; glyph: string; row: number }>;

const TAU = Math.PI * 2;
const SPARK_GLYPHS = ["*", "+", "'", ".", "`", ","] as const;
const FLASH_GLYPHS = ["@", "#", "%", "#", "*"] as const;
/** Share of a burst's life the flash lasts. */
const FLASH_SPAN = 0.14;
/** Share of a burst's life the shock ring lasts. */
const RING_SPAN = 0.5;
/** When in a burst's life the dust cloud appears. */
const DUST_START = 0.08;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 131, 2_654_435_761) ^ Math.imul(salt + 71, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** The character whose stroke runs along a direction, in screen axes. */
export function strokeGlyph(angle: number): string {
  const degrees = ((((angle * 180) / Math.PI) % 180) + 180) % 180;
  if (degrees < 22.5 || degrees >= 157.5) return "-";
  if (degrees < 67.5) return "\\";
  if (degrees < 112.5) return "|";
  return "/";
}

/** Explosive launch: most of the distance is covered in the first instants. */
function launch(age: number): number {
  return (1 - 2 ** (-5 * age)) / (1 - 2 ** -5);
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
 * Collects the grid cells the bursts cover at this loop phase. Cells the
 * subject already occupies are left to the subject.
 */
export function collectBurst(
  burst: BurstSettings,
  grid: BurstGrid,
  progress: number,
  occupied: Uint8Array | null,
): BurstCell[] {
  if (!burst.enabled || grid.cols <= 0 || grid.rows <= 0) return [];
  const rays = Math.max(1, Math.min(MAX_BURST_RAYS, Math.round(burst.rays)));
  const count = Math.max(1, Math.round(burst.count));
  const speed =
    Math.min(MAX_BURST_SPEED, Math.max(MIN_BURST_SPEED, burst.speed)) / 100;
  // How many loop slots one burst lasts, and so how many can overlap.
  const span = 1 / speed;
  const position = progress * count;
  const newest = Math.floor(position);
  const alive = Math.ceil(span - 1e-9);

  const reach = (Math.hypot(grid.width, grid.height) * burst.reach) / 100;
  const originX = ((burst.origin.x + 1) / 2) * grid.width;
  const originY = ((burst.origin.y + 1) / 2) * grid.height;
  const cell = Math.min(grid.cellWidth, grid.cellHeight);
  const step = cell * 0.5;
  const halfWidth = (Math.max(0.2, burst.thickness) * grid.cellWidth) / 2;

  const seen = new Uint8Array(grid.cols * grid.rows);
  const cells: BurstCell[] = [];
  // Marks within half a cell of the origin are skipped, so a burst that has
  // just fired, like the loop's first frame, draws nothing yet.
  const put = (x: number, y: number, glyph: string) => {
    if (Math.hypot(x - originX, y - originY) < cell * 0.5) return;
    const column = Math.floor(x / grid.cellWidth);
    const row = Math.floor(y / grid.cellHeight);
    if (column < 0 || row < 0 || column >= grid.cols || row >= grid.rows) return;
    const index = row * grid.cols + column;
    if (seen[index] || (occupied && occupied[index])) return;
    seen[index] = 1;
    cells.push({ column, glyph, row });
  };

  const explode = (seed: number, age: number) => {
    const turn = hash(seed, 3) * TAU;

    // The flash: a dense disc that swells and collapses at the origin.
    if (age < FLASH_SPAN) {
      const radius = reach * 0.09 * Math.sin((Math.PI * age) / FLASH_SPAN);
      const minColumn = Math.max(0, Math.floor((originX - radius) / grid.cellWidth));
      const maxColumn = Math.min(grid.cols - 1, Math.floor((originX + radius) / grid.cellWidth));
      const minRow = Math.max(0, Math.floor((originY - radius) / grid.cellHeight));
      const maxRow = Math.min(grid.rows - 1, Math.floor((originY + radius) / grid.cellHeight));
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          const x = (column + 0.5) * grid.cellWidth;
          const y = (row + 0.5) * grid.cellHeight;
          const distance = Math.hypot(x - originX, y - originY);
          if (distance > radius) continue;
          const pick = hash(column * 7919 + row, seed + 5);
          const glyph =
            distance > radius * 0.7
              ? pick < 0.5 ? "*" : "+"
              : FLASH_GLYPHS[Math.floor(pick * FLASH_GLYPHS.length)];
          put(x, y, glyph);
        }
      }
    }

    // The shock ring: dots racing outward and thinning as the ring grows.
    if (age < RING_SPAN) {
      const growth = age / RING_SPAN;
      const radius = reach * 0.55 * (1 - (1 - growth) ** 3);
      const keep = 1 - growth;
      const samples = Math.ceil((TAU * radius) / (grid.cellWidth * 0.8));
      for (let sample = 0; sample < samples; sample += 1) {
        if (hash(sample, seed + 41) > keep) continue;
        const angle = turn + (sample / samples) * TAU;
        put(
          originX + Math.cos(angle) * radius,
          originY + Math.sin(angle) * radius,
          growth < 0.4 ? "o" : ".",
        );
      }
    }

    // Dust: a slow cloud that spreads from the blast and thins away, densest
    // at its rim where the blast pushed it, so the burst settles.
    if (age > DUST_START) {
      const radius = reach * (0.05 + 0.22 * Math.sqrt(age));
      const density = 0.55 * (1 - age) ** 1.6;
      const minColumn = Math.max(0, Math.floor((originX - radius) / grid.cellWidth));
      const maxColumn = Math.min(grid.cols - 1, Math.floor((originX + radius) / grid.cellWidth));
      const minRow = Math.max(0, Math.floor((originY - radius) / grid.cellHeight));
      const maxRow = Math.min(grid.rows - 1, Math.floor((originY + radius) / grid.cellHeight));
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          const x = (column + 0.5) * grid.cellWidth;
          const y = (row + 0.5) * grid.cellHeight;
          const rim = Math.hypot(x - originX, y - originY) / radius;
          if (rim > 1) continue;
          if (hash(column * 7919 + row, seed + 61) > density * (0.3 + 0.7 * rim)) continue;
          put(x, y, rim > 0.75 ? ":" : ".");
        }
      }
    }

    // Streaks: spread round the circle with jitter, each with its own speed
    // and life, trailing a tail that shortens as it slows.
    for (let ray = 0; ray < rays; ray += 1) {
      const life = 0.55 + 0.45 * hash(ray, seed + 13);
      if (age >= life) continue;
      const local = age / life;
      const angle = turn + ((ray + 0.2 + 0.6 * hash(ray, seed + 11)) / rays) * TAU;
      // Skewed slow, so most streaks coast on screen after the first blast.
      const velocity = 0.25 + 0.75 * hash(ray, seed + 12) ** 1.5;
      const head = reach * velocity * launch(age);
      const tail = Math.max(0, head - reach * velocity * (0.45 * (1 - local) ** 2.2 + 0.03));
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const stroke = strokeGlyph(angle);
      // Near the end of its life a streak breaks up into sparse dots.
      const keep = local > 0.65 ? (1 - local) / 0.35 : 1;
      const lanes = Math.max(0, Math.floor(halfWidth / (grid.cellWidth * 0.5)));
      for (let distance = head; distance >= Math.max(tail, cell); distance -= step) {
        const sample = Math.round(distance / step);
        if (keep < 1 && hash(sample * 31 + ray, seed + 17) > keep) continue;
        const texture = hash(sample * 53 + ray, seed + 29);
        let glyph = stroke;
        if (distance === head) glyph = local < 0.5 ? "*" : "+";
        else if (keep < 1) glyph = ".";
        else if (texture < 0.08) glyph = "o";
        else if (texture < 0.14) glyph = ":";
        for (let lane = -lanes; lane <= lanes; lane += 1) {
          const offset = lane * grid.cellWidth * 0.5;
          put(
            originX + dx * distance - dy * offset,
            originY + dy * distance + dx * offset,
            glyph,
          );
        }
      }
    }

    // Sparks: single characters flung out at their own speeds.
    for (let spark = 0; spark < rays * 4; spark += 1) {
      const life = 0.35 + 0.65 * hash(spark, seed + 23);
      if (age >= life) continue;
      const angle = turn + hash(spark, seed + 21) * TAU;
      // Mostly slow embers that drift and fade, with a few fast sparks.
      const velocity = 0.08 + 0.9 * hash(spark, seed + 22) ** 1.4;
      const distance = reach * velocity * 0.9 * launch(age);
      const glyph =
        age / life > 0.7
          ? "."
          : SPARK_GLYPHS[Math.floor(hash(spark, seed + 24) * SPARK_GLYPHS.length)];
      put(
        originX + Math.cos(angle) * distance,
        originY + Math.sin(angle) * distance,
        glyph,
      );
    }
  };

  // Newest first, so a fresh burst draws over the remains of older ones.
  for (let back = 0; back < alive; back += 1) {
    const start = newest - back;
    const age = (position - start) / span;
    if (age >= 1) continue;
    explode(((start % count) + count) % count, age);
  }
  return cells;
}
