/**
 * The unit vocabulary. Every shape draws inside a cell box of side `size`
 * centred on the cell, so shape can be swapped without touching the grid,
 * tone, or palette stages.
 *
 * `glyph` is the extension the reference tool lacked. Every printable
 * character or symbol can become the repeated unit, selected either by tone
 * ramp, by position, or by spelling a phrase.
 */

import {
  RANDOM_SHAPES,
  type MixDistribution,
  type UnitMark,
  type UnitShape,
} from "./engine-constants";

/**
 * The 2D contexts the sheet is drawn into: the preview canvas, and the
 * detached layer an export composes before it lands on the artifact.
 */
export type Paint2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

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
  if (mark === "bar" || mark === "dash") return ["bar", "square", "dash", "circle"];
  if (mark === "plus" || mark === "cross" || mark === "star") {
    return ["plus", "cross", "star", "circle"];
  }
  if (mark === "checker" || mark === "seal") return ["checker", "seal", "square", "ring"];
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
  /** Resolved CSS font for the `glyph` mark; ignored by geometric marks. */
  font: string;
  /** Selected character for the `glyph` mark; ignored by geometric marks. */
  glyph: string;
  size: number;
  /** Horizontal scale for card flips; 1 draws the mark unchanged. */
  squash: number;
  x: number;
  y: number;
}>;

function octagonPath(
  context: Paint2D,
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

function roundedPath(
  context: Paint2D,
  half: number,
  radius: number,
): void {
  const r = Math.min(radius, half);
  context.beginPath();
  context.moveTo(-half + r, -half);
  context.arcTo(half, -half, half, half, r);
  context.arcTo(half, half, -half, half, r);
  context.arcTo(-half, half, -half, -half, r);
  context.arcTo(-half, -half, half, -half, r);
  context.closePath();
}

/** A centred bar of the given length and thickness at one angle. */
function spoke(
  context: Paint2D,
  length: number,
  thickness: number,
  angle: number,
): void {
  context.save();
  if (angle !== 0) context.rotate(angle);
  context.fillRect(-length / 2, -thickness / 2, length, thickness);
  context.restore();
}

/**
 * Fills one mark at the origin in the current fill style and composite mode.
 * Transforms are the caller's; this function owns only the geometry.
 */
function fillMark(
  context: Paint2D,
  shape: UnitMark,
  unit: UnitDraw,
  cell: number,
): void {
  const size = unit.size;
  const half = size / 2;
  switch (shape) {
    case "circle":
      context.beginPath();
      context.arc(0, 0, half, 0, Math.PI * 2);
      context.fill();
      return;
    case "square":
      context.fillRect(-half, -half, size, size);
      return;
    case "rounded":
      roundedPath(context, half, size * 0.28);
      context.fill();
      return;
    case "octagon":
      octagonPath(context, half);
      context.fill();
      return;
    case "ring":
      // Even-odd keeps the hole crisp at any size, unlike a stroked circle.
      context.beginPath();
      context.arc(0, 0, half, 0, Math.PI * 2);
      context.arc(0, 0, half * 0.52, 0, Math.PI * 2, true);
      context.fill("evenodd");
      return;
    case "diamond":
      context.beginPath();
      context.moveTo(0, -half);
      context.lineTo(half, 0);
      context.lineTo(0, half);
      context.lineTo(-half, 0);
      context.closePath();
      context.fill();
      return;
    case "bar": {
      // The bar keeps its width and lets tone drive its length.
      const width = Math.max(1, cell * 0.34);
      context.fillRect(-width / 2, -half, width, size);
      return;
    }
    case "dash": {
      // The horizontal twin of the bar, for line-orientation halftones.
      const height = Math.max(1, cell * 0.34);
      context.fillRect(-half, -height / 2, size, height);
      return;
    }
    case "plus": {
      const thickness = Math.max(1, size * 0.26);
      spoke(context, size, thickness, 0);
      spoke(context, size, thickness, Math.PI / 2);
      return;
    }
    case "cross": {
      const thickness = Math.max(1, size * 0.24);
      spoke(context, size * 1.05, thickness, Math.PI / 4);
      spoke(context, size * 1.05, thickness, -Math.PI / 4);
      return;
    }
    case "star": {
      // A six-point asterisk: three spokes sixty degrees apart.
      const thickness = Math.max(1, size * 0.17);
      for (let spokeIndex = 0; spokeIndex < 3; spokeIndex += 1) {
        spoke(context, size, thickness, (Math.PI / 3) * spokeIndex + Math.PI / 2);
      }
      return;
    }
    case "checker":
      // A two-by-two checker: the smallest repeat that still reads as texture.
      context.fillRect(-half, -half, half, half);
      context.fillRect(0, 0, half, half);
      return;
    case "bracket": {
      // A corner bracket opening down-right; turn it for the other corners.
      const thickness = Math.max(1, size * 0.14);
      context.fillRect(-half, -half, size, thickness);
      context.fillRect(-half, -half, thickness, size);
      return;
    }
    case "boxdot": {
      // A solid square with a dot punched out of its middle.
      context.fillRect(-half, -half, size, size);
      if (context.globalCompositeOperation === "destination-out") return;
      context.globalCompositeOperation = "destination-out";
      const dot = Math.max(1, size * 0.3);
      context.fillRect(-dot / 2, -dot / 2, dot, dot);
      context.globalCompositeOperation = "source-over";
      return;
    }
    case "seal": {
      // A filled disc with an asterisk punched out of it.
      context.beginPath();
      context.arc(0, 0, half, 0, Math.PI * 2);
      context.fill();
      if (context.globalCompositeOperation === "destination-out") return;
      context.globalCompositeOperation = "destination-out";
      const thickness = Math.max(1, size * 0.12);
      for (let spokeIndex = 0; spokeIndex < 4; spokeIndex += 1) {
        spoke(context, size * 0.66, thickness, (Math.PI / 4) * spokeIndex);
      }
      context.globalCompositeOperation = "source-over";
      return;
    }
    case "glyph": {
      const glyph = unit.glyph.length > 0 ? unit.glyph : "*";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = unit.font;
      context.fillText(glyph, 0, 0);
      return;
    }
  }
}

/**
 * Draws an upright geometric mark centred on (x, y) without a transform, for
 * the common case of many small unrotated marks such as the idle field. The
 * caller sets the fill. Returns false for marks that need a transform, so the
 * caller can fall back to `drawUnit`. `quarter` turns a corner bracket.
 */
export function fillMarkAt(
  context: Paint2D,
  shape: UnitMark,
  x: number,
  y: number,
  size: number,
  cell: number,
  quarter: number,
): boolean {
  const half = size / 2;
  switch (shape) {
    case "circle":
      context.beginPath();
      context.arc(x, y, half, 0, Math.PI * 2);
      context.fill();
      return true;
    case "square":
      context.fillRect(x - half, y - half, size, size);
      return true;
    case "bar": {
      const width = Math.max(1, cell * 0.34);
      context.fillRect(x - width / 2, y - half, width, size);
      return true;
    }
    case "dash": {
      const height = Math.max(1, cell * 0.34);
      context.fillRect(x - half, y - height / 2, size, height);
      return true;
    }
    case "plus": {
      const thickness = Math.max(1, size * 0.26);
      context.fillRect(x - half, y - thickness / 2, size, thickness);
      context.fillRect(x - thickness / 2, y - half, thickness, size);
      return true;
    }
    case "checker":
      context.fillRect(x - half, y - half, half, half);
      context.fillRect(x, y, half, half);
      return true;
    case "bracket": {
      const thickness = Math.max(1, size * 0.14);
      const turn = ((quarter % 4) + 4) % 4;
      // Arms along the top or bottom edge and the left or right edge.
      const top = turn === 0 || turn === 1;
      const left = turn === 0 || turn === 3;
      context.fillRect(x - half, top ? y - half : y + half - thickness, size, thickness);
      context.fillRect(left ? x - half : x + half - thickness, y - half, thickness, size);
      return true;
    }
    case "boxdot": {
      context.fillRect(x - half, y - half, size, size);
      if (context.globalCompositeOperation === "destination-out") return true;
      const dot = Math.max(1, size * 0.3);
      context.globalCompositeOperation = "destination-out";
      context.fillRect(x - dot / 2, y - dot / 2, dot, dot);
      context.globalCompositeOperation = "source-over";
      return true;
    }
    case "ring":
      context.beginPath();
      context.arc(x, y, half, 0, Math.PI * 2);
      context.moveTo(x + half * 0.52, y);
      context.arc(x, y, half * 0.52, 0, Math.PI * 2, true);
      context.fill("evenodd");
      return true;
    default:
      return false;
  }
}

/**
 * Draws one unit. The caller owns cell placement and tone; this function owns
 * only the mark itself.
 */
export function drawUnit(
  context: Paint2D,
  shape: UnitMark,
  unit: UnitDraw,
  cell: number,
): void {
  if (unit.size <= 0.05 || Math.abs(unit.squash) < 0.02) return;
  context.save();
  context.translate(unit.x, unit.y);
  if (unit.angleRadians !== 0) context.rotate(unit.angleRadians);
  if (unit.squash !== 1) context.scale(unit.squash, 1);
  context.fillStyle = unit.color;
  fillMark(context, shape, unit, cell);
  context.restore();
}

/**
 * Draws a knocked-out unit: the whole cell box is filled and the mark is cut
 * out of it, so neighbouring boxes merge into one highlighted run the way a
 * selected line of text does.
 */
export function drawKnockout(
  context: Paint2D,
  shape: UnitMark,
  unit: UnitDraw,
  cell: number,
  box: Readonly<{ height: number; width: number }>,
): void {
  if (Math.abs(unit.squash) < 0.02) return;
  context.save();
  context.translate(unit.x, unit.y);
  if (unit.squash !== 1) context.scale(unit.squash, 1);
  context.fillStyle = unit.color;
  // A hairline of overlap keeps adjacent boxes from showing a seam.
  context.fillRect(-box.width / 2 - 0.3, -box.height / 2, box.width + 0.6, box.height);
  if (unit.angleRadians !== 0) context.rotate(unit.angleRadians);
  context.globalCompositeOperation = "destination-out";
  fillMark(context, shape, unit, cell);
  context.restore();
}
