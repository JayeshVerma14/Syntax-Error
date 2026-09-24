/** Sections for hand editing: brush, guides and patterns. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";


export const brushSection: ToolcraftControlSectionSchema = {
  controls: {
    brush: {
      applicability: { mode: "always" },
      defaultValue: "draw",
      label: "Mode",
      options: [
        { label: "Draw", value: "draw" },
        { label: "Eraser", value: "erase" },
      ],
      performanceReason:
        "Brush mode selects what a stroke writes, not how much is drawn.",
      performanceRole: "responsiveness",
      target: "tool.brush",
      type: "segmented",
    },
    color: {
      applicability: {
        all: [{ equals: "draw", target: "tool.brush" }],
        mode: "conditional",
      },
      defaultValue: "#FF4500",
      label: "Ink",
      performanceReason:
        "The drawing colour is one value read per painted cell.",
      performanceRole: "responsiveness",
      target: "tool.color",
      type: "color",
    },
    size: {
      applicability: { mode: "always" },
      defaultValue: 1,
      description:
        "A square footprint: 1 paints a single cell, 4 paints a four-by-four block.",
      label: "Brush size",
      max: 16,
      min: 1,
      performanceReason:
        "Brush size changes cells per stroke, not cells per frame.",
      performanceRole: "responsiveness",
      sliderValueKind: "discrete",
      step: 1,
      target: "tool.size",
      type: "slider",
      variant: "discrete",
    },
  },
  id: "tool",
  title: "Brush",
};

export const guidesSection: ToolcraftControlSectionSchema = {
  controls: {
    circle: {
      applicability: { mode: "always" },
      defaultValue: false,
      description:
        "A centred circular guide for round stickers and badge lockups.",
      label: "Circle guide",
      performanceReason:
        "Guides are one editor-only stroke and never enter an artifact.",
      performanceRole: "responsiveness",
      target: "view.circleOverlay",
      type: "switch",
    },
    grid: {
      applicability: { mode: "always" },
      defaultValue: false,
      label: "Cell grid",
      performanceReason:
        "Guides are one editor-only stroke and never enter an artifact.",
      performanceRole: "responsiveness",
      target: "view.grid",
      type: "switch",
    },
  },
  id: "guides",
  layoutGroups: [
    { columns: 2, controls: ["grid", "circle"], layout: "inline" },
  ],
  title: "Guides",
};

export const patternSection: ToolcraftControlSectionSchema = {
  controls: {
    kind: {
      applicability: { mode: "always" },
      defaultValue: "checker",
      label: "Pattern",
      options: [
        { label: "Checker", value: "checker" },
        { label: "Stripe", value: "stripe" },
        { label: "Dots", value: "dots" },
        { label: "Noise", value: "noise" },
        { label: "Ramp", value: "ramp" },
      ],
      performanceReason:
        "Pattern kind selects a fill function of equal cost.",
      performanceRole: "responsiveness",
      target: "pattern.kind",
      type: "select",
    },
    scale: {
      applicability: { mode: "always" },
      defaultValue: 4,
      label: "Scale",
      max: 32,
      min: 1,
      performanceReason:
        "Scale changes pattern period, not the filled cell count.",
      performanceRole: "responsiveness",
      sliderValueKind: "discrete",
      step: 1,
      target: "pattern.scale",
      type: "slider",
      variant: "discrete",
    },
    angle: {
      applicability: { mode: "always" },
      defaultValue: 0,
      label: "Angle",
      max: 180,
      min: -180,
      performanceReason:
        "Angle rotates the fill sampling, not the drawn unit count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "pattern.angle",
      type: "slider",
      unit: "deg",
    },
    fill: {
      actions: [
        {
          icon: "wand-sparkles",
          label: "Fill canvas",
          value: "pattern.fill",
        },
      ],
      applicability: { mode: "always" },
      label: "Stamp",
      performanceReason:
        "One fill writes the painted record once for the current grid.",
      performanceRole: "responsiveness",
      target: "pattern.fill",
      type: "actions",
    },
    clear: {
      actions: [
        {
          icon: "eraser",
          label: "Clear painted",
          value: "pattern.clear",
        },
      ],
      applicability: { mode: "always" },
      label: "Painted cells",
      performanceReason:
        "Clearing drops the painted record and redraws the same grid.",
      performanceRole: "responsiveness",
      target: "pattern.clear",
      type: "actions",
    },
  },
  id: "pattern",
  title: "Patterns",
};
