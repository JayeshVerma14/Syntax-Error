/**
 * The declared render plan, compiled into one executable registration. Product
 * code, performance assessment, and workload fixtures all read this single
 * description of when each pass executes.
 *
 * Sampling is the expensive stage and depends only on the source and the grid
 * resolution, so playback and every unit, tone, or palette edit reuse it and
 * re-run the draw alone.
 */

import {
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import type { SourceGrid } from "./engine-source";

type EnginePassContracts = {
  "export-frame": ToolcraftRendererPipelinePassContract<void>;
  "source-sample": ToolcraftRendererPipelinePassContract<
    SourceGrid | null,
    SourceGrid,
    readonly [string, number]
  >;
  "unit-build": ToolcraftRendererPipelinePassContract<SourceGrid>;
  "unit-draw": ToolcraftRendererPipelinePassContract<void>;
};

const sheetBounds = {
  kind: "intrinsic",
  reason:
    "A halftone sheet is defined on its product frame, like a print trim: the sampling grid covers exactly that rectangle, and marks that motion, jitter, glitch or the camera push past its edge are cropped by design rather than extending the composition.",
} as const;

const TONE_TARGETS = [
  "tone.contrast",
  "tone.lightness",
  "tone.invert",
  "tone.dither",
  "tone.cutoff",
  "tone.response",
] as const;

const DRAW_TARGETS = [
  "motion.cycles",
  "motion.direction",
  "camera.projection",
  "camera.tilt",
  "camera.pan",
  "camera.roll",
  "camera.distance",
  "camera.fov",
  "glitch.enabled",
  "glitch.amount",
  "glitch.blocks",
  "glitch.density",
  "glitch.rate",
  "glitch.slice",
  "glitch.split",
  "unit.mix",
  "unit.mixOrder",
  "palette.match",
  "palette.diffuse",
  "view.grid",
  "view.circleOverlay",
  "palette.greyscale",
  "output.flatInk",
  "unit.shape",
  "unit.glyphs",
  "unit.ramp",
  "unit.scale",
  "unit.floor",
  "unit.angle",
  "unit.knockout",
  "glyph.phrase",
  "glyph.sizing",
  "glyph.face",
  "glyph.bold",
  "field.enabled",
  "field.density",
  "field.clearance",
  "field.opacity",
  "burst.enabled",
  "burst.origin",
  "burst.rays",
  "burst.reach",
  "burst.thickness",
  "burst.count",
  "swirl.enabled",
  "swirl.center",
  "swirl.count",
  "swirl.radius",
  "swirl.band",
  "swirl.turns",
  "caption.enabled",
  "caption.text",
  "caption.reveal",
  "caption.type",
  "caption.position",
  "caption.highlight",
  "caption.blink",
  "caption.cursor",
  "grid.gap",
  "grid.jitter",
  "grid.mode",
  "palette.mode",
  "palette.inks",
  "appearance.background",
  "canvas.renderScale",
] as const;

/** Everything that can change while the playhead moves. */
const KEYFRAMED_TARGETS = [
  "appearance.background",
  "grid.cell",
  "motion.cycles",
  "field.clearance",
  "field.density",
  "field.opacity",
  "burst.count",
  "burst.origin",
  "burst.rays",
  "burst.reach",
  "burst.thickness",
  "caption.position",
  "swirl.band",
  "swirl.center",
  "swirl.count",
  "swirl.radius",
  "swirl.turns",
  "camera.distance",
  "camera.fov",
  "camera.pan",
  "camera.roll",
  "camera.tilt",
  "glitch.amount",
  "glitch.blocks",
  "glitch.density",
  "glitch.rate",
  "glitch.slice",
  "glitch.split",
  "grid.gap",
  "grid.jitter",
  "motion.amount",
  "motion.direction",
  "motion.stagger",
  "motion.style",
  "tone.contrast",
  "tone.cutoff",
  "tone.lightness",
  "tone.response",
  "unit.angle",
  "unit.floor",
  "unit.knockout",
  "unit.scale",
] as const;

export const syntaxErrorRendererPipeline =
  registerToolcraftRendererPipeline<EnginePassContracts>()({
    interactionInvalidation: [
      {
        interaction: "initial-render",
        invalidates: ["source-sample", "unit-build", "unit-draw"],
        targets: ["source.kind"],
      },
      {
        interaction: "control-change",
        invalidates: ["source-sample", "unit-build", "unit-draw"],
        targets: ["source.kind", "source.text", "source.type"],
      },
      {
        // Cell size re-averages the grid out of the decoded raster; it never
        // decodes the source again.
        interaction: "control-drag",
        invalidates: ["unit-build", "unit-draw"],
        mustNotInvalidate: ["source-sample"],
        targets: ["grid.cell"],
      },
      {
        interaction: "control-change",
        invalidates: ["unit-build", "unit-draw"],
        mustNotInvalidate: ["source-sample"],
        targets: [...TONE_TARGETS],
      },
      {
        interaction: "control-drag",
        invalidates: ["unit-draw"],
        mustNotInvalidate: ["source-sample", "unit-build"],
        targets: [...DRAW_TARGETS],
      },
      {
        interaction: "media-import",
        invalidates: ["source-sample", "unit-build", "unit-draw"],
        targets: ["source.image", "source.svg", "source.video"],
      },
      {
        // Keyframed tone values reshape the ink field and every other keyframe
        // redraws marks. Cell size cannot be keyframed, so playback never
        // re-decodes or re-samples the source.
        interaction: "timeline-playback",
        invalidates: ["unit-build", "unit-draw"],
        mustNotInvalidate: ["source-sample"],
        targets: [...KEYFRAMED_TARGETS],
      },
      {
        interaction: "timeline-scrub",
        invalidates: ["unit-build", "unit-draw"],
        mustNotInvalidate: ["source-sample"],
        targets: [...KEYFRAMED_TARGETS],
      },
      {
        interaction: "export",
        invalidates: ["export-frame"],
        mustNotInvalidate: ["source-sample"],
        targets: [
          "export.image.format",
          "export.image.resolution",
          "export.video.format",
          "export.video.resolution",
        ],
      },
    ],
    passes: [
      {
        cacheKey: ["source.kind", "source.text"],
        cost: {
          dimensions: ["grid-cell-pitch"],
          frequency: "discrete",
          relationship: "linear",
        },
        id: "source-sample",
        inputs: [
          "source.kind",
          "source.image",
          "source.svg",
          "source.video",
          "source.text",
          "source.type",
        ],
        invalidatedBy: [
          "source.kind",
          "source.image",
          "source.svg",
          "source.video",
          "source.text",
          "source.type",
        ],
        kind: "decode",
        lifecycle: { cache: "retained-resource", resourceScope: "source" },
        output: "source",
        quality: "full",
        runsOn: "main",
        sceneBounds: sheetBounds,
      },
      {
        cacheKey: ["tone.dither", "tone.contrast", "tone.lightness"],
        cost: {
          dimensions: ["grid-cell-pitch"],
          frequency: "interaction",
          relationship: "linear",
        },
        id: "unit-build",
        inputs: [...TONE_TARGETS, "grid.cell"],
        invalidatedBy: [...TONE_TARGETS, "grid.cell", "source.kind"],
        kind: "vector-build",
        lifecycle: { cache: "memoized", resourceScope: "renderer" },
        output: "source",
        quality: "full",
        runsOn: "main",
        sceneBounds: sheetBounds,
      },
      {
        cost: {
          dimensions: ["grid-cell-pitch"],
          frequency: "frame",
          relationship: "linear",
        },
        id: "unit-draw",
        inputs: [...DRAW_TARGETS, "motion.style", "motion.amount", "motion.stagger"],
        invalidatedBy: [
          ...DRAW_TARGETS,
          "motion.style",
          "motion.amount",
          "motion.stagger",
        ],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "preview",
        quality: "full",
        runsOn: "main",
        sceneBounds: sheetBounds,
      },
      {
        cost: {
          dimensions: ["export-output-pixels", "grid-cell-pitch"],
          frequency: "discrete",
          relationship: "product",
        },
        id: "export-frame",
        inputs: ["export.image.format", "export.image.resolution"],
        invalidatedBy: [
          "export.image.format",
          "export.image.resolution",
          "export.video.format",
          "export.video.resolution",
        ],
        kind: "export",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "export",
        quality: "full",
        runsOn: "main",
        sceneBounds: sheetBounds,
      },
    ],
    runtimeId: "syntax-error-halftone",
  });
