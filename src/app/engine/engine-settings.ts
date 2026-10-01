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
import { readAudio, type AudioSettings } from "./engine-audio";
import { barTargets, readBars, type BarSettings } from "./engine-bars";
import type { CameraSettings } from "./engine-camera";
import { readCrt, type CrtSettings } from "./engine-crt";
import { DATA_TEXT_TYPE, dataTextTargets, readDataText, type DataTextSettings } from "./engine-datatext";
import { readForm, type FormSettings } from "./engine-form";
import { readWall, WALL_TYPE, wallTargets, type WallSettings } from "./engine-wall";
import { FIELD_MOTIONS, type FieldMotion } from "./engine-field";
import { readLogo, type LogoSettings } from "./engine-logo";
import { readTransition, type TransitionSettings } from "./engine-transition";
import {
  readLayerParticle,
  readParticles,
  type LayerParticle,
  type ParticleSettings,
} from "./engine-particles";
import {
  DEFAULT_CODE_BREAK_SECONDS,
  DEFAULT_CODE_PAUSE_SECONDS,
  DEFAULT_CODE_ROLL_SECONDS,
  DEFAULT_CODE_TEXT,
  DEFAULT_END_HOLD_SECONDS,
  DEFAULT_END_TEXT,
} from "./engine-code-text";
import type { MotionSettings } from "./engine-motion";
import {
  readBoolean,
  readHex,
  readNumber,
  readString,
  readStringList,
  readText,
  readVector,
  type Values,
} from "./engine-values";

export const engineTargets = {
  background: "appearance.background",
  backdropClearance: "field.clearance",
  backdropDensity: "field.density",
  backdropMotion: "field.motion",
  backdropOn: "field.enabled",
  backdropOpacity: "field.opacity",
  backdropSpeed: "field.speed",
  burstCount: "burst.count",
  burstOn: "burst.enabled",
  burstOrigin: "burst.origin",
  burstRays: "burst.rays",
  burstReach: "burst.reach",
  burstSpeed: "burst.speed",
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
  codeBreakStyle: "code.breakStyle",
  codeBreakTime: "code.breakTime",
  codeMotion: "code.motion",
  codeOn: "code.enabled",
  codeHold: "code.hold",
  codeReveal: "code.reveal",
  codeRollTime: "code.rollTime",
  codeSheetAtEnd: "code.sheetAtEnd",
  codeText: "code.text",
  codeType: "code.type",
  colorDiffuse: "palette.diffuse",
  colorMatch: "palette.match",
  contrast: "tone.contrast",
  cutoff: "tone.cutoff",
  dither: "tone.dither",
  endBlink: "endText.blink",
  endCursor: "endText.cursor",
  endHighlight: "endText.highlight",
  endHold: "endText.hold",
  endOn: "endText.enabled",
  endPosition: "endText.position",
  endReveal: "endText.reveal",
  endText: "endText.text",
  endType: "endText.type",
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
  /** How the field moves across the loop. */
  motion: FieldMotion;
  /** 0..100. */
  opacity: number;
  /** What the field is made of. */
  particles: ParticleSettings;
  /** 1..100: how fast the field moves, in real time. */
  speed: number;
}>;

/** A point in the canonical vector domain: -1..1, screen axes. */
export type VectorPoint = Readonly<{ x: number; y: number }>;

export type BurstSettings = Readonly<{
  /** Whole bursts per timeline loop. */
  count: number;
  enabled: boolean;
  origin: VectorPoint;
  /** What the rays are made of. */
  particle: LayerParticle;
  rays: number;
  /** Ray length as a share of the frame diagonal, in percent. */
  reach: number;
  /** Percent; 100 plays one burst across its whole slot of the loop. */
  speed: number;
  /** Ray width in cells. */
  thickness: number;
}>;

export type SwirlSettings = Readonly<{
  /** 0..100: how wide the orbit band is. */
  band: number;
  center: VectorPoint;
  count: number;
  enabled: boolean;
  /** What orbits. */
  particle: LayerParticle;
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

/** How the code text travels: a filling terminal, or a block rolling through. */
export type CodeMotion = "down" | "terminal" | "up";

/** How each line appears as it arrives. */
export type CodeReveal = "decode" | "glitch" | "line" | "type";

/** How the code breaks apart once it has held. */
export type CodeBreakStyle = "burst" | "fall" | "glitch" | "swirl" | "vortex" | "wind";

export const CODE_BREAK_STYLES: readonly CodeBreakStyle[] = [
  "swirl",
  "burst",
  "vortex",
  "fall",
  "wind",
  "glitch",
];

export type CodeRollSettings = Readonly<{
  breakStyle: CodeBreakStyle;
  /** Seconds the break takes, until the last character has gone. */
  breakTime: number;
  enabled: boolean;
  motion: CodeMotion;
  /** Seconds the arrived text holds still before it breaks. */
  pause: number;
  reveal: CodeReveal;
  /** Seconds for the whole text to arrive. */
  rollTime: number;
  /** Whether the sheet returns once the code has broken away. */
  sheetAtEnd: boolean;
  text: string;
  type: TypeSettings;
}>;

/** Caption-style closing text, shown for `hold` seconds after the code roll. */
export type EndTextSettings = CaptionSettings &
  Readonly<{
    hold: number;
  }>;

export type EngineSettings = Readonly<{
  audio: AudioSettings;
  backdrop: BackdropSettings;
  bars: BarSettings;
  background: string;
  burst: BurstSettings;
  camera: CameraSettings;
  caption: CaptionSettings;
  cell: number;
  circleOverlay: boolean;
  code: CodeRollSettings;
  crt: CrtSettings;
  dataText: DataTextSettings;
  colorDiffuse: boolean;
  colorMatch: ColorMatch;
  contrast: number;
  cutoff: number;
  dither: DitherKind;
  endText: EndTextSettings;
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
  logo: LogoSettings;
  wall: WallSettings;
  form: FormSettings;
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
  transition: TransitionSettings;
  type: TypeSettings;
  unitAngle: number;
  unitFloor: number;
}>;

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

const BAR_TYPE: TypeSettings = { ...CAPTION_TYPE, fontSize: 26 };

const CODE_TYPE: TypeSettings = {
  ...CAPTION_TYPE,
  fontSize: 18,
  fontWeight: "500",
};

/** A phase length in seconds, never negative. */
function readSeconds(values: Values, target: string, fallback: number): number {
  return Math.max(0, readNumber(values, target, fallback));
}

export function readCodeRoll(values: Values): CodeRollSettings {
  return {
    breakStyle: readString(values, engineTargets.codeBreakStyle, CODE_BREAK_STYLES, "swirl"),
    breakTime: readSeconds(values, engineTargets.codeBreakTime, DEFAULT_CODE_BREAK_SECONDS),
    enabled: readBoolean(values, engineTargets.codeOn, false),
    motion: readString(values, engineTargets.codeMotion, ["down", "terminal", "up"], "terminal"),
    pause: readSeconds(values, engineTargets.codeHold, DEFAULT_CODE_PAUSE_SECONDS),
    reveal: readString(
      values,
      engineTargets.codeReveal,
      ["decode", "glitch", "line", "type"],
      "type",
    ),
    rollTime: readSeconds(values, engineTargets.codeRollTime, DEFAULT_CODE_ROLL_SECONDS),
    sheetAtEnd: readBoolean(values, engineTargets.codeSheetAtEnd, false),
    text: readText(values, engineTargets.codeText, DEFAULT_CODE_TEXT),
    type: readTypeValue(values, engineTargets.codeType, CODE_TYPE),
  };
}

export function readEndText(values: Values): EndTextSettings {
  return {
    blink: readBoolean(values, engineTargets.endBlink, true),
    cursor: readBoolean(values, engineTargets.endCursor, false),
    enabled: readBoolean(values, engineTargets.endOn, false),
    highlight: readText(values, engineTargets.endHighlight, ""),
    hold: readSeconds(values, engineTargets.endHold, DEFAULT_END_HOLD_SECONDS),
    position: readVector(values, engineTargets.endPosition, { x: 0, y: 0 }),
    reveal: readString(values, engineTargets.endReveal, ["decode", "static", "type"], "type"),
    text: readText(values, engineTargets.endText, DEFAULT_END_TEXT),
    type: readTypeValue(values, engineTargets.endType, CAPTION_TYPE),
  };
}

export function readEngineSettings(values: Values): EngineSettings {
  return {
    audio: readAudio(values),
    backdrop: {
      clearance: readNumber(values, engineTargets.backdropClearance, 2),
      density: readNumber(values, engineTargets.backdropDensity, 80),
      enabled: readBoolean(values, engineTargets.backdropOn, false),
      motion: readString(values, engineTargets.backdropMotion, FIELD_MOTIONS, "still"),
      opacity: readNumber(values, engineTargets.backdropOpacity, 70),
      particles: readParticles(values),
      speed: readNumber(values, engineTargets.backdropSpeed, 20),
    },
    background: readHex(values, engineTargets.background, "#F2F0ED"),
    bars: readBars(values, readTypeValue(values, barTargets.type, BAR_TYPE)),
    burst: {
      count: readNumber(values, engineTargets.burstCount, 1),
      enabled: readBoolean(values, engineTargets.burstOn, false),
      origin: readVector(values, engineTargets.burstOrigin, { x: 0, y: 0.55 }),
      particle: readLayerParticle(values, "burst.particle"),
      rays: readNumber(values, engineTargets.burstRays, 14),
      reach: readNumber(values, engineTargets.burstReach, 90),
      speed: readNumber(values, engineTargets.burstSpeed, 100),
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
    code: readCodeRoll(values),
    crt: readCrt(values),
    dataText: readDataText(values, readTypeValue(values, dataTextTargets.type, DATA_TEXT_TYPE)),
    form: readForm(values),
    wall: readWall(values, readTypeValue(values, wallTargets.type, WALL_TYPE)),
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
    endText: readEndText(values),
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
    logo: readLogo(values, readTypeValue(values, engineTargets.codeType, CODE_TYPE)),
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
      particle: readLayerParticle(values, "swirl.particle"),
      radius: readNumber(values, engineTargets.swirlRadius, 42),
      turns: readNumber(values, engineTargets.swirlTurns, 1),
    },
    text: readText(values, engineTargets.sourceText, "SYNTAX"),
    transition: readTransition(values),
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
