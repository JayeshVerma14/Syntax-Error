/** Section grouping decisions, one entry per rendered section, machine-checked by base coverage. */

import type { ToolcraftControlSectionInventoryEntry } from "../acceptance/types";
import { engineTargets } from "../engine/engine-settings";

export const appControlSectionInventory = [
  {
    entity: "Background",
    entityId: "background",
    finiteSelectors: [
      {
        reason:
          "The background switch changes its own painted field and export alpha without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.includeBackground,
      },
    ],
    groupingReason:
      "The background switch and its colour are the one output field behind the units; runtime relocates both into Setup.",
    id: "background",
    targets: [engineTargets.includeBackground, engineTargets.background],
    title: "Background",
  },
  {
    entity: "Source",
    entityId: "source",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "Source kind decides which upload or wordmark control is usable; every dependent is an explicit applicability predicate.",
        role: "branch",
        target: engineTargets.sourceKind,
      },
    ],
    groupingReason:
      "One entity: the material the grid samples. The kind selector and the input that supplies it reset together.",
    id: "source",
    targets: [
      engineTargets.sourceKind,
      engineTargets.sourceImage,
      engineTargets.sourceSvg,
      engineTargets.sourceVideo,
      engineTargets.sourceText,
      engineTargets.sourceType,
    ],
    title: "Source",
  },
  {
    entity: "Guides",
    entityId: "guides",
    finiteSelectors: [
      {
        reason:
          "The cell grid draws its own editor guide without changing which other controls apply.",
        role: "parameter",
        target: "view.grid",
      },
      {
        reason:
          "The circle guide draws its own editor guide without changing which other controls apply.",
        role: "parameter",
        target: "view.circleOverlay",
      },
    ],
    groupingReason:
      "Editor-only guides drawn over the sheet and excluded from every artifact; they share one reset scope.",
    id: "guides",
    targets: ["view.grid", "view.circleOverlay"],
    title: "Guides",
  },
  {
    entity: "Grid",
    entityId: "grid",
    finiteSelectors: [
      {
        reason:
          "Layout changes how a unit fills its own cell without changing which other grid settings apply.",
        role: "parameter",
        target: engineTargets.layout,
      },
    ],
    groupingReason:
      "These four settings define the sampling lattice: its pitch, the room inside each cell, and how cells are laid out.",
    id: "grid",
    targets: [
      engineTargets.cell,
      engineTargets.gap,
      engineTargets.jitter,
      engineTargets.layout,
    ],
    title: "Grid",
  },
  {
    entity: "Unit",
    entityId: "unit",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "Shape decides whether the mark mix, its spread and every character setting are usable; each is an explicit applicability dependent.",
        role: "branch",
        target: engineTargets.shape,
      },
      {
        reason:
          "Spread changes how the mix is distributed without changing which other unit controls apply.",
        role: "parameter",
        target: engineTargets.mixDistribution,
      },
      {
        reason:
          "The tone ramp changes how a glyph is chosen without changing which other unit controls apply.",
        role: "parameter",
        target: engineTargets.ramp,
      },
      {
        reason:
          "Sizing changes how glyph size follows tone without changing which other unit controls apply.",
        role: "parameter",
        target: engineTargets.glyphSizing,
      },
      {
        reason:
          "Face swaps the glyph typeface without changing which other unit controls apply.",
        role: "parameter",
        target: engineTargets.glyphFace,
      },
      {
        reason:
          "Bold swaps the glyph weight without changing which other unit controls apply.",
        role: "parameter",
        target: engineTargets.glyphBold,
      },
    ],
    groupingReason:
      "One entity: the mark drawn in every cell, its shape vocabulary, how glyph marks are set as type, how ink drives its size, and whether the brightest cells are knocked out. The look command applies a whole unit setup at once.",
    id: "unit",
    targets: [
      engineTargets.unitAngle,
      engineTargets.unitFloor,
      engineTargets.knockout,
      engineTargets.mix,
      engineTargets.mixDistribution,
      engineTargets.scale,
      engineTargets.shape,
      "glyph.terminal",
      engineTargets.glyphs,
      engineTargets.ramp,
      engineTargets.glyphPhrase,
      engineTargets.glyphSizing,
      engineTargets.glyphFace,
      engineTargets.glyphBold,
    ],
    title: "Unit",
  },
  {
    entity: "Field",
    entityId: "field",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The idle field switch decides whether the field settings are usable; all three are explicit applicability dependents.",
        role: "branch",
        target: engineTargets.backdropOn,
      },
      {
        reason:
          "Clearance changes its own margin around the subject without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.backdropClearance,
      },
    ],
    groupingReason:
      "One entity: the quiet field in the empty cells, its density, its margin from the subject and its strength. These reset together.",
    id: "field",
    targets: [
      engineTargets.backdropOn,
      engineTargets.backdropDensity,
      engineTargets.backdropClearance,
      engineTargets.backdropOpacity,
    ],
    title: "Field",
  },
  {
    entity: "Tone",
    entityId: "tone",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "Dither decides whether the threshold cutoff is usable; the cutoff is an explicit applicability dependent.",
        role: "branch",
        target: engineTargets.dither,
      },
      {
        reason:
          "Invert flips the sampled field without changing which other tone controls apply.",
        role: "parameter",
        target: engineTargets.invert,
      },
    ],
    groupingReason:
      "These controls shape the sampled ink field before any unit is drawn, and reset together as one tone treatment.",
    id: "tone",
    splitReason:
      "Levels and dithering are the numeric tone pass the user tunes first; the response curve is a separate editing task with its own graph surface and its own reset.",
    targets: [
      engineTargets.contrast,
      engineTargets.cutoff,
      engineTargets.dither,
      engineTargets.invert,
      engineTargets.lightness,
    ],
    title: "Tone",
    workflowStage: "levels",
  },
  {
    entity: "Tone",
    entityId: "tone",
    finiteSelectors: [],
    groupingReason:
      "The response curve is the same tone entity, edited through one compound graph rather than numeric fields.",
    id: "tone.response",
    splitReason:
      "The curve editor is an atomic compound control with its own graph surface; keeping it beside the numeric tone fields would bury it under them.",
    targets: [engineTargets.response],
    title: "Response",
    workflowStage: "curve",
  },
  {
    entity: "Palette",
    entityId: "palette",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "Colour mode decides whether the ink list, its shuffle and colour matching are usable; each is an explicit applicability dependent.",
        role: "branch",
        target: engineTargets.paletteMode,
      },
      {
        affectedTargets: [],
        reason:
          "Match decides whether colour diffusion is usable; diffusion is an explicit applicability dependent.",
        role: "branch",
        target: engineTargets.colorMatch,
      },
      {
        reason:
          "Diffusion spreads matching error without changing which other palette controls apply.",
        role: "parameter",
        target: engineTargets.colorDiffuse,
      },
      {
        reason:
          "Greyscale converts the drawn ink without changing which other palette controls apply.",
        role: "parameter",
        target: engineTargets.greyscale,
      },
      {
        reason:
          "Flat ink swaps the colour every unit is drawn in without changing which other palette controls apply.",
        role: "parameter",
        target: engineTargets.ignoreColor,
      },
    ],
    groupingReason:
      "One entity: the colours the units are drawn in, and the command that reorders them.",
    id: "palette",
    targets: [
      engineTargets.inks,
      engineTargets.paletteMode,
      engineTargets.colorMatch,
      engineTargets.colorDiffuse,
      engineTargets.greyscale,
      engineTargets.ignoreColor,
      "palette.shuffle",
    ],
    title: "Palette",
  },
  {
    entity: "Burst",
    entityId: "burst",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The burst switch decides whether the burst settings are usable; all five are explicit applicability dependents.",
        role: "branch",
        target: engineTargets.burstOn,
      },
      {
        reason: "Ray count changes its own lines without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.burstRays,
      },
      {
        reason: "Burst count changes its own timing without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.burstCount,
      },
    ],
    groupingReason:
      "One entity: the burst of character rays, its on/off switch and the settings that shape it. These reset together.",
    id: "burst",
    targets: [
      engineTargets.burstOn,
      engineTargets.burstOrigin,
      engineTargets.burstRays,
      engineTargets.burstReach,
      engineTargets.burstThickness,
      engineTargets.burstCount,
    ],
    title: "Burst",
  },
  {
    entity: "Swirl",
    entityId: "swirl",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The swirl switch decides whether the swirl settings are usable; all five are explicit applicability dependents.",
        role: "branch",
        target: engineTargets.swirlOn,
      },
      {
        reason: "Turns changes its own orbit speed without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.swirlTurns,
      },
    ],
    groupingReason:
      "One entity: the orbiting streams of characters, their switch, centre, size and speed. These reset together.",
    id: "swirl",
    targets: [
      engineTargets.swirlOn,
      engineTargets.swirlCenter,
      engineTargets.swirlCount,
      engineTargets.swirlRadius,
      engineTargets.swirlBand,
      engineTargets.swirlTurns,
    ],
    title: "Swirl",
  },
  {
    entity: "Caption",
    entityId: "caption",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The caption switch decides whether the caption settings are usable; all six are explicit applicability dependents.",
        role: "branch",
        target: engineTargets.captionOn,
      },
      {
        reason: "Reveal changes how the caption appears without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.captionReveal,
      },
      {
        reason: "Blink changes its own flashing without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.captionBlink,
      },
      {
        reason: "The cursor draws its own character without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.captionCursor,
      },
    ],
    groupingReason:
      "One entity: the terminal text set over the sheet, its typography, placement, reveal and highlight. These reset together.",
    id: "caption",
    targets: [
      engineTargets.captionOn,
      engineTargets.captionText,
      engineTargets.captionReveal,
      engineTargets.captionType,
      engineTargets.captionPosition,
      engineTargets.captionHighlight,
      engineTargets.captionBlink,
      engineTargets.captionCursor,
    ],
    title: "Caption",
  },
  {
    entity: "Camera",
    entityId: "camera",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "View decides whether the camera properties are usable; all five are explicit applicability dependents.",
        role: "branch",
        target: "camera.projection",
      },
    ],
    groupingReason:
      "One entity: the camera looking at the sheet, its three rotations and its framing. These reset together as one view.",
    id: "camera",
    targets: [
      "camera.distance",
      "camera.fov",
      "camera.pan",
      "camera.projection",
      "camera.roll",
      "camera.tilt",
    ],
    title: "Camera",
  },
  {
    entity: "Glitch",
    entityId: "glitch",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The glitch switch decides whether the glitch settings are usable; all six are explicit applicability dependents.",
        role: "branch",
        target: "glitch.enabled",
      },
      {
        reason:
          "Block count changes its own smeared rectangles without changing which other controls apply.",
        role: "parameter",
        target: "glitch.blocks",
      },
      {
        reason:
          "Slice height changes its own band thickness without changing which other controls apply.",
        role: "parameter",
        target: "glitch.slice",
      },
    ],
    groupingReason:
      "One entity: the glitch treatment, its on/off switch and the settings that shape it. These reset together.",
    id: "glitch",
    targets: [
      "glitch.amount",
      "glitch.blocks",
      "glitch.density",
      "glitch.enabled",
      "glitch.rate",
      "glitch.slice",
      "glitch.split",
    ],
    title: "Glitch",
  },
  {
    entity: "Motion",
    entityId: "motion",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "Motion style decides whether amount, cycles, stagger and direction are usable; all four are explicit applicability dependents.",
        role: "branch",
        target: engineTargets.motionStyle,
      },
      {
        reason:
          "Cycles changes how many times the motion repeats without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.motionCycles,
      },
    ],
    groupingReason:
      "One entity: how the sheet animates across the playback loop that video export encodes.",
    id: "motion",
    targets: [
      engineTargets.motionAmount,
      engineTargets.motionCycles,
      engineTargets.motionDirection,
      engineTargets.motionStagger,
      engineTargets.motionStyle,
    ],
    title: "Motion",
  },
  {
    entity: "Image export",
    entityId: "image-export",
    finiteSelectors: [
      {
        reason: "Format selects the encoded artifact type for the same sheet.",
        role: "parameter",
        target: "export.image.format",
      },
      {
        reason: "Resolution selects the exported long edge for the same sheet.",
        role: "parameter",
        target: "export.image.resolution",
      },
    ],
    groupingReason:
      "Runtime owns this section; format and resolution together describe one exported still.",
    id: "runtime.image-export",
    targets: ["export.image.format", "export.image.resolution"],
    title: "Image Export",
  },
  {
    entity: "Video export",
    entityId: "video-export",
    finiteSelectors: [
      {
        reason: "Format selects the encoded container for the same loop.",
        role: "parameter",
        target: "export.video.format",
      },
      {
        reason: "Resolution selects the encoded dimensions for the same loop.",
        role: "parameter",
        target: "export.video.resolution",
      },
    ],
    groupingReason:
      "Runtime owns this section; container and resolution together describe one exported loop.",
    id: "runtime.video-export",
    targets: ["export.video.format", "export.video.resolution"],
    title: "Video Export",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
