/**
 * Character choice and typesetting for glyph units.
 *
 * A glyph cell either reads the tone ramp or spells a phrase. In fixed sizing
 * the ramp gains an empty step below its first entry, so the darkest cells
 * stay blank the way a character film leaves shadow as bare background; in
 * tone sizing every visible cell keeps a character and size carries the tone.
 */

import { SCRAMBLE_GLYPHS, type GlyphFace } from "./engine-constants";

const FACE_STACKS: Readonly<Record<GlyphFace, string>> = {
  mono: 'Consolas, "Cascadia Mono", "SF Mono", Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace',
  sans: '"Inter Variable", Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
};

/**
 * Font sizes snap to 2px steps. The browser caches rasterized glyphs per font
 * size, so a continuous size per mark (which tone and perspective both
 * produce) misses that cache on every draw: measured at 2000 glyphs on a
 * 3240px backing, unique sizes cost 1067ms and 2px steps cost 135ms. A 2px
 * step is below what reads as a size change at these densities.
 */
const GLYPH_SIZE_STEP = 2;
const glyphFonts = new Map<string, string>();

export function glyphFont(size: number, face: GlyphFace, bold: boolean): string {
  const snapped = Math.max(
    GLYPH_SIZE_STEP,
    Math.round(size / GLYPH_SIZE_STEP) * GLYPH_SIZE_STEP,
  );
  const key = `${face}|${bold ? 1 : 0}|${snapped}`;
  let font = glyphFonts.get(key);
  if (!font) {
    font = `${bold ? 700 : 400} ${snapped}px ${FACE_STACKS[face]}`;
    glyphFonts.set(key, font);
  }
  return font;
}

function cellHash(column: number, row: number, salt: number): number {
  let hash = Math.imul(column + 101, 2_654_435_761);
  hash ^= Math.imul(row + 211, 1_597_334_677);
  hash ^= Math.imul(salt + 307, 3_812_015_801);
  hash = Math.imul(hash ^ (hash >>> 15), 2_246_822_519);
  return ((hash ^ (hash >>> 13)) >>> 0) / 4_294_967_295;
}

export type GlyphPick = Readonly<{
  cols: number;
  column: number;
  /** Tone after response and floor, 0 upward. */
  level: number;
  /** Whether sizing is fixed, which adds the empty step. */
  fixed: boolean;
  glyphs: readonly string[];
  phrase: string;
  row: number;
  /** Motion's scramble offset; non-zero borrows another character. */
  shift: number;
  useRamp: boolean;
}>;

/** The character for one cell, or null when the cell stays empty. */
export function pickGlyph(pick: GlyphPick): string | null {
  const { glyphs, level } = pick;
  if (level <= 0) return null;
  if (pick.fixed) {
    // The ramp plus one empty step: the faintest band draws nothing.
    const steps = glyphs.length + 1;
    if (Math.floor(Math.min(0.9999, level) * steps) === 0) return null;
  }
  if (pick.phrase.length > 0) {
    if (pick.shift !== 0) {
      return SCRAMBLE_GLYPHS[
        Math.floor(cellHash(pick.column, pick.row, pick.shift) * SCRAMBLE_GLYPHS.length)
      ];
    }
    // Reading order across the whole grid, so each row continues the text.
    const index = (pick.row * pick.cols + pick.column) % pick.phrase.length;
    const character = pick.phrase[index];
    return character.trim().length > 0 ? character : null;
  }
  if (glyphs.length === 0) return "*";
  let base: number;
  if (!pick.useRamp) {
    base = (pick.column + pick.row) % glyphs.length;
  } else if (pick.fixed) {
    const steps = glyphs.length + 1;
    base = Math.min(glyphs.length - 1, Math.floor(Math.min(0.9999, level) * steps) - 1);
  } else {
    base = Math.min(glyphs.length - 1, Math.max(0, Math.floor(level * glyphs.length)));
  }
  const length = glyphs.length;
  // Motion can borrow a neighbouring character, for scrambles and falling code.
  return glyphs[(((base + pick.shift) % length) + length) % length];
}

/** Smooth value noise, so backdrop characters come in runs rather than static. */
function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = cellHash(x0, y0, 5);
  const b = cellHash(x0 + 1, y0, 5);
  const c = cellHash(x0, y0 + 1, 5);
  const d = cellHash(x0 + 1, y0 + 1, 5);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * The quiet field an empty cell carries: mostly dots, runs of dashes, the
 * odd arrow, and a rare bit of binary, like the idle screen behind the
 * reference films.
 */
export function backdropGlyph(column: number, row: number): string {
  if (cellHash(column, row, 9) < 0.025) {
    return cellHash(column, row, 10) < 0.5 ? "0" : "1";
  }
  const flow = valueNoise(column / 7, row / 3);
  if (flow < 0.58) return ".";
  if (flow < 0.84) return "-";
  return ">";
}

/** Whether an empty cell carries a backdrop mark at this density (0..1). */
export function backdropShown(column: number, row: number, density: number): boolean {
  return cellHash(column, row, 11) < density;
}
