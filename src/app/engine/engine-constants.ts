export const LOOP_SECONDS = 4;

/**
 * Ordered faintest to densest so the ramp runs the same way as the ink list.
 * This is the character ramp of the reference glyph films: punctuation for
 * the faintest tone, then arrows, brackets and letters, then the dense hash
 * and money marks.
 */
export const DEFAULT_GLYPHS: readonly string[] = [
  ".",
  "-",
  ">",
  ")",
  "+",
  "*",
  "C",
  "%",
  "&",
  "#",
  "$",
];

/** The characters a knocked-out glyph box carries, as in the reference films. */
export const BOX_GLYPHS: readonly string[] = ["0", "✦", "#", "0", "✦"];

/** Characters a scramble draws from while text is decoding. */
export const SCRAMBLE_GLYPHS: readonly string[] = [
  "0",
  "1",
  ":",
  ">",
  "<",
  "/",
  "=",
  "+",
  "*",
  "#",
  "_",
  "^",
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
  { label: "Rounded", value: "rounded" },
  { label: "Octagon", value: "octagon" },
  { label: "Ring", value: "ring" },
  { label: "Diamond", value: "diamond" },
  { label: "Bar", value: "bar" },
  { label: "Dash", value: "dash" },
  { label: "Plus", value: "plus" },
  { label: "Cross", value: "cross" },
  { label: "Star", value: "star" },
  { label: "Checker", value: "checker" },
  { label: "Seal", value: "seal" },
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
  "rounded",
  "octagon",
  "ring",
  "diamond",
];

/** Seeds the Mix set with the reference tool's combined circles-and-squares. */
export const DEFAULT_MIX: readonly UnitMark[] = ["circle", "square"];

/** How a Mix set is spread across the grid. */
export type MixDistribution = "cycle" | "random" | "tone";

/** How sampled colour becomes an ink. */
export type ColorMatch = "blend" | "nearest" | "tone";

/** Largest number of smeared blocks one glitch frame may place. */
export const MAX_GLITCH_BLOCKS = 24;

/**
 * `type` lays the grid out as monospaced character cells, 0.6 of a line wide,
 * the lattice a terminal draws text on.
 */
export type GridLayout = "columns" | "square" | "type";

/** Width of a character cell relative to its height in the `type` layout. */
export const TYPE_CELL_ASPECT = 0.6;

/** Typeface families a glyph unit can be set in. */
export type GlyphFace = "mono" | "sans" | "serif";

/** How a glyph's size relates to tone: `fixed` keeps one type size, as text does. */
export type GlyphSizing = "fixed" | "tone";

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
  { label: "Dissolve", value: "dissolve" },
  { label: "Grow", value: "grow" },
  { label: "Resolve", value: "resolve" },
  { label: "Flip", value: "flip" },
  { label: "Scatter", value: "scatter" },
] as const;

export type MotionStyle = (typeof MOTION_STYLE_OPTIONS)[number]["value"];

/** Styles that travel along a line, and therefore read the Direction control. */
export const DIRECTIONAL_MOTION: readonly MotionStyle[] = [
  "decode",
  "flip",
  "morph",
  "pulse",
  "resolve",
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

/** Most particles the swirl layer may carry, keeping it a bounded add-on. */
export const MAX_SWIRL_PARTICLES = 600;

/** Most rays one burst may throw. */
export const MAX_BURST_RAYS = 32;
