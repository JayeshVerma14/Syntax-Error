/**
 * One typed read of the runtime value store. Preview, export, and tests all
 * consume this shape so a control can never diverge between surfaces.
 */

import { createCurveEvaluator } from "@/toolcraft/runtime";

import {
  DEFAULT_GLYPHS,
  DEFAULT_INKS,
  DEFAULT_MIX,
  type BrushMode,
  type ColorMatch,
  type MixDistribution,
  type UnitMark,
  type DitherKind,
  type GridLayout,
  type MotionStyle,
  type PaletteMode,
  type PatternKind,
  type SourceKind,
  type UnitShape,
} from "./engine-constants";
import type { CameraSettings } from "./engine-camera";
import type { MotionSettings } from "./engine-motion";
import { readEditLayer, type EditLayer } from "./engine-edit";

export const engineTargets = {
  background: "appearance.background",
  brush: "tool.brush",
  cameraDistance: "camera.distance",
  cameraFov: "camera.fov",
  cameraPan: "camera.pan",
  cameraProjection: "camera.projection",
  cameraRoll: "camera.roll",
  cameraTilt: "camera.tilt",
  glitchAmount: "glitch.amount",
  glitchBlocks: "glitch.blocks",
  glitchDensity: "glitch.density",
  glitchOn: "glitch.enabled",
  glitchRate: "glitch.rate",
  glitchSlice: "glitch.slice",
  glitchSplit: "glitch.split",
  colorDiffuse: "palette.diffuse",
  colorMatch: "palette.match",
  mix: "unit.mix",
  mixDistribution: "unit.mixOrder",
  brushSize: "tool.size",
  circleOverlay: "view.circleOverlay",
  drawColor: "tool.color",
  editCells: "edit.cells",
  greyscale: "palette.greyscale",
  gridOverlay: "view.grid",
  ignoreColor: "output.flatInk",
  patternAngle: "pattern.angle",
  patternKind: "pattern.kind",
  patternScale: "pattern.scale",
  cell: "grid.cell",
  contrast: "tone.contrast",
  cutoff: "tone.cutoff",
  dither: "tone.dither",
  gap: "grid.gap",
  glyphs: "unit.glyphs",
  includeBackground: "export.includeBackground",
  inks: "palette.inks",
  invert: "tone.invert",
  jitter: "grid.jitter",
  layout: "grid.mode",
  lightness: "tone.lightness",
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

export type EngineSettings = Readonly<{
  background: string;
  camera: CameraSettings;
  glitch: GlitchSettings;
  brush: BrushMode;
  brushSize: number;
  colorDiffuse: boolean;
  colorMatch: ColorMatch;
  mix: readonly UnitMark[];
  mixDistribution: MixDistribution;
  circleOverlay: boolean;
  drawColor: string;
  edit: EditLayer;
  greyscale: boolean;
  gridOverlay: boolean;
  ignoreColor: boolean;
  patternAngle: number;
  patternKind: PatternKind;
  patternScale: number;
  cell: number;
  contrast: number;
  cutoff: number;
  dither: DitherKind;
  gap: number;
  glyphs: readonly string[];
  includeBackground: boolean;
  inks: readonly string[];
  invert: boolean;
  jitter: number;
  layout: GridLayout;
  lightness: number;
  motion: MotionSettings;
  paletteMode: PaletteMode;
  ramp: boolean;
  response: (input: number) => number;
  scale: number;
  shape: UnitShape;
  sourceKind: SourceKind;
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

const MARKS: readonly UnitMark[] = [
  "bar",
  "circle",
  "glyph",
  "octagon",
  "ring",
  "square",
];

function readMarks(
  values: Values,
  target: string,
  fallback: readonly UnitMark[],
): readonly UnitMark[] {
  const value = values[target];
  if (!Array.isArray(value)) return fallback;
  const entries = value.filter((entry): entry is UnitMark =>
    typeof entry === "string" && (MARKS as readonly string[]).includes(entry),
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

function readType(values: Values): TypeSettings {
  const value = values[engineTargets.sourceType];
  const record =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const letterSpacing =
    typeof record.letterSpacing === "string"
      ? (LETTER_SPACING_EM[record.letterSpacing] ?? 0)
      : 0;
  const lineHeight =
    typeof record.lineHeight === "string"
      ? (LINE_HEIGHT_SCALE[record.lineHeight] ?? 1)
      : 1;
  return {
    color:
      typeof record.color === "string" && /^#[0-9A-F]{6}$/i.test(record.color)
        ? record.color.toUpperCase()
        : "#FFFFFF",
    fontId: typeof record.fontId === "string" ? record.fontId : "inter",
    fontSize:
      typeof record.fontSize === "number" && record.fontSize > 0
        ? record.fontSize
        : 240,
    fontWeight:
      typeof record.fontWeight === "string" ? record.fontWeight : "700",
    letterSpacing,
    lineHeight,
    opacity:
      typeof record.opacity === "number" ? Math.min(100, Math.max(0, record.opacity)) : 100,
    textCase: typeof record.textCase === "string" ? record.textCase : "uppercase",
  };
}

export function readEngineSettings(values: Values): EngineSettings {
  return {
    background: readHex(values, engineTargets.background, "#F2F0ED"),
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
    brush: readString(values, engineTargets.brush, ["draw", "erase"], "draw"),
    brushSize: readNumber(values, engineTargets.brushSize, 1),
    colorDiffuse: readBoolean(values, engineTargets.colorDiffuse, false),
    colorMatch: readString(
      values,
      engineTargets.colorMatch,
      ["blend", "nearest", "tone"],
      "tone",
    ),
    mix: readMarks(values, engineTargets.mix, DEFAULT_MIX),
    mixDistribution: readString(
      values,
      engineTargets.mixDistribution,
      ["cycle", "random", "tone"],
      "random",
    ),
    circleOverlay: readBoolean(values, engineTargets.circleOverlay, false),
    drawColor: readHex(values, engineTargets.drawColor, "#FF4500"),
    edit: readEditLayer(values[engineTargets.editCells]),
    greyscale: readBoolean(values, engineTargets.greyscale, false),
    gridOverlay: readBoolean(values, engineTargets.gridOverlay, false),
    ignoreColor: readBoolean(values, engineTargets.ignoreColor, false),
    patternAngle: readNumber(values, engineTargets.patternAngle, 0),
    patternKind: readString(
      values,
      engineTargets.patternKind,
      ["checker", "dots", "noise", "ramp", "stripe"],
      "checker",
    ),
    patternScale: readNumber(values, engineTargets.patternScale, 4),
    cell: readNumber(values, engineTargets.cell, 24),
    contrast: readNumber(values, engineTargets.contrast, 0),
    cutoff: readNumber(values, engineTargets.cutoff, 50),
    dither: readString(
      values,
      engineTargets.dither,
      ["bayer4", "bayer8", "blue", "floyd", "none", "threshold"],
      "none",
    ),
    gap: readNumber(values, engineTargets.gap, 0),
    glyphs: readStringList(values, engineTargets.glyphs, DEFAULT_GLYPHS),
    includeBackground: readBoolean(values, engineTargets.includeBackground, true),
    inks: readStringList(values, engineTargets.inks, DEFAULT_INKS),
    invert: readBoolean(values, engineTargets.invert, false),
    jitter: readNumber(values, engineTargets.jitter, 0),
    layout: readString(
      values,
      engineTargets.layout,
      ["columns", "square"],
      "square",
    ),
    lightness: readNumber(values, engineTargets.lightness, 0),
    motion: {
      amount: readNumber(values, engineTargets.motionAmount, 50),
      cycles: readNumber(values, engineTargets.motionCycles, 1),
      direction: readNumber(values, engineTargets.motionDirection, 0),
      stagger: readNumber(values, engineTargets.motionStagger, 30),
      style: readString(
        values,
        engineTargets.motionStyle,
        [
          "decode",
          "drift",
          "heartbeat",
          "morph",
          "orbit",
          "pulse",
          "rain",
          "reveal",
          "ripple",
          "scan",
          "shake",
          "spin",
          "still",
          "sweep",
          "twinkle",
          "vortex",
          "wave",
        ],
        "still",
      ),
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
    shape: readString(
      values,
      engineTargets.shape,
      [
        "bar",
        "circle",
        "glyph",
        "mix",
        "octagon",
        "random",
        "ring",
        "square",
      ],
      "circle",
    ),
    sourceKind: readString(
      values,
      engineTargets.sourceKind,
      ["image", "svg", "text", "video"],
      "image",
    ),
    text:
      typeof values[engineTargets.sourceText] === "string"
        ? (values[engineTargets.sourceText] as string)
        : "SYNTAX",
    type: readType(values),
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
