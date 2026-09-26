/** Sections that shape tone and assign ink: tone, response and palette. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import {
  DEFAULT_INKS,
} from "../engine/engine-constants";
import {
  whenMatchedColor,
  whenInkPalette,
} from "./schema-conditions";

export const toneSection: ToolcraftControlSectionSchema = {
  controls: {
    contrast: {
      applicability: { mode: "always" },
      defaultValue: 0,
      label: "Contrast",
      max: 100,
      min: -100,
      performanceReason:
        "Contrast is one pass over the already sampled grid.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "tone.contrast",
      type: "slider",
    },
    lightness: {
      applicability: { mode: "always" },
      defaultValue: 0,
      label: "Lightness",
      max: 100,
      min: -100,
      performanceReason:
        "Lightness is one pass over the already sampled grid.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "tone.lightness",
      type: "slider",
    },
    invert: {
      applicability: { mode: "always" },
      defaultValue: false,
      label: "Invert",
      performanceReason:
        "Invert flips sampled tone without changing workload.",
      performanceRole: "responsiveness",
      target: "tone.invert",
      type: "switch",
    },
    dither: {
      applicability: { mode: "always" },
      defaultValue: "none",
      label: "Dither",
      options: [
        { label: "None", value: "none" },
        { label: "Threshold", value: "threshold" },
        { label: "Bayer 4", value: "bayer4" },
        { label: "Bayer 8", value: "bayer8" },
        { label: "Floyd-Steinberg", value: "floyd" },
        { label: "Blue noise", value: "blue" },
      ],
      performanceReason:
        "Dither selects a tone pass over the same sampled grid.",
      performanceRole: "responsiveness",
      target: "tone.dither",
      type: "select",
    },
    cutoff: {
      applicability: {
        all: [{ equals: "threshold", target: "tone.dither" }],
        mode: "conditional",
      },
      defaultValue: 50,
      label: "Cutoff",
      max: 100,
      min: 0,
      performanceReason:
        "Cutoff compares existing tone values without extra work.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "tone.cutoff",
      type: "slider",
      unit: "%",
    },
  },
  id: "tone",
  title: "Tone",
};

export const toneResponseSection: ToolcraftControlSectionSchema = {
  controls: {
    curve: {
      applicability: { mode: "always" },
      curveIntent: "single-value-map",
      defaultValue: {
        activeChannel: "RGB",
        points: {
          RGB: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      },
      interpolation: "monotone",
      label: "Ink curve",
      performanceReason:
        "The response curve evaluates once per sampled cell.",
      performanceRole: "responsiveness",
      target: "tone.response",
      type: "curves",
      variant: "single",
    },
  },
  id: "tone.response",
  title: "Response",
};

export const paletteSection: ToolcraftControlSectionSchema = {
  controls: {
    mode: {
      applicability: { mode: "always" },
      defaultValue: "inks",
      label: "Color",
      options: [
        { label: "Inks", value: "inks" },
        { label: "Full", value: "full" },
        { label: "Source", value: "source" },
      ],
      performanceReason:
        "Color mode selects a per-unit color lookup of equal cost.",
      performanceRole: "responsiveness",
      target: "palette.mode",
      type: "segmented",
    },
    inks: {
      applicability: whenInkPalette,
      defaultValue: DEFAULT_INKS,
      description:
        "Tone is quantized across these inks in order, darkest first.",
      itemControl: {
        defaultValue: "#FF4500",
        performanceReason:
          "An ink entry is one colour read during quantization.",
        performanceRole: "responsiveness",
        type: "color",
      },
      label: "Inks",
      performanceReason:
        "Ink count changes one quantization lookup per unit.",
      performanceRole: "responsiveness",
      target: "palette.inks",
      type: "collectionActions",
    },
    shuffle: {
      actions: [
        {
          icon: "shuffle",
          label: "Shuffle",
          value: "palette.shuffle",
        },
      ],
      applicability: whenInkPalette,
      label: "Ink order",
      performanceReason:
        "Shuffling rewrites a short ink list and redraws the same unit count.",
      performanceRole: "responsiveness",
      target: "palette.shuffle",
      type: "actions",
    },
    match: {
      applicability: whenInkPalette,
      defaultValue: "tone",
      description:
        "Tone ramps the ink list by brightness. Nearest matches each cell to its closest ink, which keeps separate hues separate. Blend weights the two closest inks.",
      label: "Match",
      options: [
        { label: "Tone", value: "tone" },
        { label: "Nearest", value: "nearest" },
        { label: "Blend", value: "blend" },
      ],
      performanceReason:
        "Match selects a per-cell colour lookup of comparable cost.",
      performanceRole: "responsiveness",
      target: "palette.match",
      type: "segmented",
    },
    diffuse: {
      applicability: whenMatchedColor,
      defaultValue: false,
      description:
        "Spreads each cell's matching error into its neighbours, so two inks mix into a gradient instead of meeting at a hard edge.",
      label: "Diffuse",
      performanceReason:
        "Diffusion is one extra pass over the already sampled grid.",
      performanceRole: "responsiveness",
      target: "palette.diffuse",
      type: "switch",
    },
    greyscale: {
      applicability: { mode: "always" },
      defaultValue: false,
      description:
        "Converts every ink to its perceptual luma, so a colour palette can be proofed in mono.",
      label: "Greyscale",
      performanceReason:
        "Greyscale is one conversion per drawn unit colour.",
      performanceRole: "responsiveness",
      target: "palette.greyscale",
      type: "switch",
    },
    ignoreColor: {
      applicability: { mode: "always" },
      defaultValue: false,
      description:
        "Exports every unit in the first ink instead of its own colour, for single-plate print and masks.",
      label: "Flat ink on export",
      performanceReason:
        "The flag swaps one colour lookup per drawn unit.",
      performanceRole: "responsiveness",
      target: "output.flatInk",
      type: "switch",
    },
  },
  id: "palette",
  title: "Palette",
};
