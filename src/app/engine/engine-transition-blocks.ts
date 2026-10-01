/**
 * Two block fillers.
 *
 * Mosaic: the frame dissolves into square pixels of three sizes. Each pixel
 * lands white-hot and cools to dark, sweeping along the travel direction with
 * a scatter, so the picture breaks up into a mosaic before it goes dark. On
 * the way out every pixel burns off in turn, flaring and fading to show the
 * next shot. A beat flashes a fresh flurry of the dark pixels white-hot.
 *
 * Grid wipe: a halftone of squares grows along a chevron wave until the
 * squares close into a solid cover; each square carries a hot core that cools
 * as it grows. On the way out the squares shrink back to glowing points. A
 * beat lights a halftone of hot dots across the dark.
 *
 * The bass keeps the hot squares of both glowing hotter. Dark squares that
 * touch along a row merge into one rectangle, so a mostly covered frame is a
 * handful of fills.
 */

import {
  clamp01,
  drawDarkTexture,
  easeInOutCubic,
  fillDark,
  fillQuads,
  gridStart,
  hash,
  rgba,
  type Stage,
  stageOf,
  type TransitionPaint,
} from "./engine-transition-kit";

/** Share of a pass one pixel spends cooling from hot to dark. */
const MOSAIC_FLASH = 0.24;
const HEAT_LEVELS = 4;

type Tiles = {
  /** Dark rectangles as x, y, width, height. */
  dark: number[];
  /** Hot squares as x, y, width, height, bucketed by heat, so each level is one fill style. */
  hot: number[][];
};

const emptyTiles = (): Tiles => ({ dark: [], hot: Array.from({ length: HEAT_LEVELS }, () => []) });

/** Gathers whole dark cells of a row into runs, so neighbours become one rectangle. */
type Run = { from: number; to: number; top: number; size: number };

function flushRun(tiles: Tiles, run: Run): void {
  if (run.to > run.from) tiles.dark.push(run.from, run.top, run.to - run.from, run.size);
  run.from = run.to;
}

function heatAlpha(paint: TransitionPaint): number {
  return clamp01(0.35 + 0.75 * paint.intensity);
}

function fillHot(paint: TransitionPaint, hot: readonly (readonly number[])[], floor: number): void {
  const alpha = heatAlpha(paint);
  // The bass keeps the cooling squares glowing hotter.
  const lift = 0.5 * paint.drive.bass;
  paint.context.globalAlpha = 1;
  hot.forEach((squares, level) => {
    const share = floor + ((1 - floor) * (level + 1)) / HEAT_LEVELS;
    fillQuads(paint, squares, rgba(paint.hot, alpha * (share + (1 - share) * lift)));
  });
}

function pushHot(tiles: Tiles, heat: number, x: number, y: number, side: number): void {
  const level = Math.min(HEAT_LEVELS - 1, Math.floor(heat * HEAT_LEVELS));
  tiles.hot[level].push(x, y, side, side);
}

/** How hot a beat flashes a dark mosaic pixel: a fresh flurry every beat, thinning as the beat fades. */
function beatFlurry(paint: TransitionPaint, id: number): number {
  const { beat, beatSeed } = paint.drive;
  if (beat <= 0) return 0;
  return hash(id, beatSeed * 31 + paint.seed) < 0.3 * beat ? Math.min(1, 0.55 + beat) : 0;
}

/** When a mosaic pixel turns, as a share of its pass: bottom first, with scatter. */
function mosaicStart(paint: TransitionPaint, y: number, size: number, id: number, salt: number): number {
  const along = clamp01(1 - (y + size / 2) / paint.height);
  const order = 0.6 * along + 0.4 * hash(id, paint.seed * 7 + salt);
  return order * (1 - MOSAIC_FLASH);
}

/** One mosaic pixel: queues its hot square and says whether it is dark. */
function mosaicTile(paint: TransitionPaint, stage: Stage, tiles: Tiles, x: number, y: number, size: number, id: number): boolean {
  const { enter, leave } = stage;
  let heat = 0;
  let dark = false;
  if (enter < 1) {
    const start = mosaicStart(paint, y, size, id, 1);
    if (enter < start) return false;
    dark = true;
    heat = 1 - (enter - start) / MOSAIC_FLASH;
  } else if (leave <= 0) {
    dark = true;
  } else {
    const start = mosaicStart(paint, y, size, id, 2);
    if (leave < start) dark = true;
    else heat = 1 - (leave - start) / MOSAIC_FLASH;
  }
  if (dark) heat = Math.max(heat, beatFlurry(paint, id));
  if (heat > 0) {
    const inset = size * 0.05;
    pushHot(tiles, heat * heat, x + inset, y + inset, size - inset * 2);
  }
  return dark;
}

/** One grid pixel of the mosaic, split into 1, 4 or 16; says whether all of it is dark. */
function mosaicCell(paint: TransitionPaint, stage: Stage, tiles: Tiles, x: number, y: number, cell: number): boolean {
  // Some grid pixels split into 2x2 or 4x4, so the mosaic has three scales.
  const pick = hash(cell, paint.seed + 3);
  const split = pick < 0.42 ? 1 : pick < 0.78 ? 2 : 4;
  const size = paint.block / split;
  const parts: number[] = [];
  for (let row = 0; row < split; row += 1) {
    for (let column = 0; column < split; column += 1) {
      const left = x + column * size;
      const top = y + row * size;
      if (mosaicTile(paint, stage, tiles, left, top, size, cell * 16 + row * 4 + column)) parts.push(left, top, size, size);
    }
  }
  if (parts.length === split * split * 4) return true;
  for (const value of parts) tiles.dark.push(value);
  return false;
}

function mosaicTiles(paint: TransitionPaint): Tiles {
  const { block, height, width } = paint;
  const stage = stageOf(paint.u, paint.hold);
  const tiles = emptyTiles();
  const x0 = gridStart(width, block);
  const y0 = gridStart(height, block);
  // Bound here so the loops hand over numbers only.
  const whole = (x: number, y: number, cell: number) => mosaicCell(paint, stage, tiles, x, y, cell);
  const close = (run: Run) => flushRun(tiles, run);
  let cell = 0;
  for (let y = y0; y < height; y += block) {
    const run: Run = { from: x0, size: block, to: x0, top: y };
    for (let x = x0; x < width; x += block) {
      cell += 1;
      if (whole(x, y, cell)) run.to = x + block;
      else {
        close(run);
        run.from = x + block;
        run.to = x + block;
      }
    }
    close(run);
  }
  return tiles;
}

export function drawMosaic(paint: TransitionPaint): void {
  const { enter, leave } = stageOf(paint.u, paint.hold);
  if (enter >= 1 && leave <= 0 && paint.drive.beat <= 0) {
    // Held: one fill for the whole frame.
    paint.context.globalAlpha = paint.cover;
    fillQuads(paint, [0, 0, paint.width, paint.height], paint.fill);
    paint.context.globalAlpha = 1;
    drawDarkTexture(paint, 1, null);
    return;
  }
  const tiles = mosaicTiles(paint);
  fillDark(paint, tiles.dark, 1);
  fillHot(paint, tiles.hot, 0);
}

/** Share of a pass one grid square spends growing. */
const GRID_GROW = 0.32;

/**
 * One square of the grid wipe and its hot core; says whether it is closed,
 * so closed neighbours can merge. An open square queues its own dark.
 */
function gridSquare(paint: TransitionPaint, stage: Stage, tiles: Tiles, x: number, y: number, cell: number, id: number): boolean {
  const { enter, leave } = stage;
  const held = enter >= 1 && leave <= 0;
  const covering = enter < 1;
  // A chevron: the middle of the frame leads, the sides follow.
  const along = clamp01(1 - (y + cell / 2) / paint.height);
  const across = Math.abs((x + cell / 2) / paint.width - 0.5) * 2;
  const order = clamp01(0.8 * along + 0.16 * across + 0.08 * (hash(id, paint.seed) - 0.5));
  const grown = held ? 1 : clamp01(((covering ? enter : leave) - order * (1 - GRID_GROW)) / GRID_GROW);
  const share = held ? 1 : covering ? easeInOutCubic(grown) : 1 - easeInOutCubic(grown);
  if (share <= 0.001) return false;
  const closed = share >= 0.999;
  const side = cell * share;
  const middleX = x + cell / 2;
  const middleY = y + cell / 2;
  if (!closed) tiles.dark.push(middleX - side / 2, middleY - side / 2, side, side);
  // The hot core cools as the square grows and flares as it shrinks; a beat
  // lights a core in every square, so the dark flashes a halftone.
  const heat = Math.max(held ? 0 : covering ? 1 - grown : grown, 0.6 * paint.drive.beat);
  const core = side * heat ** 0.8 * 0.9;
  if (heat > 0.02 && core > 0.5) pushHot(tiles, heat, middleX - core / 2, middleY - core / 2, core);
  return closed;
}

function gridTiles(paint: TransitionPaint): Tiles {
  const { block, height, width } = paint;
  const stage = stageOf(paint.u, paint.hold);
  const cell = block / 2;
  const tiles = emptyTiles();
  const x0 = gridStart(width, cell);
  const y0 = gridStart(height, cell);
  // Bound here so the loops hand over numbers only.
  const closed = (x: number, y: number, id: number) => gridSquare(paint, stage, tiles, x, y, cell, id);
  const close = (run: Run) => flushRun(tiles, run);
  let id = 0;
  for (let y = y0; y < height; y += cell) {
    // Closed squares overlap a hair, so a closed cover has no seams.
    const run: Run = { from: x0, size: cell + 0.5, to: x0, top: y - 0.25 };
    for (let x = x0; x < width; x += cell) {
      id += 1;
      if (closed(x, y, id)) {
        if (run.to <= run.from) run.from = x - 0.25;
        run.to = x + cell + 0.25;
      } else close(run);
    }
    close(run);
  }
  return tiles;
}

export function drawGridWipe(paint: TransitionPaint): void {
  const { enter, leave } = stageOf(paint.u, paint.hold);
  const held = enter >= 1 && leave <= 0;
  if (held && paint.drive.beat <= 0) {
    paint.context.globalAlpha = paint.cover;
    fillQuads(paint, [0, 0, paint.width, paint.height], paint.fill);
    paint.context.globalAlpha = 1;
    drawDarkTexture(paint, 1, null);
    return;
  }
  const tiles = gridTiles(paint);
  fillDark(paint, tiles.dark, held ? 1 : 0.6);
  fillHot(paint, tiles.hot, 0.45);
}
