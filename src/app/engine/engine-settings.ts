/**
 * One typed read of the runtime value store. Preview, export, and tests all
 * consume this shape so a control can never diverge between surfaces.
 */

import { createCurveEvaluator } from "@/toolcraft/runtime";

import {
  DEFAULT_GLYPHS,
  DEFAULT_INKS,
  DEFAULT_MIX,
  MARK_OPTIONS,
  MOTION_STYLE_OPTIONS,
  UNIT_SHAPE_OPTIONS,
  type ColorMatch,
  type DitherKind,
  type GlyphFace,
  type GlyphSizing,
  type GridLayout,
  type MixDistribution,
  type MotionStyle,
  type PaletteMode,
  type SourceKind,
  type UnitMark,
  type UnitShape,
} from "./engine-constants";
import type { CameraSettings } from "./engine-camera";
import type { MotionSettings } from "./engine-motion";

export const engineTargets = {
  background: "appearance.background",
  backdropClearance: "field.clearance",
  backdropDensity: "field.density",
  backdropOn: "field.enabled",
  backdropOpacity: "field.opacity",
  burstCount: "burst.count",
  burstOn: "burst.enabled",
  burstOrigin: "burst.origin",
  burstRays: "burst.rays",
  burstReach: "burst.reach",
  burstThickness: "burst.thickness",
  cameraDistance: "camera.distance",
  cameraFov: "camera.fov",
  cameraPan: "camera.pan",
  cameraProjection: "camera.projection",
  cameraRoll: "camera.roll",
  cameraTilt: "camera.tilt",
  captionBlink: "caption.blink",
  captionCursor: "caption.cursor",
  captionOn: "caption.enabled",
  captionHighlight: "caption.highlight",
  captionPosition: "caption.position",
  captionReveal: "caption.reveal",
  captionText: "caption.text",
  captionType: "caption.type",
  cell: "grid.cell",
  circleOverlay: "view.circleOverlay",
  colorDiffuse: "palette.diffuse",
  colorMatch: "palette.match",
  contrast: "tone.contrast",
  cutoff: "tone.cutoff",
  dither: "tone.dither",
  gap: "grid.gap",
  glitchAmount: "glitch.amount",
  glitchBlocks: "glitch.blocks",
  glitchDensity: "glitch.density",
  glitchOn: "glitch.enabled",
  glitchRate: "glitch.rate",
  glitchSlice: "glitch.slice",
  glitchSplit: "glitch.split",
  glyphBold: "glyph.bold",
  glyphFace: "glyph.face",
  glyphPhrase: "glyph.phrase",
  glyphs: "unit.glyphs",
  glyphSizing: "glyph.sizing",
  greyscale: "palette.greyscale",
  gridOverlay: "view.grid",
  ignoreColor: "output.flatInk",
  includeBackground: "export.includeBackground",
  inks: "palette.inks",
  invert: "tone.invert",
  jitter: "grid.jitter",
  knockout: "unit.knockout",
  layout: "grid.mode",
  lightness: "tone.lightness",
  mix: "unit.mix",
  mixDistribution: "unit.mixOrder",
  motionAmount: "motion.amount",
  motionCycles: "motion.cycles",
  motionDirection: "motion.direction",
  motionStagger: "motion.stagger",
  motionStyle: "motion.style",
  paletteMode: "palette.mode",
  ramp: "unit.ramp",
  response: "tone.response",
  scale: "unit.scale",
  shape: "unit.shape",
  sourceImage: "source.image",
  sourceKind: "source.kind",
  sourceSvg: "source.svg",
  sourceText: "source.text",
  sourceType: "source.type",
  sourceVideo: "source.video",
  swirlBand: "swirl.band",
  swirlCenter: "swirl.center",
  swirlCount: "swirl.count",
  swirlOn: "swirl.enabled",
  swirlRadius: "swirl.radius",
  swirlTurns: "swirl.turns",
  unitAngle: "unit.angle",
  unitFloor: "unit.floor",
} as const;

export type TypeSettings = Readonly<{
  color: string;
  fontId: string;
  fontSize: number;
  fontWeight: string;
  letterSpacing: number;
  lineHeight: number;
  opacity: number;
  textCase: string;
}>;

export type GlitchSettings = Readonly<{
  amount: number;
  blocks: number;
  density: number;
  enabled: boolean;
  rate: number;
  seed: number;
  sliceHeight: number;
  split: number;
}>;

export type GlyphSettings = Readonly<{
  bold: boolean;
  face: GlyphFace;
  /** When set, glyph cells spell this text in reading order. */
  phrase: string;
  sizing: GlyphSizing;
}>;

export type BackdropSettings = Readonly<{
  /** Empty cells kept clear around the subject. */
  clearance: number;
  /** 0..100: share of empty cells that carry a backdrop mark. */
  density: number;
  enabled: boolean;
  /** 0..100. */
  opacity: number;
}>;

/** A point in the canonical vector domain: -1..1, screen axes. */
export type VectorPoint = Readonly<{ x: number; y: number }>;

export type BurstSettings = Readonly<{
  /** Whole bursts per timeline loop. */
  count: number;
  enabled: boolean;
  origin: VectorPoint;
  rays: number;
  /** Ray length as a share of the frame diagonal, in percent. */
  reach: number;
  /** Ray width in cells. */
  thickness: number;
}>;

export type SwirlSettings = Readonly<{
  /** 0..100: how wide the orbit band is. */
  band: number;
  center: VectorPoint;
  count: number;
  enabled: boolean;
  /** Orbit radius as a share of the shorter frame side, in percent. */
  radius: number;
  /** Whole turns per timeline loop. */
  turns: number;
}>;

export type CaptionReveal = "decode" | "static" | "type";

export type CaptionSettings = Readonly<{
  blink: boolean;
  cursor: boolean;
  enabled: boolean;
  highlight: string;
  position: VectorPoint;
  reveal: CaptionReveal;
  text: string;
  type: TypeSettings;
}>;

export type EngineSettings = Readonly<{
  backdrop: BackdropSettings;
  background: string;
  burst: BurstSettings;
  camera: CameraSettings;
  caption: CaptionSettings;
  cell: number;
  circleOverlay: boolean;
  colorDiffuse: boolean;
  colorMatch: ColorMatch;
  contrast: number;
  cutoff: number;
  dither: DitherKind;
  gap: number;
  glitch: GlitchSettings;
  glyph: GlyphSettings;
  glyphs: readonly string[];
  greyscale: boolean;
  gridOverlay: boolean;
  ignoreColor: boolean;
  includeBackground: boolean;
  inks: readonly string[];
  invert: boolean;
  jitter: number;
  /** 0..100: share of bright cells drawn boxed, in short runs, with the mark cut out. */
  knockout: number;
  layout: GridLayout;
  lightness: number;
  mix: readonly UnitMark[];
  mixDistribution: MixDistribution;
  motion: MotionSettings;
  paletteMode: PaletteMode;
  ramp: boolean;
  response: (input: number) => number;
  scale: number;
  shape: UnitShape;
  sourceKind: SourceKind;
  swirl: SwirlSettings;
  text: string;
  type: TypeSettings;
  unitAngle: number;
  unitFloor: number;
}>;

type Values = Readonly<Record<string, unknown>>;

const LETTER_SPACING_EM: Readonly<Record<string, number>> = {
  normal: 0,
  tight: -0.025,
  tighter: -0.05,
  tightest: -0.1,
  wide: 0.025,
  wider: 0.05,
  widest: 0.1,
};

const LINE_HEIGHT_SCALE: Readonly<Record<string, number>> = {
  loose: 2,
  none: 1,
  normal: 1.5,
  relaxed: 1.625,
  snug: 1.375,
  spacious: 1.75,
  tight: 1.25,
};

function readNumber(values: Values, target: string, fallback: number): number {
  const value = values[target];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(
  values: Values,
  target: string,
  fallback: boolean,
): boolean {
  const value = values[target];
  return typeof value === "boolean" ? value : fallback;
}

function readString<Value extends string>(
  values: Values,
  target: string,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  const value = values[target];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as Value)
    : fallback;
}

function readText(values: Values, target: string, fallback: string): string {
  const value = values[target];
  return typeof value === "string" ? value : fallback;
}

function readHex(values: Values, target: string, fallback: string): string {
  const value = values[target];
  return typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value)
    ? value.toUpperCase()
    : fallback;
}

function readStringList(
  values: Values,
  target: string,
  fallback: readonly string[],
): readonly string[] {
  const value = values[target];
  if (!Array.isArray(value)) return fallback;
  const entries = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  return entries.length > 0 ? entries : fallback;
}

function readVector(
  values: Values,
  target: string,
  fallback: VectorPoint,
): VectorPoint {
  const value = values[target];
  if (value === null || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  return {
    x: Math.min(1, Math.max(-1, x)),
    y: Math.min(1, Math.max(-1, y)),
  };
}

const MARKS: readonly string[] = MARK_OPTIONS.map((option) => option.value);
const SHAPES: readonly UnitShape[] = UNIT_SHAPE_OPTIONS.map((option) => option.value);
const MOTION_STYLES: readonly MotionStyle[] = MOTION_STYLE_OPTIONS.map(
  (option) => option.value,
);

function readMarks(
  values: Values,
  target: string,
  fallback: readonly UnitMark[],
): readonly UnitMark[] {
  const value = values[target];
  if (!Array.isArray(value)) return fallback;
  const entries = value.filter(
    (entry): entry is UnitMark =>
      typeof entry === "string" && MARKS.includes(entry),
  );
  return entries.length > 0 ? entries : fallback;
}

function readResponse(values: Values): (input: number) => number {
  const value = values[engineTargets.response];
  const points =
    value !== null &&
    typeof value === "object" &&
    "points" in value &&
    typeof (value as { points: unknown }).points === "object"
      ? ((value as { points: Record<string, unknown> }).points.RGB as
          | readonly { x: number; y: number }[]
          | undefined)
      : undefined;
  if (!points || points.length < 2) return (input) => input;
  const evaluate = createCurveEvaluator(points, "monotone");
  return (input) => evaluate(input);
}

/** Reads one typography block, with defaults for the fields it leaves unset. */
function readTypeValue(
  values: Values,
  target: string,
  defaults: TypeSettings,
): TypeSettings {
  const value = values[target];
  const record =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    color:
      typeof record.color === "string" && /^#[0-9A-F]{6}$/i.test(record.color)
        ? record.color.toUpperCase()
        : defaults.color,
    fontId: typeof record.fontId === "string" ? record.fontId : defaults.fontId,
    fontSize:
      typeof record.fontSize === "number" && record.fontSize > 0
        ? record.fontSize
        : defaults.fontSize,
    fontWeight:
      typeof record.fontWeight === "string" ? record.fontWeight : defaults.fontWeight,
    letterSpacing:
      typeof record.letterSpacing === "string"
        ? (LETTER_SPACING_EM[record.letterSpacing] ?? 0)
        : defaults.letterSpacing,
    lineHeight:
      typeof record.lineHeight === "string"
        ? (LINE_HEIGHT_SCALE[record.lineHeight] ?? 1)
        : defaults.lineHeight,
    opacity:
      typeof record.opacity === "number"
        ? Math.min(100, Math.max(0, record.opacity))
        : defaults.opacity,
    textCase:
      typeof record.textCase === "string" ? record.textCase : defaults.textCase,
  };
}

const WORDMARK_TYPE: TypeSettings = {
  color: "#FFFFFF",
  fontId: "inter",
  fontSize: 240,
  fontWeight: "700",
  letterSpacing: 0,
  lineHeight: 1,
  opacity: 100,
  textCase: "uppercase",
};

const CAPTION_TYPE: TypeSettings = {
  color: "#FFFFFF",
  fontId: "ibm-plex-mono",
  fontSize: 30,
  fontWeight: "600",
  letterSpacing: 0,
  lineHeight: 1.25,
  opacity: 100,
  textCase: "original",
};

export function readEngineSettings(values: Values): EngineSettings {
  return {
    backdrop: {
      clearance: readNumber(values, engineTargets.backdropClearance, 2),
      density: readNumber(values, engineTargets.backdropDensity, 80),
      enabled: readBoolean(values, engineTargets.backdropOn, false),
      opacity: readNumber(values, engineTargets.backdropOpacity, 70),
    },
    background: readHex(values, engineTargets.background, "#F2F0ED"),
    burst: {
      count: readNumber(values, engineTargets.burstCount, 1),
      enabled: readBoolean(values, engineTargets.burstOn, false),
      origin: readVector(values, engineTargets.burstOrigin, { x: 0, y: 0.55 }),
      rays: readNumber(values, engineTargets.burstRays, 14),
      reach: readNumber(values, engineTargets.burstReach, 90),
      thickness: readNumber(values, engineTargets.burstThickness, 1.2),
    },
    camera: {
      distance: readNumber(values, engineTargets.cameraDistance, 1),
      fieldOfView: readNumber(values, engineTargets.cameraFov, 60),
      pan: readNumber(values, engineTargets.cameraPan, 0),
      perspective:
        readString(
          values,
          engineTargets.cameraProjection,
          ["flat", "perspective"],
          "flat",
        ) === "perspective",
      roll: readNumber(values, engineTargets.cameraRoll, 0),
      tilt: readNumber(values, engineTargets.cameraTilt, 0),
    },
    caption: {
      blink: readBoolean(values, engineTargets.captionBlink, true),
      cursor: readBoolean(values, engineTargets.captionCursor, false),
      enabled: readBoolean(values, engineTargets.captionOn, false),
      highlight: readText(values, engineTargets.captionHighlight, ""),
      position: readVector(values, engineTargets.captionPosition, { x: 0, y: 0 }),
      reveal: readString(
        values,
        engineTargets.captionReveal,
        ["decode", "static", "type"],
        "type",
      ),
      text: readText(values, engineTargets.captionText, "System > Updated"),
      type: readTypeValue(values, engineTargets.captionType, CAPTION_TYPE),
    },
    cell: readNumber(values, engineTargets.cell, 24),
    circleOverlay: readBoolean(values, engineTargets.circleOverlay, false),
    colorDiffuse: readBoolean(values, engineTargets.colorDiffuse, false),
    colorMatch: readString(
      values,
      engineTargets.colorMatch,
      ["blend", "nearest", "tone"],
      "tone",
    ),
    contrast: readNumber(values, engineTargets.contrast, 0),
    cutoff: readNumber(values, engineTargets.cutoff, 50),
    dither: readString(
      values,
      engineTargets.dither,
      ["bayer4", "bayer8", "blue", "floyd", "none", "threshold"],
      "none",
    ),
    gap: readNumber(values, engineTargets.gap, 0),
    glitch: {
      amount: readNumber(values, engineTargets.glitchAmount, 40),
      blocks: readNumber(values, engineTargets.glitchBlocks, 6),
      density: readNumber(values, engineTargets.glitchDensity, 35),
      enabled: readBoolean(values, engineTargets.glitchOn, false),
      rate: readNumber(values, engineTargets.glitchRate, 12),
      seed: 1,
      sliceHeight: readNumber(values, engineTargets.glitchSlice, 3),
      split: readNumber(values, engineTargets.glitchSplit, 0),
    },
    glyph: {
      bold: readBoolean(values, engineTargets.glyphBold, true),
      face: readString(values, engineTargets.glyphFace, ["mono", "sans", "serif"], "mono"),
      phrase: readText(values, engineTargets.glyphPhrase, ""),
      sizing: readString(values, engineTargets.glyphSizing, ["fixed", "tone"], "fixed"),
    },
    glyphs: readStringList(values, engineTargets.glyphs, DEFAULT_GLYPHS),
    greyscale: readBoolean(values, engineTargets.greyscale, false),
    gridOverlay: readBoolean(values, engineTargets.gridOverlay, false),
    ignoreColor: readBoolean(values, engineTargets.ignoreColor, false),
    includeBackground: readBoolean(values, engineTargets.includeBackground, true),
    inks: readStringList(values, engineTargets.inks, DEFAULT_INKS),
    invert: readBoolean(values, engineTargets.invert, false),
    jitter: readNumber(values, engineTargets.jitter, 0),
    knockout: readNumber(values, engineTargets.knockout, 0),
    layout: readString(
      values,
      engineTargets.layout,
      ["columns", "square", "type"],
      "square",
    ),
    lightness: readNumber(values, engineTargets.lightness, 0),
    mix: readMarks(values, engineTargets.mix, DEFAULT_MIX),
    mixDistribution: readString(
      values,
      engineTargets.mixDistribution,
      ["cycle", "random", "tone"],
      "random",
    ),
    motion: {
      amount: readNumber(values, engineTargets.motionAmount, 50),
      cycles: readNumber(values, engineTargets.motionCycles, 1),
      direction: readNumber(values, engineTargets.motionDirection, 0),
      stagger: readNumber(values, engineTargets.motionStagger, 30),
      style: readString(values, engineTargets.motionStyle, MOTION_STYLES, "still"),
    },
    paletteMode: readString(
      values,
      engineTargets.paletteMode,
      ["full", "inks", "source"],
      "inks",
    ),
    ramp: readBoolean(values, engineTargets.ramp, true),
    response: readResponse(values),
    scale: readNumber(values, engineTargets.scale, 100),
    shape: readString(values, engineTargets.shape, SHAPES, "circle"),
    sourceKind: readString(
      values,
      engineTargets.sourceKind,
      ["image", "svg", "text", "video"],
      "image",
    ),
    swirl: {
      band: readNumber(values, engineTargets.swirlBand, 50),
      center: readVector(values, engineTargets.swirlCenter, { x: 0, y: 0 }),
      count: readNumber(values, engineTargets.swirlCount, 240),
      enabled: readBoolean(values, engineTargets.swirlOn, false),
      radius: readNumber(values, engineTargets.swirlRadius, 42),
      turns: readNumber(values, engineTargets.swirlTurns, 1),
    },
    text: readText(values, engineTargets.sourceText, "SYNTAX"),
    type: readTypeValue(values, engineTargets.sourceType, WORDMARK_TYPE),
    unitAngle: readNumber(values, engineTargets.unitAngle, 0),
    unitFloor: readNumber(values, engineTargets.unitFloor, 0),
  };
}

/** The upload target that owns the currently selected source kind. */
export function sourceTargetFor(kind: SourceKind): string | null {
  if (kind === "image") return engineTargets.sourceImage;
  if (kind === "svg") return engineTargets.sourceSvg;
  if (kind === "video") return engineTargets.sourceVideo;
  return null;
}
