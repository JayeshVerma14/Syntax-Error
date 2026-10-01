/** A subtle CRT monitor pass over the whole finished frame. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import {
  MAX_CRT_PASSES,
  MAX_CRT_SPACING,
  MIN_CRT_SPACING,
} from "../engine/engine-crt";
import { whenCrt } from "./schema-conditions";

export const crtSection: ToolcraftControlSectionSchema = {
  controls: {
    enabled: {
      applicability: { mode: "always" },
      defaultValue: false,
      description:
        "Faint scanlines crawl down the screen, a soft band of light rolls over it and film grain can boil over it, like an old monitor. It lies over everything, the code roll and captions included.",
      label: "CRT effect",
      performanceReason:
        "The CRT pass is a few hundred thin fills over the finished frame.",
      performanceRole: "responsiveness",
      target: "crt.enabled",
      type: "switch",
    },
    strength: {
      applicability: whenCrt,
      defaultValue: 30,
      description: "How dark the scanlines are.",
      label: "Strength",
      max: 100,
      min: 0,
      performanceReason: "Strength changes line opacity, not the number drawn.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "crt.strength",
      type: "slider",
      unit: "%",
    },
    spacing: {
      applicability: whenCrt,
      defaultValue: 4,
      description: "Distance between scanlines, in canvas pixels.",
      label: "Line spacing",
      max: MAX_CRT_SPACING,
      min: MIN_CRT_SPACING,
      performanceReason:
        "Tighter spacing draws more lines, a few hundred thin fills at most.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      step: 0.5,
      target: "crt.spacing",
      type: "slider",
      unit: "px",
    },
    band: {
      applicability: whenCrt,
      defaultValue: 35,
      description: "Brightness of the band of light that rolls down the screen; 0 turns it off.",
      label: "Light band",
      max: 100,
      min: 0,
      performanceReason: "The band is a fixed stack of thin fills.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "crt.band",
      type: "slider",
      unit: "%",
    },
    grain: {
      applicability: whenCrt,
      defaultValue: 0,
      description: "Film grain that boils over the whole picture; 0 turns it off.",
      label: "Grain",
      max: 100,
      min: 0,
      performanceReason: "Grain stamps one small noise tile across the frame.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "crt.grain",
      type: "slider",
      unit: "%",
    },
    passes: {
      applicability: whenCrt,
      defaultValue: 1,
      description:
        "Times the light band rolls down per timeline loop; the scanlines crawl in step, so the loop stays seamless.",
      label: "Passes",
      max: MAX_CRT_PASSES,
      min: 1,
      performanceReason: "Passes change the speed of the same lines.",
      performanceRole: "responsiveness",
      sliderValueKind: "discrete",
      step: 1,
      target: "crt.passes",
      type: "slider",
      variant: "discrete",
    },
  },
  id: "crt",
  title: "CRT",
};
