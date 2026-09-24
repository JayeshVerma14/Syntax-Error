/** Sections that pose, disturb and animate the sheet: camera, glitch and motion. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import {
  MAX_MOTION_CYCLES,
  MOTION_STYLE_OPTIONS,
} from "../engine/engine-constants";
import {
  whenPerspective,
  whenGlitching,
  whenAnimated,
  whenDirectionalMotion,
} from "./schema-conditions";

export const cameraSection: ToolcraftControlSectionSchema = {
  controls: {
    projection: {
      applicability: { mode: "always" },
      defaultValue: "flat",
      label: "View",
      options: [
        { label: "Flat", value: "flat" },
        { label: "3D", value: "perspective" },
      ],
      performanceReason:
        "Perspective adds one projection and a depth sort over the same marks.",
      performanceRole: "responsiveness",
      target: "camera.projection",
      type: "segmented",
    },
    tilt: {
      applicability: whenPerspective,
      defaultValue: 0,
      label: "Tilt",
      max: 80,
      min: -80,
      performanceReason:
        "Tilt rotates the plane before projection at a fixed mark count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "camera.tilt",
      type: "slider",
      unit: "deg",
    },
    pan: {
      applicability: whenPerspective,
      defaultValue: 0,
      label: "Pan",
      max: 80,
      min: -80,
      performanceReason:
        "Pan rotates the plane before projection at a fixed mark count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "camera.pan",
      type: "slider",
      unit: "deg",
    },
    roll: {
      applicability: whenPerspective,
      defaultValue: 0,
      label: "Roll",
      max: 180,
      min: -180,
      performanceReason:
        "Roll rotates the plane before projection at a fixed mark count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "camera.roll",
      type: "slider",
      unit: "deg",
    },
    distance: {
      applicability: whenPerspective,
      defaultValue: 1,
      description:
        "1 frames the sheet exactly. Higher pulls the camera back so more of the tilted plane fits; lower pushes in.",
      label: "Distance",
      max: 4,
      min: 0.3,
      performanceReason:
        "Distance changes one projection constant, not the drawn mark count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      step: 0.1,
      target: "camera.distance",
      type: "slider",
    },
    fov: {
      applicability: whenPerspective,
      defaultValue: 60,
      description:
        "Wider angles make the plane converge harder toward its vanishing point; narrow angles flatten it.",
      label: "Field of view",
      max: 120,
      min: 10,
      performanceReason:
        "Field of view changes one projection constant per frame.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "camera.fov",
      type: "slider",
      unit: "deg",
    },
  },
  id: "camera",
  title: "Camera",
};

export const glitchSection: ToolcraftControlSectionSchema = {
  controls: {
    enabled: {
      applicability: { mode: "always" },
      defaultValue: false,
      label: "Glitch effect",
      performanceReason:
        "Off returns the identity plan, so the glitch costs nothing.",
      performanceRole: "responsiveness",
      target: "glitch.enabled",
      type: "switch",
    },
    amount: {
      applicability: whenGlitching,
      defaultValue: 40,
      label: "Amount",
      max: 100,
      min: 0,
      performanceReason:
        "Amount scales existing displacement without adding marks.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "glitch.amount",
      type: "slider",
      unit: "%",
    },
    rate: {
      applicability: whenGlitching,
      defaultValue: 12,
      description:
        "How many times the displacement is redrawn across one loop. Lower holds each tear longer.",
      label: "Rate",
      max: 60,
      min: 1,
      performanceReason:
        "Rate quantises the frame seed and does not change workload.",
      performanceRole: "responsiveness",
      sliderValueKind: "discrete",
      step: 1,
      target: "glitch.rate",
      type: "slider",
    },
    density: {
      applicability: whenGlitching,
      defaultValue: 35,
      description:
        "How many horizontal bands tear. Lower leaves more of the sheet intact.",
      label: "Tear density",
      max: 100,
      min: 0,
      performanceReason:
        "Density changes one comparison per band, not the mark count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "glitch.density",
      type: "slider",
      unit: "%",
    },
    slice: {
      applicability: whenGlitching,
      defaultValue: 3,
      label: "Slice height",
      max: 24,
      min: 1,
      performanceReason:
        "Slice height groups rows into bands at a fixed mark count.",
      performanceRole: "responsiveness",
      sliderValueKind: "discrete",
      step: 1,
      target: "glitch.slice",
      type: "slider",
      variant: "discrete",
    },
    blocks: {
      applicability: whenGlitching,
      defaultValue: 6,
      description:
        "Rectangles that redraw their content from elsewhere on the sheet.",
      label: "Blocks",
      max: 24,
      min: 0,
      performanceReason:
        "Block count changes a short per-cell test, not the mark count.",
      performanceRole: "responsiveness",
      sliderValueKind: "discrete",
      step: 1,
      target: "glitch.blocks",
      type: "slider",
      variant: "discrete",
    },
    split: {
      applicability: whenGlitching,
      defaultValue: 0,
      description:
        "Draws offset red and cyan copies behind the sheet, like a mistracked channel.",
      label: "Channel split",
      max: 100,
      min: 0,
      performanceReason:
        "Split adds at most two fringe passes; the value sets their alpha, not their count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "glitch.split",
      type: "slider",
      unit: "%",
    },
  },
  id: "glitch",
  title: "Glitch",
};

export const motionSection: ToolcraftControlSectionSchema = {
  controls: {
    style: {
      applicability: { mode: "always" },
      defaultValue: "still",
      label: "Style",
      options: MOTION_STYLE_OPTIONS,
      performanceReason:
        "Motion style selects a per-frame phase function of equal cost.",
      performanceRole: "responsiveness",
      target: "motion.style",
      type: "select",
    },
    amount: {
      applicability: whenAnimated,
      defaultValue: 50,
      label: "Amount",
      max: 100,
      min: 0,
      performanceReason: "Amount scales an existing per-frame offset.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "motion.amount",
      type: "slider",
      unit: "%",
    },
    cycles: {
      applicability: whenAnimated,
      defaultValue: 1,
      description:
        "Whole repeats of the motion inside one timeline loop. Keyframed values round to whole repeats, so each stretch between keyframes still loops cleanly.",
      label: "Cycles",
      max: MAX_MOTION_CYCLES,
      min: 1,
      performanceReason:
        "Cycles scales loop phase and does not change the mark count.",
      performanceRole: "responsiveness",
      sliderValueKind: "discrete",
      step: 1,
      target: "motion.cycles",
      type: "slider",
      variant: "discrete",
    },
    direction: {
      applicability: whenDirectionalMotion,
      defaultValue: 0,
      description:
        "The line the motion travels along: 0 runs left to right, 90 top to bottom.",
      label: "Direction",
      max: 360,
      min: 0,
      performanceReason:
        "Direction rotates one travel vector per frame.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "motion.direction",
      type: "slider",
      unit: "deg",
    },
    stagger: {
      applicability: whenAnimated,
      defaultValue: 30,
      description:
        "How widely the motion is spread across the grid: the delay of a travelling pulse, the spacing of ripples, the length of a rain trail, how scattered twinkles are.",
      label: "Stagger",
      max: 100,
      min: 0,
      performanceReason:
        "Stagger shifts per-unit phase without adding units.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "motion.stagger",
      type: "slider",
      unit: "%",
    },
  },
  id: "motion",
  title: "Motion",
};
