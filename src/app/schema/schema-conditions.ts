/** Applicability predicates shared by several schema sections. */

import { DIRECTIONAL_MOTION, UNIT_SHAPE_OPTIONS } from "../engine/engine-constants";

/** Glyph settings apply to the single Glyph mark and to a Mix containing it. */
export const whenGlyphShape = {
  all: [{ oneOf: ["glyph", "mix"], target: "unit.shape" }],
  mode: "conditional",
} as const;

/** Applies under every shape, while still grouping with the Shape selector. */
export const whenAnyShape = {
  all: [{ oneOf: UNIT_SHAPE_OPTIONS.map((option) => option.value), target: "unit.shape" }],
  mode: "conditional",
} as const;

export const whenMixShape = {
  all: [{ equals: "mix", target: "unit.shape" }],
  mode: "conditional",
} as const;

export const whenMatchedColor = {
  all: [
    { equals: "inks", target: "palette.mode" },
    { notEquals: "tone", target: "palette.match" },
  ],
  mode: "conditional",
} as const;

export const whenInkPalette = {
  all: [{ equals: "inks", target: "palette.mode" }],
  mode: "conditional",
} as const;

export const whenPerspective = {
  all: [{ equals: "perspective", target: "camera.projection" }],
  mode: "conditional",
} as const;

export const whenGlitching = {
  all: [{ equals: true, target: "glitch.enabled" }],
  mode: "conditional",
} as const;

export const whenAnimated = {
  all: [{ notEquals: "still", target: "motion.style" }],
  mode: "conditional",
} as const;

/** Direction applies only to styles that travel along a line. */
export const whenDirectionalMotion = {
  all: [{ oneOf: DIRECTIONAL_MOTION, target: "motion.style" }],
  mode: "conditional",
} as const;

export const whenField = {
  all: [{ equals: true, target: "field.enabled" }],
  mode: "conditional",
} as const;

export const whenBursting = {
  all: [{ equals: true, target: "burst.enabled" }],
  mode: "conditional",
} as const;

export const whenSwirling = {
  all: [{ equals: true, target: "swirl.enabled" }],
  mode: "conditional",
} as const;

export const whenCaptioned = {
  all: [{ equals: true, target: "caption.enabled" }],
  mode: "conditional",
} as const;
