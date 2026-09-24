export const LOOP_SECONDS = 4;

/**
 * Ordered faintest to densest so the ramp runs the same way as the ink list.
 * The default is the dense terminal ramp the reference layers use, rather than
 * a minimal five-step set, because a long ramp is what makes a character field
 * read as continuous tone.
 */
export const DEFAULT_GLYPHS: readonly string[] = [
  ".",
  ",",
  ":",
  "-",
  "=",
  "+",
  "*",
  "c",
  "o",
  "%",
  "&",
  "$",
  "#",
  "@",
];

export const DEFAULT_INKS: readonly string[] = ["#141414", "#FF4500"];

/**
 * The stock swatch set. Full-palette colouring draws from this, and it is the
 * quick-pick row beside the drawing colour.
 */
export const SWATCHES: readonly string[] = [
  "#FF4500",
  "#0000CD",
  "#BCCF1E",
  "#12B856",
  "#1EA7E8",
  "#F51EC8",
  "#141414",
  "#FFFFFF",
  "#F5B7C8",
  "#B4C4DC",
  "#F5EDC3",
];

/** The marks a single cell can be drawn as. */
export const MARK_OPTIONS = [
  { label: "Circle", value: "circle" },
  { label: "Square", value: "square" },
  { label: "Octagon", value: "octagon" },
  { label: "Ring", value: "ring" },
  { label: "Bar", value: "bar" },
  { label: "Glyph", value: "glyph" },
] as const;

export type UnitMark = (typeof MARK_OPTIONS)[number]["value"];

/** The Shape control adds two composite choices on top of the single marks. */
export const UNIT_SHAPE_OPTIONS = [
  ...MARK_OPTIONS,
  { label: "Random", value: "random" },
  { label: "Mix", value: "mix" },
] as const;

export type UnitShape = (typeof UNIT_SHAPE_OPTIONS)[number]["value"];

/** The marks `random` draws from. */
export const RANDOM_SHAPES: readonly UnitMark[] = [
  "circle",
  "square",
  "octagon",
  "ring",
];

/** Seeds the Mix set with the reference tool's combined circles-and-squares. */
export const DEFAULT_MIX: readonly UnitMark[] = ["circle", "square"];

/** How a Mix set is spread across the grid. */
export type MixDistribution = "cycle" | "random" | "tone";

/** How sampled colour becomes an ink. */
export type ColorMatch = "blend" | "nearest" | "tone";

/** Largest number of smeared blocks one glitch frame may place. */
export const MAX_GLITCH_BLOCKS = 24;

export type GridLayout = "columns" | "square";

export type DitherKind =
  | "bayer4"
  | "bayer8"
  | "blue"
  | "floyd"
  | "none"
  | "threshold";

/**
 * `full` draws every unit from the stock swatch set, `inks` quantizes tone
 * across the editable ink list, and `source` keeps each sampled pixel colour.
 */
export type PaletteMode = "full" | "inks" | "source";

export type PatternKind = "checker" | "dots" | "noise" | "ramp" | "stripe";

export type BrushMode = "draw" | "erase";

export const MOTION_STYLE_OPTIONS = [
  { label: "Still", value: "still" },
  { label: "Pulse", value: "pulse" },
  { label: "Heartbeat", value: "heartbeat" },
  { label: "Wave", value: "wave" },
  { label: "Ripple", value: "ripple" },
  { label: "Sweep", value: "sweep" },
  { label: "Scan", value: "scan" },
  { label: "Rain", value: "rain" },
  { label: "Twinkle", value: "twinkle" },
  { label: "Drift", value: "drift" },
  { label: "Orbit", value: "orbit" },
  { label: "Spin", value: "spin" },
  { label: "Vortex", value: "vortex" },
  { label: "Morph", value: "morph" },
  { label: "Decode", value: "decode" },
  { label: "Reveal", value: "reveal" },
  { label: "Shake", value: "shake" },
] as const;

export type MotionStyle = (typeof MOTION_STYLE_OPTIONS)[number]["value"];

/** Styles that travel along a line, and therefore read the Direction control. */
export const DIRECTIONAL_MOTION: readonly MotionStyle[] = [
  "decode",
  "morph",
  "pulse",
  "reveal",
  "spin",
  "sweep",
  "wave",
];

/** Most whole motion cycles one timeline loop may hold. */
export const MAX_MOTION_CYCLES = 8;

export type SourceKind = "image" | "svg" | "text" | "video";

/** Grid cells are never sampled below this pixel pitch. */
export const MIN_CELL_PX = 2;

/** Upper bound on sampled cells per axis, protecting the interactive budget. */
export const MAX_CELLS_PER_AXIS = 1024;

/** Largest square brush footprint, in cells per side. */
export const MAX_BRUSH_CELLS = 16;

/** Marks a painted cell as deliberately empty rather than merely untouched. */
export const ERASED = "-";
