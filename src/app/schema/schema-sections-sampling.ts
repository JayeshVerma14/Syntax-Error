/** Sections that choose and sample the source: background, source, grid and unit. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import {
  DEFAULT_GLYPHS,
  DEFAULT_MIX,
  MARK_OPTIONS,
  UNIT_SHAPE_OPTIONS,
} from "../engine/engine-constants";
import {
  whenGlyphShape,
  whenMixShape,
} from "./schema-conditions";

export const backgroundSection: ToolcraftControlSectionSchema = {
  controls: {
    background: {
      applicability: { mode: "always" },
      defaultValue: true,
      label: "Background",
      performanceReason:
        "Background fill is one constant-cost composite step.",
      performanceRole: "responsiveness",
      target: "export.includeBackground",
      type: "switch",
    },
    color: {
      applicability: { mode: "always" },
      defaultValue: "#F2F0ED",
      label: "Background color",
      performanceReason:
        "Background color changes one paint value, not workload.",
      performanceRole: "responsiveness",
      target: "appearance.background",
      type: "color",
    },
  },
  id: "background",
  title: "Background",
};

export const sourceSection: ToolcraftControlSectionSchema = {
  controls: {
    kind: {
      applicability: { mode: "always" },
      defaultValue: "image",
      label: "Kind",
      options: [
        { label: "Image", value: "image" },
        { label: "SVG", value: "svg" },
        { label: "Video", value: "video" },
        { label: "Text", value: "text" },
      ],
      performanceReason:
        "Source kind selects a decode path without changing unit count.",
      performanceRole: "responsiveness",
      target: "source.kind",
      type: "segmented",
    },
    image: {
      applicability: {
        all: [{ equals: "image", target: "source.kind" }],
        mode: "conditional",
      },
      assetKind: "image",
      label: "Image",
      performanceReason:
        "Decoded source pixels are resampled once per source change.",
      performanceRole: "responsiveness",
      target: "source.image",
      type: "fileDrop",
    },
    svg: {
      accept: ".svg,image/svg+xml",
      applicability: {
        all: [{ equals: "svg", target: "source.kind" }],
        mode: "conditional",
      },
      assetKind: "file",
      label: "Vector",
      performanceReason:
        "Vector source rasterizes once per source change.",
      performanceRole: "responsiveness",
      target: "source.svg",
      type: "fileDrop",
    },
    video: {
      accept: ".mp4,.webm,video/mp4,video/webm",
      applicability: {
        all: [{ equals: "video", target: "source.kind" }],
        mode: "conditional",
      },
      assetKind: "file",
      label: "Footage",
      performanceReason:
        "Footage decodes one frame per evaluated timeline time.",
      performanceRole: "responsiveness",
      target: "source.video",
      type: "fileDrop",
    },
    text: {
      applicability: {
        all: [{ equals: "text", target: "source.kind" }],
        mode: "conditional",
      },
      commitMode: "content",
      defaultValue: "SYNTAX",
      label: "Wordmark",
      performanceReason:
        "Text length changes layout only, not grid workload.",
      performanceRole: "responsiveness",
      target: "source.text",
      textValueKind: "single-line",
      type: "text",
    },
    type: {
      applicability: {
        all: [{ equals: "text", target: "source.kind" }],
        mode: "conditional",
      },
      defaultValue: {
        color: "#FFFFFF",
        fontId: "inter",
        fontSize: 240,
        fontWeight: "700",
        letterSpacing: "tight",
        lineHeight: "none",
        opacity: 100,
        textCase: "uppercase",
      },
      description:
        "The wordmark is rasterized as the tone source rather than drawn as text, so typography changes what the grid samples.",
      label: "Typeface",
      performanceReason:
        "Typography changes the rasterized mask, not the unit count.",
      performanceRole: "responsiveness",
      target: "source.type",
      type: "fontPicker",
    },
  },
  id: "source",
  title: "Source",
};

export const gridSection: ToolcraftControlSectionSchema = {
  controls: {
    cell: {
      applicability: { mode: "always" },
      defaultValue: 24,
      description:
        "Smaller cells produce more units and more render work.",
      label: "Cell size",
      max: 80,
      min: 2,
      performanceReason:
        "Cell size sets grid resolution and therefore the drawn unit count.",
      performanceRole: "workload",
      sliderValueKind: "continuous",
      step: 1,
      target: "grid.cell",
      type: "slider",
      unit: "px",
    },
    mode: {
      applicability: { mode: "always" },
      defaultValue: "square",
      label: "Layout",
      options: [
        { label: "Square", value: "square" },
        { label: "Columns", value: "columns" },
      ],
      performanceReason:
        "Layout selects a build strategy at a comparable unit count.",
      performanceRole: "responsiveness",
      target: "grid.mode",
      type: "segmented",
    },
    gap: {
      applicability: { mode: "always" },
      defaultValue: 0,
      label: "Gap",
      max: 60,
      min: 0,
      performanceReason:
        "Gap changes unit geometry at a fixed unit count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "grid.gap",
      type: "slider",
      unit: "%",
    },
    jitter: {
      applicability: { mode: "always" },
      defaultValue: 0,
      label: "Jitter",
      max: 100,
      min: 0,
      performanceReason:
        "Jitter offsets existing units without adding work.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "grid.jitter",
      type: "slider",
      unit: "%",
    },
  },
  id: "grid",
  title: "Grid",
};

export const unitSection: ToolcraftControlSectionSchema = {
  controls: {
    shape: {
      applicability: { mode: "always" },
      defaultValue: "circle",
      label: "Shape",
      options: UNIT_SHAPE_OPTIONS,
      performanceReason:
        "Shape selects a draw routine at a fixed unit count.",
      performanceRole: "responsiveness",
      target: "unit.shape",
      type: "select",
    },
    mix: {
      applicability: whenMixShape,
      defaultValue: DEFAULT_MIX,
      description:
        "Every entry is drawn somewhere on the sheet, so a square and a glyph can share one composition. Repeat an entry to weight it.",
      itemControl: {
        defaultValue: "square",
        options: MARK_OPTIONS,
        performanceReason:
          "A mix entry is one lookup when a cell picks its mark.",
        performanceRole: "responsiveness",
        type: "select",
      },
      label: "Marks",
      performanceReason:
        "Mix size changes one lookup per cell, not the drawn unit count.",
      performanceRole: "responsiveness",
      target: "unit.mix",
      type: "collectionActions",
    },
    mixOrder: {
      applicability: whenMixShape,
      defaultValue: "random",
      label: "Spread",
      options: [
        { label: "Random", value: "random" },
        { label: "Cycle", value: "cycle" },
        { label: "Tone", value: "tone" },
      ],
      performanceReason:
        "Spread selects how a cell picks from the mix, at equal cost.",
      performanceRole: "responsiveness",
      target: "unit.mixOrder",
      type: "segmented",
    },
    glyphs: {
      applicability: whenGlyphShape,
      defaultValue: DEFAULT_GLYPHS,
      description:
        "Each entry is one printable character or symbol drawn in place of a dot.",
      itemControl: {
        defaultValue: "*",
        performanceReason:
          "A glyph entry is one string read during ramp selection.",
        performanceRole: "responsiveness",
        textValueKind: "single-line",
        type: "text",
      },
      label: "Glyphs",
      performanceReason:
        "Glyph count changes one ramp lookup, not the drawn unit count.",
      performanceRole: "responsiveness",
      target: "unit.glyphs",
      type: "collectionActions",
    },
    ramp: {
      applicability: whenGlyphShape,
      defaultValue: true,
      description:
        "On maps the faintest ink to the first glyph and the densest to the last. Off cycles glyphs across the grid.",
      label: "Tone ramp",
      performanceReason:
        "Ramp selection is one lookup per existing unit.",
      performanceRole: "responsiveness",
      target: "unit.ramp",
      type: "switch",
    },
    scale: {
      applicability: { mode: "always" },
      defaultValue: 100,
      label: "Tone response",
      max: 200,
      min: 0,
      performanceReason:
        "Tone response scales existing units without adding work.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "unit.scale",
      type: "slider",
      unit: "%",
    },
    floor: {
      applicability: { mode: "always" },
      defaultValue: 0,
      label: "Floor",
      max: 100,
      min: 0,
      performanceReason:
        "Floor raises the smallest unit without adding units.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "unit.floor",
      type: "slider",
      unit: "%",
    },
    angle: {
      applicability: { mode: "always" },
      defaultValue: 0,
      label: "Rotation",
      max: 180,
      min: -180,
      performanceReason:
        "Rotation is a per-unit transform at a fixed unit count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "unit.angle",
      type: "slider",
      unit: "deg",
    },
  },
  id: "unit",
  title: "Unit",
};
