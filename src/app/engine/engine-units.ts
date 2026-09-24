/**
 * The unit vocabulary. Every shape draws inside a cell box of side `size`
 * centred on the cell, so shape can be swapped without touching the grid,
 * tone, or palette stages.
 *
 * `glyph` is the extension the reference tool lacked. Every printable
 * character or symbol can become the repeated unit, selected either by tone
 * ramp or by position.
 */

import {
  RANDOM_SHAPES,
  type MixDistribution,
  type UnitMark,
  type UnitShape,
} from "./engine-constants";

/**
 * Resolves the Shape control into one concrete mark for a cell.
 *
 * `random` scatters the geometric marks; `mix` spreads the user's own set,
 * which is how a square and a glyph can share one sheet. Both are stable per
 * cell so a composition is reproducible frame to frame and in export.
 */
export function resolveShape(
  shape: UnitShape,
  mix: readonly UnitMark[],
  distribution: MixDistribution,
  tone: number,
  column: number,
  row: number,
  shift = 0,
): UnitMark {
  const mark = baseMark(shape, mix, distribution, tone, column, row);
  if (shift === 0) return mark;
  // Morphing steps through the mix when there is one, otherwise through a
  // fixed sequence that starts from the current mark.
  const sequence =
    shape === "mix" && mix.length > 1 ? mix : morphSequence(mark);
  const start = Math.max(0, sequence.indexOf(mark));
  const length = sequence.length;
  return sequence[(((start + shift) % length) + length) % length];
}

function morphSequence(mark: UnitMark): readonly UnitMark[] {
  if (mark === "glyph") return ["glyph", "circle", "square", "ring"];
  if (mark === "bar") return ["bar", "square", "circle", "octagon"];
  return RANDOM_SHAPES;
}

function baseMark(
  shape: UnitShape,
  mix: readonly UnitMark[],
  distribution: MixDistribution,
  tone: number,
  column: number,
  row: number,
): UnitMark {
  if (shape === "random") {
    return RANDOM_SHAPES[cellHash(column, row) % RANDOM_SHAPES.length];
  }
  if (shape !== "mix") return shape;
  if (mix.length === 0) return "square";
  if (mix.length === 1) return mix[0];
  if (distribution === "cycle") {
    return mix[(column + row) % mix.length];
  }
  if (distribution === "tone") {
    const index = Math.min(
      mix.length - 1,
      Math.max(0, Math.floor(tone * mix.length)),
    );
    return mix[index];
  }
  return mix[cellHash(column, row) % mix.length];
}

function cellHash(column: number, row: number): number {
  const hash =
    Math.imul(column + 7, 2_246_822_519) ^ Math.imul(row + 13, 3_266_489_917);
  return (hash ^ (hash >>> 15)) >>> 0;
}

export type UnitDraw = Readonly<{
  angleRadians: number;
  color: string;
  /** Selected glyph for the `glyph` mark; ignored by geometric marks. */
  glyph: string;
  size: number;
  x: number;
  y: number;
}>;

/** Glyphs read lighter than solid marks at equal size; this restores parity. */
const GLYPH_EM_COMPENSATION = 1.45;

/**
 * Font sizes snap to 2px steps. The browser caches rasterized glyphs per font
 * size, so a continuous size per mark (which tone and perspective both
 * produce) misses that cache on every draw: measured at 2000 glyphs on a
 * 3240px backing, unique sizes cost 1067ms and 2px steps cost 135ms. A 2px
 * step is below what reads as a size change at these densities.
 */
const GLYPH_SIZE_STEP = 2;
const glyphFonts = new Map<number, string>();

function glyphFont(size: number): string {
  const snapped = Math.max(
    GLYPH_SIZE_STEP,
    Math.round(size / GLYPH_SIZE_STEP) * GLYPH_SIZE_STEP,
  );
  let font = glyphFonts.get(snapped);
  if (!font) {
    font = `${snapped}px "Inter", system-ui, sans-serif`;
    glyphFonts.set(snapped, font);
  }
  return font;
}

function octagonPath(
  context: CanvasRenderingContext2D,
  radius: number,
): void {
  context.beginPath();
  for (let corner = 0; corner < 8; corner += 1) {
    const angle = (Math.PI / 4) * corner + Math.PI / 8;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (corner === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

/**
 * Draws one unit. The caller owns cell placement and tone; this function owns
 * only the mark itself.
 */
export function drawUnit(
  context: CanvasRenderingContext2D,
  shape: UnitMark,
  unit: UnitDraw,
  cell: number,
): void {
  if (unit.size <= 0.05) return;
  const half = unit.size / 2;
  context.save();
  context.translate(unit.x, unit.y);
  if (unit.angleRadians !== 0) context.rotate(unit.angleRadians);
  context.fillStyle = unit.color;

  if (shape === "circle") {
    context.beginPath();
    context.arc(0, 0, half, 0, Math.PI * 2);
    context.fill();
  } else if (shape === "square") {
    context.fillRect(-half, -half, unit.size, unit.size);
  } else if (shape === "octagon") {
    octagonPath(context, half);
    context.fill();
  } else if (shape === "ring") {
    // Even-odd keeps the hole crisp at any size, unlike a stroked circle.
    context.beginPath();
    context.arc(0, 0, half, 0, Math.PI * 2);
    context.arc(0, 0, half * 0.52, 0, Math.PI * 2, true);
    context.fill("evenodd");
  } else if (shape === "bar") {
    // The bar keeps full cell width and lets tone drive its length.
    const width = Math.max(1, cell * 0.34);
    context.fillRect(-width / 2, -half, width, unit.size);
  } else {
    const glyph = unit.glyph.length > 0 ? unit.glyph : "*";
    context.textAlign = "center";
    context.textBaseline = "middle";
    // A glyph inks far less of its em box than a filled disc of the same size,
    // so it is drawn larger to keep tone comparable across shapes.
    context.font = glyphFont(unit.size * GLYPH_EM_COMPENSATION);
    context.fillText(glyph, 0, 0);
  }
  context.restore();
}

/** Picks the glyph for one cell: tone ramp when enabled, otherwise position. */
export function selectGlyph(
  glyphs: readonly string[],
  tone: number,
  column: number,
  row: number,
  useRamp: boolean,
  shift = 0,
): string {
  if (glyphs.length === 0) return "*";
  const base = useRamp
    ? Math.min(glyphs.length - 1, Math.max(0, Math.floor(tone * glyphs.length)))
    : (column + row) % glyphs.length;
  const length = glyphs.length;
  // Motion can borrow a neighbouring character, for scrambles and falling code.
  return glyphs[(((base + shift) % length) + length) % length];
}
