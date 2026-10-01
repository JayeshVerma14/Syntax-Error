/**
 * The logo cut into parts for the cinematic and dot-matrix reveals. A part
 * is a connected shape of the block grid: a letter, a ring, a bar. When a
 * logo has more shapes than wanted, the smallest joins its nearest
 * neighbour; when it has fewer, the biggest is sliced across its long side,
 * at a slant, until the count is met.
 *
 * The cut is computed once per prepared logo and part count and cached on
 * the logo object, never per frame.
 */

import type { LogoArt } from "./engine-logo-art";

export type LogoParts = Readonly<{
  /** Per part: first column, first row, last column, last row. */
  bounds: Int32Array;
  /** Per part: centre column, centre row (block centres), cell count, reach in cells. */
  centres: Float32Array;
  count: number;
  /** The four neighbours of each block (left, right, top, bottom), or -1. */
  neighbours: Int32Array;
  /** Block indices grouped by part, then by colour. */
  order: Uint32Array;
  /** The colours an untinted logo is drawn in. */
  palette: readonly string[];
  /** Part of each block. */
  partOf: Uint16Array;
  /** Where each part's colour runs start in `runs`; count + 1 entries. */
  partRuns: Int32Array;
  /** Where each part's blocks start in `order`; count + 1 entries. */
  partStart: Int32Array;
  /** The part that docks at each rank: first the biggest, last the second biggest. */
  rankPart: Uint16Array;
  /** Rank of each part. */
  rankOf: Uint16Array;
  /** Colour runs inside `order`: start, end, palette index, three ints each. */
  runs: Int32Array;
  /** Palette index of each block. */
  tone: Uint8Array;
}>;

/** The block grid of a logo without its bitmap, which is all a cut needs. */
type Grid = Readonly<{ blocks: Float32Array; cols: number; count: number; rows: number }>;

const MAX_PALETTE = 16;
const MIN_SLICE_CELLS = 8;

type Group = { cells: number[]; sx: number; sy: number };

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 307, 2_654_435_761) ^ Math.imul(salt + 11, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** Block index at each grid cell, or -1. */
function cellMap(grid: Grid): Int32Array {
  const map = new Int32Array(grid.cols * grid.rows).fill(-1);
  for (let index = 0; index < grid.count; index += 1) {
    const column = grid.blocks[index * 5];
    const row = grid.blocks[index * 5 + 1];
    if (column >= 0 && column < grid.cols && row >= 0 && row < grid.rows) {
      map[row * grid.cols + column] = index;
    }
  }
  return map;
}

function neighboursOf(grid: Grid, map: Int32Array): Int32Array {
  const out = new Int32Array(grid.count * 4).fill(-1);
  const { cols, rows } = grid;
  for (let index = 0; index < grid.count; index += 1) {
    const column = grid.blocks[index * 5];
    const row = grid.blocks[index * 5 + 1];
    const at = row * cols + column;
    if (column > 0) out[index * 4] = map[at - 1];
    if (column < cols - 1) out[index * 4 + 1] = map[at + 1];
    if (row > 0) out[index * 4 + 2] = map[at - cols];
    if (row < rows - 1) out[index * 4 + 3] = map[at + cols];
  }
  return out;
}

function groupOf(cells: number[], grid: Grid): Group {
  let sx = 0;
  let sy = 0;
  for (const cell of cells) {
    sx += grid.blocks[cell * 5] + 0.5;
    sy += grid.blocks[cell * 5 + 1] + 0.5;
  }
  return { cells, sx, sy };
}

/** The cells four-connected to `seed`, each marked as seen. */
function floodFill(seed: number, neighbours: Int32Array, seen: Uint8Array): number[] {
  const cells: number[] = [];
  const stack = [seed];
  seen[seed] = 1;
  while (stack.length > 0) {
    const cell = stack.pop() ?? 0;
    cells.push(cell);
    for (let side = 0; side < 4; side += 1) {
      const next = neighbours[cell * 4 + side];
      if (next >= 0 && !seen[next]) {
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return cells;
}

/** Four-connected shapes of the grid. */
function connectedGroups(grid: Grid, neighbours: Int32Array): Group[] {
  const seen = new Uint8Array(grid.count);
  const groups: Group[] = [];
  // Bound before the scan, so the loop hands it a number only.
  const shapeFrom = (seed: number) => {
    groups.push(groupOf(floodFill(seed, neighbours, seen), grid));
  };
  for (let seed = 0; seed < grid.count; seed += 1) {
    if (!seen[seed]) shapeFrom(seed);
  }
  return groups;
}

/** Index of the group with the most (or, with `fewest`, the fewest) cells. */
function extremeGroup(groups: readonly Group[], fewest: boolean): number {
  let pick = 0;
  for (let index = 1; index < groups.length; index += 1) {
    const size = groups[index].cells.length;
    if (fewest ? size < groups[pick].cells.length : size > groups[pick].cells.length) pick = index;
  }
  return pick;
}

/** Index of the group whose centre is nearest the centre of group `from`. */
function nearestGroup(groups: readonly Group[], from: number): number {
  const fx = groups[from].sx / groups[from].cells.length;
  const fy = groups[from].sy / groups[from].cells.length;
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < groups.length; index += 1) {
    if (index === from) continue;
    const other = groups[index];
    const distance = Math.hypot(other.sx / other.cells.length - fx, other.sy / other.cells.length - fy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** Joins the smallest group into the one with the nearest centre until `wanted` remain. */
function mergeDown(groups: Group[], wanted: number): void {
  const mergeSmallest = () => {
    const small = extremeGroup(groups, true);
    const into = groups[nearestGroup(groups, small)];
    const from = groups[small];
    for (const cell of from.cells) into.cells.push(cell);
    into.sx += from.sx;
    into.sy += from.sy;
    groups.splice(small, 1);
  };
  while (groups.length > wanted) mergeSmallest();
}

/** Two halves of a group, cut across its long side at a slight slant. */
function sliceGroup(group: Group, grid: Grid, salt: number): [Group, Group] {
  const count = group.cells.length;
  const mx = group.sx / count;
  const my = group.sy / count;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const cell of group.cells) {
    const dx = grid.blocks[cell * 5] + 0.5 - mx;
    const dy = grid.blocks[cell * 5 + 1] + 0.5 - my;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  // The long axis, turned a little so cuts read as slashes rather than seams.
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy) + (hash(salt, 41) - 0.5) * 0.9;
  return halvesAlong(group, grid, Math.cos(angle), Math.sin(angle));
}

/** A group split at the median of its cells projected on (ax, ay). */
function halvesAlong(group: Group, grid: Grid, ax: number, ay: number): [Group, Group] {
  const count = group.cells.length;
  const mx = group.sx / count;
  const my = group.sy / count;
  const along = group.cells.map((cell) => (grid.blocks[cell * 5] - mx) * ax + (grid.blocks[cell * 5 + 1] - my) * ay);
  const median = [...along].sort((a, b) => a - b)[Math.floor(count / 2)];
  const low = group.cells.filter((_, index) => along[index] < median);
  const high = group.cells.filter((_, index) => along[index] >= median);
  if (low.length > 0 && high.length > 0) return [groupOf(low, grid), groupOf(high, grid)];
  // Every cell projects the same: halve by position in the list.
  const half = Math.floor(count / 2);
  return [groupOf(group.cells.slice(0, half), grid), groupOf(group.cells.slice(half), grid)];
}

/** Slices the biggest group until `wanted` exist or the biggest is too small to cut. */
function splitUp(groups: Group[], wanted: number, grid: Grid): void {
  const sliceBiggest = () => {
    const big = extremeGroup(groups, false);
    if (groups[big].cells.length < MIN_SLICE_CELLS) return false;
    const [low, high] = sliceGroup(groups[big], grid, groups.length);
    groups.splice(big, 1, low, high);
    return true;
  };
  for (let guard = 0; groups.length < wanted && guard < 64; guard += 1) {
    if (!sliceBiggest()) return;
  }
}

type ColourTally = Readonly<{ count: Map<number, number>; keyOf: Int32Array; sums: Map<number, number[]> }>;

/** Each block's colour cut to 3 bits a channel, with how often each key occurs and its summed colour. */
function tallyColours(grid: Grid): ColourTally {
  const keyOf = new Int32Array(grid.count);
  const count = new Map<number, number>();
  const sums = new Map<number, number[]>();
  for (let index = 0; index < grid.count; index += 1) {
    const r = grid.blocks[index * 5 + 2];
    const g = grid.blocks[index * 5 + 3];
    const b = grid.blocks[index * 5 + 4];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    keyOf[index] = key;
    count.set(key, (count.get(key) ?? 0) + 1);
    const sum = sums.get(key) ?? [0, 0, 0];
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
    sums.set(key, sum);
  }
  return { count, keyOf, sums };
}

/** Index of the palette mean nearest a colour. */
function nearestMean(means: readonly (readonly number[])[], r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < means.length; index += 1) {
    const distance = (r - means[index][0]) ** 2 + (g - means[index][1]) ** 2 + (b - means[index][2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** A small palette for untinted logos: frequent colours kept, rare ones mapped to the nearest. */
function quantize(grid: Grid): { palette: string[]; tone: Uint8Array } {
  const { count, keyOf, sums } = tallyColours(grid);
  const mean = (key: number) => {
    const sum = sums.get(key) ?? [0, 0, 0];
    const n = count.get(key) ?? 1;
    return [sum[0] / n, sum[1] / n, sum[2] / n];
  };
  const kept = [...count.keys()].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0)).slice(0, MAX_PALETTE);
  const means = kept.map(mean);
  const slot = new Map<number, number>(kept.map((key, index) => [key, index]));
  const slotOf = (key: number) => {
    const known = slot.get(key);
    if (known !== undefined) return known;
    const [r, g, b] = mean(key);
    const nearest = nearestMean(means, r, g, b);
    slot.set(key, nearest);
    return nearest;
  };
  const tone = Uint8Array.from(keyOf, slotOf);
  const palette = means.map(([r, g, b]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`);
  return { palette: palette.length > 0 ? palette : ["#FFFFFF"], tone };
}

/**
 * Docking order: the biggest part lands first as the anchor, the second
 * biggest lands last as the lock, and the rest go round the mark clockwise
 * from the left.
 */
function ranking(groups: Group[], grid: Grid): Uint16Array {
  const bySize = groups.map((_, index) => index).sort((a, b) => groups[b].cells.length - groups[a].cells.length);
  const anchor = bySize[0];
  const lock = bySize.length > 1 ? bySize[1] : -1;
  const midX = grid.cols / 2;
  const midY = grid.rows / 2;
  const angleOf = (index: number) => {
    const group = groups[index];
    const angle = Math.atan2(group.sy / group.cells.length - midY, group.sx / group.cells.length - midX);
    return angle + Math.PI;
  };
  const middle = groups
    .map((_, index) => index)
    .filter((index) => index !== anchor && index !== lock)
    .sort((a, b) => angleOf(a) - angleOf(b));
  const order = [anchor, ...middle];
  if (lock >= 0) order.push(lock);
  return Uint16Array.from(order);
}

type PartShapes = Readonly<{ bounds: Int32Array; centres: Float32Array; partOf: Uint16Array }>;

/** Each block's part, and each part's centre, size, reach and bounds. */
function measureParts(grid: Grid, groups: readonly Group[]): PartShapes {
  const partOf = new Uint16Array(grid.count);
  const centres = new Float32Array(groups.length * 4);
  const bounds = new Int32Array(groups.length * 4);
  const measure = (part: number) => {
    const group = groups[part];
    const n = group.cells.length;
    const cx = group.sx / n;
    const cy = group.sy / n;
    let reach = 0;
    let minColumn = grid.cols;
    let minRow = grid.rows;
    let maxColumn = 0;
    let maxRow = 0;
    for (const cell of group.cells) {
      partOf[cell] = part;
      const column = grid.blocks[cell * 5];
      const row = grid.blocks[cell * 5 + 1];
      reach = Math.max(reach, Math.hypot(column + 0.5 - cx, row + 0.5 - cy));
      minColumn = Math.min(minColumn, column);
      minRow = Math.min(minRow, row);
      maxColumn = Math.max(maxColumn, column);
      maxRow = Math.max(maxRow, row);
    }
    const at = part * 4;
    centres[at] = cx;
    centres[at + 1] = cy;
    centres[at + 2] = n;
    centres[at + 3] = reach + 0.5;
    bounds[at] = minColumn;
    bounds[at + 1] = minRow;
    bounds[at + 2] = maxColumn;
    bounds[at + 3] = maxRow;
  };
  for (let part = 0; part < groups.length; part += 1) measure(part);
  return { bounds, centres, partOf };
}

type PartRuns = Readonly<{ partRuns: Int32Array; partStart: Int32Array; runs: Int32Array }>;

/** Where each part's blocks and colour runs start in the part-then-colour block order. */
function runsOf(order: Uint32Array, partOf: Uint16Array, tone: Uint8Array, count: number): PartRuns {
  const partStart = new Int32Array(count + 1);
  const partRuns = new Int32Array(count + 1);
  const runs = new Int32Array(order.length * 3);
  const total = order.length;
  let written = 0;
  let cursor = 0;
  for (let part = 0; part < count; part += 1) {
    partStart[part] = cursor;
    partRuns[part] = written;
    while (cursor < total && partOf[order[cursor]] === part) {
      const runTone = tone[order[cursor]];
      const start = cursor;
      while (cursor < total && partOf[order[cursor]] === part && tone[order[cursor]] === runTone) cursor += 1;
      runs[written * 3] = start;
      runs[written * 3 + 1] = cursor;
      runs[written * 3 + 2] = runTone;
      written += 1;
    }
  }
  partStart[count] = cursor;
  partRuns[count] = written;
  // Runs past the last written one stay zero; readers only go as far as partRuns says.
  return { partRuns, partStart, runs };
}

/** Block indices sorted by part, then colour, so each colour run of a part is one batch to fill. */
function blockOrder(partOf: Uint16Array, tone: Uint8Array): Uint32Array {
  const order = new Uint32Array(partOf.length);
  for (let index = 0; index < order.length; index += 1) order[index] = index;
  return order.sort((a, b) => partOf[a] - partOf[b] || tone[a] - tone[b] || a - b);
}

function assemble(grid: Grid, groups: Group[], neighbours: Int32Array): LogoParts {
  const count = groups.length;
  const rankPart = ranking(groups, grid);
  const rankOf = new Uint16Array(count);
  rankPart.forEach((part, rank) => {
    rankOf[part] = rank;
  });
  const { bounds, centres, partOf } = measureParts(grid, groups);
  const { palette, tone } = quantize(grid);
  const order = blockOrder(partOf, tone);
  const { partRuns, partStart, runs } = runsOf(order, partOf, tone, count);
  return {
    bounds,
    centres,
    count,
    neighbours,
    order,
    palette,
    partOf,
    partRuns,
    partStart,
    rankOf,
    rankPart,
    runs,
    tone,
  };
}

/** Cuts a logo into `wanted` parts (fewer only when it has too few blocks to slice). */
export function cutLogoParts(art: LogoArt, wanted: number): LogoParts {
  return cutGrid({ blocks: art.blocks, cols: art.cols, count: art.count, rows: art.rows }, wanted);
}

function cutGrid(grid: Grid, wanted: number): LogoParts {
  const neighbours = neighboursOf(grid, cellMap(grid));
  const target = Math.max(1, Math.min(32, Math.round(wanted)));
  const groups = grid.count > 0 ? connectedGroups(grid, neighbours) : [];
  if (groups.length > target) mergeDown(groups, target);
  else splitUp(groups, target, grid);
  return assemble(grid, groups, neighbours);
}

const cache = new WeakMap<LogoArt, Map<number, LogoParts>>();

/** The logo's parts, cut once per logo and part count. */
export function logoPartsFor(art: LogoArt, wanted: number): LogoParts {
  const key = Math.max(1, Math.min(32, Math.round(wanted)));
  let byCount = cache.get(art);
  if (!byCount) {
    byCount = new Map();
    cache.set(art, byCount);
  }
  const hit = byCount.get(key);
  if (hit) return hit;
  const parts = cutLogoParts(art, key);
  byCount.set(key, parts);
  return parts;
}
