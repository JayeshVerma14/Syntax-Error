/**
 * The painted layer. Generated units come from the sampled source; this layer
 * is what the user paints on top, and it wins wherever it has an entry.
 *
 * It is stored as a plain `{ "col,row": value }` record so it survives runtime
 * persistence and settings transfer as ordinary JSON. A value is either a hex
 * colour (painted) or `ERASED` (deliberately blank, so a stroke can knock holes
 * in generated artwork rather than only adding to it).
 */

import {
  ERASED,
  MAX_BRUSH_CELLS,
  type PatternKind,
} from "./engine-constants";

export type EditLayer = Readonly<Record<string, string>>;

export function cellKey(column: number, row: number): string {
  return `${column},${row}`;
}

export function readEditLayer(value: unknown): EditLayer {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const key of Object.keys(source)) {
    const entry = source[key];
    if (typeof entry !== "string") continue;
    if (entry === ERASED || /^#[0-9A-F]{6}$/i.test(entry)) {
      output[key] = entry === ERASED ? ERASED : entry.toUpperCase();
    }
  }
  return output;
}

/** Cells a square brush of `size` covers when centred on one cell. */
export function brushCells(
  column: number,
  row: number,
  size: number,
): readonly (readonly [number, number])[] {
  const side = Math.max(1, Math.min(MAX_BRUSH_CELLS, Math.round(size)));
  const half = Math.floor(side / 2);
  const cells: [number, number][] = [];
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      cells.push([column - half + x, row - half + y]);
    }
  }
  return cells;
}

/**
 * Bresenham between two cells, so a fast drag or a Shift-click paints a
 * continuous run instead of dotting only where pointer events landed.
 */
export function cellLine(
  fromColumn: number,
  fromRow: number,
  toColumn: number,
  toRow: number,
): readonly (readonly [number, number])[] {
  const points: [number, number][] = [];
  let x = fromColumn;
  let y = fromRow;
  const dx = Math.abs(toColumn - x);
  const dy = -Math.abs(toRow - y);
  const stepX = x < toColumn ? 1 : -1;
  const stepY = y < toRow ? 1 : -1;
  let error = dx + dy;
  // Bounded so a malformed coordinate cannot spin here.
  for (let guard = 0; guard < 4096; guard += 1) {
    points.push([x, y]);
    if (x === toColumn && y === toRow) break;
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
  return points;
}

export type StrokeInput = Readonly<{
  color: string;
  cols: number;
  erase: boolean;
  layer: EditLayer;
  points: readonly (readonly [number, number])[];
  rows: number;
  size: number;
}>;

/** Applies one complete stroke and returns the next layer. */
export function applyStroke({
  color,
  cols,
  erase,
  layer,
  points,
  rows,
  size,
}: StrokeInput): EditLayer {
  const next: Record<string, string> = { ...layer };
  const value = erase ? ERASED : color.toUpperCase();
  for (const [column, row] of points) {
    for (const [x, y] of brushCells(column, row, size)) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      next[cellKey(x, y)] = value;
    }
  }
  return next;
}

function patternHit(
  kind: PatternKind,
  column: number,
  row: number,
  scale: number,
  angleRadians: number,
): number {
  // Rotate the sampling coordinate so one pattern serves every angle.
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  const x = (column * cosine + row * sine) / Math.max(1, scale);
  const y = (row * cosine - column * sine) / Math.max(1, scale);

  if (kind === "checker") {
    return (Math.floor(x) + Math.floor(y)) % 2 === 0 ? 1 : 0;
  }
  if (kind === "stripe") {
    return Math.floor(x) % 2 === 0 ? 1 : 0;
  }
  if (kind === "dots") {
    const dx = x - Math.floor(x) - 0.5;
    const dy = y - Math.floor(y) - 0.5;
    return dx * dx + dy * dy < 0.16 ? 1 : 0;
  }
  if (kind === "ramp") {
    // A left-to-right tonal sweep, useful as a gradient fill for stickers.
    return x - Math.floor(x);
  }
  let hash = Math.imul(column + 1, 374_761_393) ^ Math.imul(row + 1, 668_265_263);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_295;
}

export type PatternFillInput = Readonly<{
  angleDegrees: number;
  cols: number;
  inks: readonly string[];
  kind: PatternKind;
  layer: EditLayer;
  rows: number;
  scale: number;
}>;

/**
 * Stamps a pattern across the whole sheet into the painted layer. Cells the
 * pattern does not cover are left untouched, so a fill can be layered.
 */
export function fillPattern({
  angleDegrees,
  cols,
  inks,
  kind,
  layer,
  rows,
  scale,
}: PatternFillInput): EditLayer {
  const next: Record<string, string> = { ...layer };
  const palette = inks.length > 0 ? inks : ["#141414"];
  const angleRadians = (angleDegrees * Math.PI) / 180;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      const hit = patternHit(kind, column, row, scale, angleRadians);
      if (hit <= 0) continue;
      const index = Math.min(
        palette.length - 1,
        Math.max(0, Math.floor(hit * palette.length)),
      );
      next[cellKey(column, row)] = palette[index].toUpperCase();
    }
  }
  return next;
}

function channels(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Squared RGB distance is enough to pick the visually closest ink. */
export function nearestInk(hex: string, inks: readonly string[]): string {
  if (inks.length === 0) return hex;
  const [red, green, blue] = channels(hex);
  let best = inks[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const ink of inks) {
    const [r, g, b] = channels(ink);
    const distance =
      (red - r) * (red - r) + (green - g) * (green - g) + (blue - b) * (blue - b);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = ink;
    }
  }
  return best;
}

/**
 * Converts every painted cell to its closest selected ink. This is the
 * reference tool's "remap current art": change the palette, then bring the
 * artwork you already made onto it.
 */
export function remapLayer(layer: EditLayer, inks: readonly string[]): EditLayer {
  const next: Record<string, string> = {};
  for (const key of Object.keys(layer)) {
    const value = layer[key];
    next[key] = value === ERASED ? ERASED : nearestInk(value, inks);
  }
  return next;
}
