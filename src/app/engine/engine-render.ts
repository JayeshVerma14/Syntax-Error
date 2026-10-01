/**
 * The single deterministic frame renderer. Live preview and artifact export
 * both call `renderSyntaxErrorFrame`, so what the canvas shows is what a PNG
 * or MP4 frame contains.
 *
 * The product draws a transparent foreground only; runtime owns background.
 * Layers stack in a fixed order: the backdrop field, the sampled subject, the
 * burst, the swirl, the caption, the end text, then the CRT pass on top. While
 * the code roll is on screen it replaces all of them but the CRT pass. Editor
 * overlays (grid, circle guide) are drawn separately by the preview and never
 * enter an artifact.
 */

import {
  BOX_GLYPHS,
  LOOP_SECONDS,
  MAX_CELLS_PER_AXIS,
  MIN_CELL_PX,
  TYPE_CELL_ASPECT,
  type UnitMark,
} from "./engine-constants";
import type { AudioFrame } from "./engine-audio";
import { reactToAudio } from "./engine-audio-react";
import { dilateMask } from "./engine-backdrop";
import { collectBurst } from "./engine-burst";
import { createProjector } from "./engine-camera";
import { drawCaption } from "./engine-caption";
import { drawCrt } from "./engine-crt";
import { createFieldSampler } from "./engine-field";
import { createGlitchPlan } from "./engine-glitch";
import { glyphFont, pickGlyph } from "./engine-glyphs";
import { createMotionField, sampleMotion } from "./engine-motion";
import type { EngineSettings } from "./engine-settings";
import { toGreyscale, unitColor, type PaletteChoice } from "./engine-palette";
import type { SourceGrid } from "./engine-source";
import { quantizeGrid } from "./engine-quantize";
import { applyHit, drawFlash } from "./engine-screen";
import {
  paintSequence as paintTimedLayers,
  paintTransition,
  planSequence,
  type LogoFrame,
} from "./engine-sequence";
import { collectSwirl } from "./engine-swirl";
import { buildToneField } from "./engine-tone";
import {
  createParticlePicker,
  layerParticleMark,
  layerParticleSize,
  strokeHeading,
  strokeWeight,
} from "./engine-particles";
import { drawKnockout, drawUnit, fillMarkAt, type Paint2D, resolveShape } from "./engine-units";

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
  // Character cells are narrower than they are tall, like a terminal.
  const cellWidth =
    settings.layout === "type" ? Math.max(MIN_CELL_PX, cell * TYPE_CELL_ASPECT) : cell;
  const cols = Math.min(MAX_CELLS_PER_AXIS, Math.max(1, Math.ceil(width / cellWidth)));
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

/** Tone-sized glyphs ink far less of their em box than a disc of the same size. */
const GLYPH_EM_COMPENSATION = 1.45;

/**
 * Knockout boxes come in short horizontal runs, the way a highlighted word
 * boxes several characters at once: cells share their selection noise with
 * the neighbours in the same run.
 */
const KNOCKOUT_RUN = 3;

function knockoutNoise(column: number, row: number): number {
  const run = Math.floor((column + ((row * 7) % KNOCKOUT_RUN)) / KNOCKOUT_RUN);
  return cellNoise(run * 31 + 5, row * 17 + 3);
}

export type RenderFrameInput = Readonly<{
  context: Paint2D;
  /** Timeline loop length; the code roll's phases are real seconds on it. */
  durationSeconds?: number;
  frame: FrameRect;
  grid: SourceGrid | null;
  /** Forward loop progress in 0..1. Stills pass 0. */
  progress: number;
  settings: EngineSettings;
  /** The uploaded logo, prepared as blocks and a crisp copy. */
  logo?: LogoFrame;
  /** The uploaded Image form picture, sampled onto its glyph grid. */
  form?: FormGrid;
  /** The music at this frame's song moment, when Audio reactive is on. */
  sound?: AudioFrame;
}>;

export type { LogoFrame } from "./engine-sequence";
import type { FormGrid } from "./engine-form";

type Mark = {
  angleRadians: number;
  available: number;
  box: { height: number; width: number } | null;
  color: string;
  depth: number;
  font: string;
  glyph: string;
  mark: UnitMark;
  /** Quarter turns, for corner brackets in the field. */
  quarter: number;
  size: number;
  squash: number;
  x: number;
  y: number;
};

export function renderSyntaxErrorFrame({
  context,
  durationSeconds = LOOP_SECONDS,
  frame,
  grid,
  progress,
  form,
  logo,
  settings,
  sound,
}: RenderFrameInput): void {
  // The music reshapes a few layer settings; everything else is unchanged.
  const reaction = reactToAudio(settings, sound);
  // The code roll and its end text run on sequence seconds. While the code is
  // on screen it takes over the canvas and nothing of the sheet is built.
  const plan = planSequence(settings, progress, durationSeconds);
  // A beat swells the text about the frame centre.
  const timing = { durationSeconds, form, progress, pulse: reaction.pulse, swell: reaction.textScale };
  const paintSequence = () => paintTimedLayers(context, frame, settings, plan, logo, timing);
  // The CRT pass lies over the finished picture, whatever is on screen,
  // and a beat's flash lies under it, over everything the beat moved.
  // A beat's punch and shake move everything under the filler and CRT pass.
  const moveScreen = () => applyHit(context, frame, reaction.hit);
  // A glitch filler hides each cut; it is never zoomed or shaken.
  const paintFiller = () => paintTransition(context, frame, settings, plan, reaction.pulse);
  const paintScreen = () => {
    drawFlash(context, frame, reaction.hit.flash);
    drawCrt(context, frame, reaction.crt, progress, durationSeconds);
  };
  if (plan.takesOver) {
    context.save();
    context.translate(frame.x, frame.y);
    context.save();
    moveScreen();
    paintSequence();
    context.restore();
    paintFiller();
    paintScreen();
    context.restore();
    return;
  }

  const shape = resolveGridShape(settings, frame.width, frame.height);
  const cols = grid?.cols ?? shape.cols;
  const rows = grid?.rows ?? shape.rows;
  if (cols <= 0 || rows <= 0) return;

  const cellWidth = frame.width / cols;
  const cellHeight = frame.height / rows;
  const gap = Math.min(0.95, settings.gap / 100);
  const floor = settings.unitFloor / 100;
  const response = (settings.scale / 100) * reaction.pump;
  const baseAngle = (settings.unitAngle * Math.PI) / 180;
  const jitter = settings.jitter / 100;
  const isColumns = settings.layout === "columns";
  const isType = settings.layout === "type";
  const columnSpan = Math.min(cellWidth, cellHeight);
  const glyphs = settings.glyph;
  const fixedGlyphs = glyphs.sizing === "fixed";
  // A fixed type size fills the line, as a terminal sets text in its cells.
  const fixedGlyphSize = isType ? cellHeight * 0.92 : Math.min(cellWidth, cellHeight) * 1.02;
  const knockout = Math.min(1, Math.max(0, reaction.knockout / 100));
  // One step of the fixed-size ramp, which includes its empty step.
  const glyphStep = 1 / (settings.glyphs.length + 1);
  const boxHeight = cellHeight * (isType ? 0.9 : 1) * (1 - gap);
  const flatInk = settings.greyscale ? "#141414" : settings.inks[0] ?? "#141414";
  const lastInk = settings.inks[settings.inks.length - 1] ?? "#FFFFFF";
  // Backdrop, burst and swirl draw in the densest ink, or the flat ink.
  const layerInk = settings.ignoreColor
    ? flatInk
    : settings.greyscale
      ? toGreyscale(lastInk)
      : lastInk;
  const palette: PaletteChoice = {
    greyscale: settings.greyscale,
    inks: settings.inks,
    paletteMode: settings.paletteMode,
  };
  const sampledColor = grid?.color ?? NO_COLOR;
  const quantized =
    grid && settings.paletteMode === "inks"
      ? quantizeGrid({
          diffuse: settings.colorDiffuse,
          grid,
          inks: settings.inks,
          match: settings.colorMatch,
        })
      : [];
  // Bound once per frame so the per-unit call carries only cell coordinates.
  const colorAt = (
    index: number,
    column: number,
    row: number,
    tone: number,
  ): string =>
    unitColor({ color: sampledColor, column, index, palette, quantized, row, tone });

  // Bound once per frame for the same reason: the loop passes numbers only.
  const glyphAt = (
    level: number,
    column: number,
    row: number,
    shift: number,
  ): string | null =>
    pickGlyph({
      cols,
      column,
      fixed: fixedGlyphs,
      glyphs: settings.glyphs,
      level,
      phrase: glyphs.phrase,
      row,
      shift,
      useRamp: settings.ramp,
    });

  const projector = createProjector(settings.camera, frame.width, frame.height);
  const glitch = createGlitchPlan(reaction.glitch, cols, rows, progress);
  const motionField = createMotionField(settings.motion, cols, rows);
  const field = grid ? buildToneField(grid, settings) : null;
  const occupied = new Uint8Array(cols * rows);
  const rays = new Uint8Array(cols * rows);
  const subject: Mark[] = [];
  const burst: Mark[] = [];
  const backdrop: Mark[] = [];
  const glyphLayers = settings.shape === "glyph" || settings.shape === "mix";
  const layerGlyphSize = isType ? cellHeight * 0.92 : Math.min(cellWidth, cellHeight) * 1.02;

  // Everything below that carries the context or a cell buffer is bound
  // before the unit loop, so the calls after the loop pass numbers or nothing.
  const gridMark = (
    column: number,
    row: number,
    mark: UnitMark,
    glyph: string,
    size: number,
    quarter = 0,
  ): Mark | null => {
    const projected = projector((column + 0.5) * cellWidth, (row + 0.5) * cellHeight);
    if (!projected.visible || projected.scale <= 0) return null;
    return {
      angleRadians: 0,
      available: Math.min(cellWidth, cellHeight) * projected.scale,
      box: null,
      color: layerInk,
      depth: projected.depth,
      font: mark === "glyph" ? glyphFont(size * projected.scale, glyphs.face, glyphs.bold) : "",
      glyph,
      mark,
      quarter,
      size: size * projected.scale,
      squash: 1,
      x: projected.x,
      y: projected.y,
    };
  };

  // The burst claims empty cells first, so the field keeps out of its rays.
  const fillBurst = () => {
    for (const cell of collectBurst(
      settings.burst,
      { cellHeight, cellWidth, cols, height: frame.height, rows, width: frame.width },
      progress,
      occupied,
      plan.wallBurst ? [...(reaction.burstEvents ?? []), plan.wallBurst] : reaction.burstEvents,
    )) {
      rays[cell.row * cols + cell.column] = 1;
      const kind = settings.burst.particle;
      if (kind === "glyphs") {
        const mark = gridMark(cell.column, cell.row, "glyph", cell.glyph, layerGlyphSize);
        if (mark) burst.push(mark);
        continue;
      }
      const size = layerGlyphSize * layerParticleSize(kind) * strokeWeight(cell.glyph);
      const mark = gridMark(cell.column, cell.row, layerParticleMark(kind), "", size);
      if (!mark) continue;
      // Dashes and bars lie along the ray, as its stroke characters do.
      if (kind === "dashes" || kind === "bars") mark.angleRadians = strokeHeading(cell.glyph);
      burst.push(mark);
    }
  };

  const fillField = () => {
    const density = settings.backdrop.enabled
      ? Math.min(1, Math.max(0, reaction.backdrop.density / 100))
      : 0;
    if (density <= 0) return;
    const clear = dilateMask(occupied, cols, rows, settings.backdrop.clearance);
    const side = Math.min(cellWidth, cellHeight);
    const particles = settings.backdrop.particles;
    const grow = particles.size / 100;
    const pickParticle = createParticlePicker(particles.kind, glyphLayers);
    // Twinkle and Patches size glyphs too, in steps so few fonts are built.
    const sizedGlyphs =
      settings.backdrop.motion === "twinkle" || settings.backdrop.motion === "patches";
    // The field moves; the clearance around the subject stays put.
    const sampleField = createFieldSampler(
      settings.backdrop.motion,
      settings.backdrop.speed,
      durationSeconds,
      cols,
      rows,
      density,
      progress,
    );
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        const cell = row * cols + column;
        if (clear[cell] || rays[cell]) continue;
        const pick = sampleField(column, row);
        if (!pick) continue;
        const particle = pickParticle(column, row, pick.stage);
        const glyphScale = sizedGlyphs ? Math.max(0.5, Math.round(pick.scale * 4) / 4) : 1;
        const mark =
          particle.mark === "glyph"
            ? gridMark(column, row, "glyph", pick.glyph, layerGlyphSize * grow * glyphScale)
            : gridMark(column, row, particle.mark, "", side * particle.size * grow * pick.scale, particle.quarter);
        if (mark) backdrop.push(mark);
      }
    }
  };

  // Upright glyphs skip the per-unit transform: font and fill change only
  // when they differ from the previous glyph, which is the common case.
  let lastFont = "";
  let lastFill = "";
  const drawUpright = (item: Mark, fill: string, dx: number, dy: number) => {
    if (item.size <= 0.05) return;
    if (item.font !== lastFont) {
      context.font = item.font;
      lastFont = item.font;
    }
    if (fill !== lastFill) {
      context.fillStyle = fill;
      lastFill = fill;
    }
    context.fillText(item.glyph.length > 0 ? item.glyph : "*", item.x + dx, item.y + dy);
  };

  // Upright geometric marks draw straight onto the canvas, no transform.
  const drawFlat = (item: Mark, fill: string, dx: number, dy: number): boolean => {
    if (item.size <= 0.05) return true;
    if (fill !== lastFill) {
      context.fillStyle = fill;
      lastFill = fill;
    }
    return fillMarkAt(context, item.mark, item.x + dx, item.y + dy, item.size, item.available, item.quarter);
  };

  const drawPosed = (item: Mark, fill: string, dx: number, dy: number, boxed: boolean) => {
    const unit = {
      angleRadians: item.angleRadians + (item.quarter * Math.PI) / 2,
      color: fill,
      font: item.font,
      glyph: item.glyph,
      size: item.size,
      squash: item.squash,
      x: item.x + dx,
      y: item.y + dy,
    };
    if (boxed && item.box) {
      drawKnockout(context, item.mark, unit, item.available, item.box);
    } else {
      drawUnit(context, item.mark, unit, item.available);
    }
  };

  const paint = (
    layer: readonly Mark[],
    dx: number,
    dy: number,
    override: string | null,
  ) => {
    for (const item of layer) {
      const fill = override ?? item.color;
      if (
        item.mark === "glyph" &&
        item.box === null &&
        item.angleRadians === 0 &&
        item.squash === 1
      ) {
        drawUpright(item, fill, dx, dy);
      } else if (
        item.box === null &&
        item.angleRadians === 0 &&
        item.squash === 1 &&
        drawFlat(item, fill, dx, dy)
      ) {
        continue;
      } else {
        // Channel fringes draw boxed marks plain, so only the sheet is boxed.
        drawPosed(item, fill, dx, dy, override === null);
      }
    }
  };

  const paintSwirl = () => {
    const swirlSize = layerGlyphSize * 0.9;
    const swirlFont = glyphFont(swirlSize, glyphs.face, glyphs.bold);
    const kind = settings.swirl.particle;
    const mark = kind === "glyphs" ? "glyph" : layerParticleMark(kind);
    const size = kind === "glyphs" ? swirlSize : swirlSize * layerParticleSize(kind);
    // Round and square particles look the same at any turn, so they skip it.
    const turns = kind !== "dots" && kind !== "blocks" && kind !== "rings" && kind !== "boxes";
    for (const particle of collectSwirl(reaction.swirl, frame.width, frame.height, progress)) {
      drawUnit(
        context,
        mark,
        {
          angleRadians: turns ? particle.angle : 0,
          color: layerInk,
          font: swirlFont,
          glyph: particle.glyph,
          size,
          squash: 1,
          x: particle.x,
          y: particle.y,
        },
        size,
      );
    }
  };

  const paintCaption = () => {
    if (settings.caption.enabled) drawCaption(context, frame, settings.caption, progress);
  };

  if (field) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        // Glitch reads another cell's content into this cell's slot.
        const [sourceColumn, sourceRow] = glitch.sample(column, row);
        const index = sourceRow * cols + sourceColumn;
        const tone = field[index];
        if (tone <= 0) continue;

        const motion = sampleMotion(reaction.motion, motionField, progress, column, row);
        const magnitude = Math.max(0, Math.min(1.6, floor + tone * motion.scale * response));
        if (magnitude <= 0) continue;
        // Bright cells are boxed in short runs; the share is the knockout.
        const knocked =
          knockout > 0 && tone >= 0.5 && knockoutNoise(sourceColumn, sourceRow) < knockout * (0.4 + 0.6 * tone);

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
        let glyph = "";
        let size: number;
        if (mark === "glyph") {
          // Fixed type varies a step either way per cell, so a flat area reads
          // as a mix of neighbouring characters rather than one repeated glyph.
          const variation = fixedGlyphs
            ? (cellNoise(sourceColumn * 3 + 1, sourceRow * 5 + 2) - 0.5) * glyphStep * 2.4
            : 0;
          const picked = glyphAt(
            fixedGlyphs ? magnitude + variation : tone,
            sourceColumn,
            sourceRow,
            motion.glyphShift,
          );
          if (!picked) continue;
          glyph =
            knocked && glyphs.phrase.length === 0
              ? BOX_GLYPHS[Math.floor(cellNoise(sourceRow, sourceColumn) * BOX_GLYPHS.length)]
              : picked;
          size = fixedGlyphs ? fixedGlyphSize : available * magnitude * GLYPH_EM_COMPENSATION;
        } else {
          // Columns stretch vertically with tone; square keeps the unit isotropic.
          size = isColumns
            ? Math.max(1, cellHeight * (1 - gap) * magnitude)
            : available * magnitude;
        }

        const noise = cellNoise(sourceColumn, sourceRow);
        const drift = jitter * (noise - 0.5) * cellWidth;
        const driftY = jitter * (cellNoise(sourceRow, sourceColumn) - 0.5) * cellHeight;
        const cx = (column + 0.5 + motion.dx) * cellWidth + drift;
        const cy = (row + 0.5 + motion.dy) * cellHeight + driftY;
        const projected = projector(cx, cy);
        if (!projected.visible || projected.scale <= 0) continue;

        occupied[row * cols + column] = 1;
        subject.push({
          angleRadians: baseAngle + motion.rotation,
          available: available * projected.scale,
          box: knocked
            ? { height: boxHeight * projected.scale, width: cellWidth * projected.scale }
            : null,
          color: settings.ignoreColor
            ? flatInk
            : colorAt(grid ? index : 0, sourceColumn, sourceRow, tone),
          depth: projected.depth,
          font:
            mark === "glyph"
              ? glyphFont(size * projected.scale, glyphs.face, glyphs.bold)
              : "",
          glyph,
          mark,
          quarter: 0,
          // A knocked-out mark leaves a frame of box around its cut-out.
          size:
            (knocked && mark !== "glyph" ? Math.min(size, available * 0.7) : size) *
            projected.scale,
          squash: motion.squash,
          x: projected.x,
          y: projected.y,
        });
      }
    }
  }

  fillBurst();
  fillField();

  // Painter order: furthest first, so nearer marks overlap correctly.
  if (settings.camera.perspective) {
    for (const layer of [backdrop, subject, burst]) {
      layer.sort((a, b) => b.depth - a.depth);
    }
  }

  context.save();
  context.translate(frame.x, frame.y);
  context.save();
  moveScreen();
  context.textAlign = "center";
  context.textBaseline = "middle";

  if (backdrop.length > 0) {
    context.globalAlpha = Math.min(1, Math.max(0, reaction.backdrop.opacity / 100));
    paint(backdrop, 0, 0, null);
    context.globalAlpha = 1;
  }
  // Channel fringes sit behind the sheet so the marks stay legible.
  for (const split of glitch.splits) {
    paint(subject, split.dx, split.dy, split.color);
  }
  paint(subject, 0, 0, null);
  paint(burst, 0, 0, null);
  paintSwirl();
  paintCaption();
  paintSequence();
  context.restore();
  paintFiller();
  paintScreen();
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
