/**
 * The single deterministic frame renderer. Live preview and artifact export
 * both call `renderSyntaxErrorFrame`, so what the canvas shows is what a PNG
 * or MP4 frame contains.
 *
 * The product draws a transparent foreground only; runtime owns background.
 * Editor overlays (grid, circle guide) are drawn separately by the preview and
 * never enter an artifact.
 */

import {
  ERASED,
  MAX_CELLS_PER_AXIS,
  MIN_CELL_PX,
} from "./engine-constants";
import { createProjector } from "./engine-camera";
import { cellKey } from "./engine-edit";
import { createGlitchPlan } from "./engine-glitch";
import { createMotionField, sampleMotion } from "./engine-motion";
import type { EngineSettings } from "./engine-settings";
import { toGreyscale, unitColor, type PaletteChoice } from "./engine-palette";
import type { SourceGrid } from "./engine-source";
import { quantizeGrid } from "./engine-quantize";
import { buildToneField } from "./engine-tone";
import { drawUnit, resolveShape, selectGlyph } from "./engine-units";

export type FrameRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type GridShape = Readonly<{ cell: number; cols: number; rows: number }>;

/** Grid resolution for one artboard. Also the workload the cell slider drives. */
export function resolveGridShape(
  settings: EngineSettings,
  width: number,
  height: number,
): GridShape {
  const cell = Math.max(MIN_CELL_PX, Math.round(settings.cell));
  const cols = Math.min(MAX_CELLS_PER_AXIS, Math.max(1, Math.ceil(width / cell)));
  const rows = Math.min(MAX_CELLS_PER_AXIS, Math.max(1, Math.ceil(height / cell)));
  return { cell, cols, rows };
}

/** Deterministic per-cell hash, so jitter is stable across frames and exports. */
function cellNoise(column: number, row: number): number {
  let hash = Math.imul(column + 1, 374_761_393) ^ Math.imul(row + 1, 668_265_263);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_295;
}

/** Colour of a cell with no sampled source, shared rather than allocated per unit. */
const NO_COLOR = new Float32Array(3);

export type RenderFrameInput = Readonly<{
  context: CanvasRenderingContext2D;
  frame: FrameRect;
  grid: SourceGrid | null;
  /** Forward loop progress in 0..1. Stills pass 0. */
  progress: number;
  settings: EngineSettings;
}>;

export function renderSyntaxErrorFrame({
  context,
  frame,
  grid,
  progress,
  settings,
}: RenderFrameInput): void {
  const shape = resolveGridShape(settings, frame.width, frame.height);
  // Painted cells alone are a valid composition, so the sheet renders on the
  // grid geometry even when no source has been sampled yet.
  const cols = grid?.cols ?? shape.cols;
  const rows = grid?.rows ?? shape.rows;
  const hasPaint = Object.keys(settings.edit).length > 0;
  if (!grid && !hasPaint) return;
  if (cols <= 0 || rows <= 0) return;

  const field = grid ? buildToneField(grid, settings) : new Float32Array(cols * rows);
  // Colour matching runs once per frame against the whole grid so error
  // diffusion can carry between neighbouring cells.
  const quantized =
    grid && settings.paletteMode === "inks"
      ? quantizeGrid({
          diffuse: settings.colorDiffuse,
          grid,
          inks: settings.inks,
          match: settings.colorMatch,
        })
      : [];
  const cellWidth = frame.width / cols;
  const cellHeight = frame.height / rows;
  const gap = Math.min(0.95, settings.gap / 100);
  const floor = settings.unitFloor / 100;
  const response = settings.scale / 100;
  const baseAngle = (settings.unitAngle * Math.PI) / 180;
  const jitter = settings.jitter / 100;
  const isColumns = settings.layout === "columns";
  const columnSpan = Math.min(cellWidth, cellHeight);
  const flatInk = settings.greyscale ? "#141414" : settings.inks[0] ?? "#141414";
  const palette: PaletteChoice = {
    greyscale: settings.greyscale,
    inks: settings.inks,
    paletteMode: settings.paletteMode,
  };
  const sampledColor = grid?.color ?? NO_COLOR;
  // Bound once per frame so the per-unit call carries only cell coordinates.
  const colorAt = (
    index: number,
    column: number,
    row: number,
    tone: number,
  ): string =>
    unitColor({ color: sampledColor, column, index, palette, quantized, row, tone });

  const projector = createProjector(settings.camera, frame.width, frame.height);
  const glitch = createGlitchPlan(settings.glitch, cols, rows, progress);
  const motionField = createMotionField(settings.motion, cols, rows);

  type Mark = {
    angleRadians: number;
    available: number;
    color: string;
    depth: number;
    glyph: string;
    mark: ReturnType<typeof resolveShape>;
    size: number;
    x: number;
    y: number;
  };
  const marks: Mark[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      // Glitch reads another cell's content into this cell's slot.
      const [sourceColumn, sourceRow] = glitch.sample(column, row);
      const index = sourceRow * cols + sourceColumn;
      const painted = settings.edit[cellKey(sourceColumn, sourceRow)];
      if (painted === ERASED) continue;

      // A painted cell is fully inked regardless of what the source sampled.
      const tone = painted ? 1 : field[index];
      if (tone <= 0) continue;

      const motion = sampleMotion(
        settings.motion,
        motionField,
        progress,
        column,
        row,
      );
      const animated = tone * motion.scale;
      const magnitude = Math.max(0, Math.min(1.6, floor + animated * response));
      if (magnitude <= 0) continue;

      const base = isColumns ? columnSpan : Math.min(cellWidth, cellHeight);
      const available = base * (1 - gap);
      const mark = resolveShape(
        settings.shape,
        settings.mix,
        settings.mixDistribution,
        tone,
        sourceColumn,
        sourceRow,
        motion.markShift,
      );
      // Columns stretch vertically with tone; square keeps the unit isotropic.
      const size = isColumns
        ? Math.max(1, cellHeight * (1 - gap) * magnitude)
        : available * magnitude;

      const noise = cellNoise(sourceColumn, sourceRow);
      const drift = jitter * (noise - 0.5) * cellWidth;
      const driftY = jitter * (cellNoise(sourceRow, sourceColumn) - 0.5) * cellHeight;

      let color: string;
      if (settings.ignoreColor) {
        color = flatInk;
      } else if (painted) {
        color = settings.greyscale ? toGreyscale(painted) : painted;
      } else {
        color = colorAt(grid ? index : 0, sourceColumn, sourceRow, tone);
      }

      const cx = (column + 0.5 + motion.dx) * cellWidth + drift;
      const cy = (row + 0.5 + motion.dy) * cellHeight + driftY;
      const projected = projector(cx, cy);
      if (!projected.visible || projected.scale <= 0) continue;

      marks.push({
        angleRadians: baseAngle + motion.rotation,
        available: available * projected.scale,
        color,
        depth: projected.depth,
        glyph: selectGlyph(
          settings.glyphs,
          tone,
          sourceColumn,
          sourceRow,
          settings.ramp,
          motion.glyphShift,
        ),
        mark,
        size: size * projected.scale,
        x: projected.x,
        y: projected.y,
      });
    }
  }

  // Painter order: furthest first, so nearer marks overlap correctly.
  if (settings.camera.perspective) {
    marks.sort((a, b) => b.depth - a.depth);
  }

  context.save();
  context.translate(frame.x, frame.y);

  const paint = (dx: number, dy: number, override: string | null) => {
    for (const item of marks) {
      drawUnit(
        context,
        item.mark,
        {
          angleRadians: item.angleRadians,
          color: override ?? item.color,
          glyph: item.glyph,
          size: item.size,
          x: item.x + dx,
          y: item.y + dy,
        },
        item.available,
      );
    }
  };

  // Channel fringes sit behind the sheet so the marks stay legible.
  for (const split of glitch.splits) {
    paint(split.dx, split.dy, split.color);
  }
  paint(0, 0, null);

  context.restore();
}

/**
 * Editor-only guides. Preview draws these after the sheet; artifact export
 * never calls this, so overlays cannot reach a PNG or MP4.
 */
export function renderEditorOverlays({
  context,
  frame,
  settings,
}: Readonly<{
  context: CanvasRenderingContext2D;
  frame: FrameRect;
  settings: EngineSettings;
}>): void {
  if (!settings.gridOverlay && !settings.circleOverlay) return;
  const shape = resolveGridShape(settings, frame.width, frame.height);
  const cellWidth = frame.width / shape.cols;
  const cellHeight = frame.height / shape.rows;

  context.save();
  context.translate(frame.x, frame.y);
  context.lineWidth = 1;

  if (settings.gridOverlay) {
    context.strokeStyle = "rgba(20,20,20,0.18)";
    context.beginPath();
    for (let column = 1; column < shape.cols; column += 1) {
      const x = Math.round(column * cellWidth) + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, frame.height);
    }
    for (let row = 1; row < shape.rows; row += 1) {
      const y = Math.round(row * cellHeight) + 0.5;
      context.moveTo(0, y);
      context.lineTo(frame.width, y);
    }
    context.stroke();
  }

  if (settings.circleOverlay) {
    // A centred circular guide for round stickers and badge lockups.
    context.strokeStyle = "rgba(20,20,20,0.35)";
    context.setLineDash([6, 6]);
    context.beginPath();
    context.arc(
      frame.width / 2,
      frame.height / 2,
      Math.min(frame.width, frame.height) / 2 - 1,
      0,
      Math.PI * 2,
    );
    context.stroke();
    context.setLineDash([]);
  }

  context.restore();
}
