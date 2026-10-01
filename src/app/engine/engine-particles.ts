/**
 * What the idle field is made of. By default it follows the unit shape (the
 * terminal's `. - >` characters, or small dots for shape units), but any
 * particle can be chosen: dots, rings, bars, dashes, plus signs, boxed
 * squares, solid blocks, a crosshair lattice of plus signs framed by corner
 * brackets like a targeting HUD, or a mix of them.
 *
 * Morph cycles each cell through a sequence of particles that starts from the
 * chosen one, the way a band of cells flips from dash rows to dots to boxed
 * squares.
 */

import type { UnitMark } from "./engine-constants";
import { readNumber, readString, type Values } from "./engine-values";

export const particleTargets = {
  kind: "field.particle",
  size: "field.size",
} as const;

export type FieldParticle =
  | "blocks"
  | "boxes"
  | "crosshair"
  | "dashes"
  | "dots"
  | "glyphs"
  | "match"
  | "mix"
  | "plus"
  | "rings"
  | "bars";

export const FIELD_PARTICLE_OPTIONS = [
  { label: "Match marks", value: "match" },
  { label: "Glyphs", value: "glyphs" },
  { label: "Dots", value: "dots" },
  { label: "Rings", value: "rings" },
  { label: "Bars", value: "bars" },
  { label: "Dashes", value: "dashes" },
  { label: "Plus", value: "plus" },
  { label: "Crosshair", value: "crosshair" },
  { label: "Boxes", value: "boxes" },
  { label: "Blocks", value: "blocks" },
  { label: "Mix", value: "mix" },
] as const satisfies readonly { label: string; value: FieldParticle }[];

const PARTICLES: readonly FieldParticle[] = FIELD_PARTICLE_OPTIONS.map((option) => option.value);

export type ParticleSettings = Readonly<{
  kind: FieldParticle;
  /** 25..250: particle size as a share of its natural size. */
  size: number;
}>;

export function readParticles(values: Values): ParticleSettings {
  return {
    kind: readString(values, particleTargets.kind, PARTICLES, "match"),
    size: Math.min(250, Math.max(25, readNumber(values, particleTargets.size, 100))),
  };
}

/** One field cell as a concrete mark: its shape, quarter turn and size. */
export type ParticleMark = {
  mark: UnitMark;
  /** Quarter turns, for corner brackets. */
  quarter: number;
  /** Size as a share of the cell's shorter side; glyphs ignore it. */
  size: number;
};

/** Natural sizes, as a share of the cell's shorter side. */
const SIZE: Record<Exclude<FieldParticle, "crosshair" | "match" | "mix">, number> = {
  bars: 0.8,
  blocks: 0.62,
  boxes: 0.72,
  dashes: 1.02,
  dots: 0.3,
  glyphs: 1,
  plus: 0.55,
  rings: 0.55,
};

const MARK: Record<Exclude<FieldParticle, "crosshair" | "match" | "mix">, UnitMark> = {
  bars: "bar",
  blocks: "square",
  boxes: "boxdot",
  dashes: "dash",
  dots: "circle",
  glyphs: "glyph",
  plus: "plus",
  rings: "ring",
};

const MIXED: readonly Exclude<FieldParticle, "crosshair" | "match" | "mix">[] = [
  "dots",
  "dashes",
  "plus",
  "boxes",
  "glyphs",
];

/** The particles Morph steps through, starting from the chosen one. */
const MORPH: readonly Exclude<FieldParticle, "crosshair" | "match" | "mix">[] = [
  "dashes",
  "dots",
  "boxes",
  "plus",
];

function hash(column: number, row: number, salt: number): number {
  let h = Math.imul(column + 3, 2_654_435_761) ^ Math.imul(row + 5, 1_597_334_677);
  h = Math.imul(h ^ Math.imul(salt + 1, 2_246_822_519), 3_266_489_917);
  return ((h ^ (h >>> 15)) >>> 0) / 4_294_967_295;
}

/**
 * A lattice of three by three cells: corner brackets open towards the
 * middle, a large plus sits in the centre and small ones on the edges.
 */
function crosshair(column: number, row: number, out: ParticleMark): ParticleMark {
  const x = ((column % 3) + 3) % 3;
  const y = ((row % 3) + 3) % 3;
  if (x !== 1 && y !== 1) {
    out.mark = "bracket";
    // Top-left opens down-right; each quarter turn moves one corner clockwise.
    out.quarter = x === 0 ? (y === 0 ? 0 : 3) : y === 0 ? 1 : 2;
    out.size = 0.8;
  } else {
    out.mark = "plus";
    out.quarter = 0;
    out.size = x === 1 && y === 1 ? 0.7 : 0.3;
  }
  return out;
}

/**
 * Resolves the chosen particle for one cell. `glyphLayers` is whether the
 * units are characters, which Match follows; `stage` is the Morph step, or -1.
 * The returned mark is reused between calls, so read it before the next cell.
 */
export function createParticlePicker(
  kind: FieldParticle,
  glyphLayers: boolean,
): (column: number, row: number, stage: number) => ParticleMark {
  const out: ParticleMark = { mark: "circle", quarter: 0, size: 0.16 };
  const set = (particle: Exclude<FieldParticle, "crosshair" | "match" | "mix">) => {
    out.mark = MARK[particle];
    out.quarter = 0;
    out.size = SIZE[particle];
    return out;
  };
  const start = Math.max(0, MORPH.indexOf(kind as (typeof MORPH)[number]));
  return (column, row, stage) => {
    if (stage >= 0) return set(MORPH[(start + stage) % MORPH.length]);
    switch (kind) {
      case "match":
        if (glyphLayers) return set("glyphs");
        out.mark = "circle";
        out.quarter = 0;
        out.size = 0.16;
        return out;
      case "crosshair":
        return crosshair(column, row, out);
      case "mix":
        return set(MIXED[Math.floor(hash(column, row, 17) * MIXED.length) % MIXED.length]);
      default:
        return set(kind);
    }
  };
}

/**
 * What the burst and the swirl throw: their own characters by default, or
 * dots, dashes and bars that turn with their flight, plus signs, blocks,
 * rings or boxed squares.
 */
export type LayerParticle = "bars" | "blocks" | "boxes" | "dashes" | "dots" | "glyphs" | "plus" | "rings";

export const LAYER_PARTICLE_OPTIONS = [
  { label: "Glyphs", value: "glyphs" },
  { label: "Dots", value: "dots" },
  { label: "Dashes", value: "dashes" },
  { label: "Bars", value: "bars" },
  { label: "Plus", value: "plus" },
  { label: "Blocks", value: "blocks" },
  { label: "Rings", value: "rings" },
  { label: "Boxes", value: "boxes" },
] as const satisfies readonly { label: string; value: LayerParticle }[];

const LAYER_PARTICLES: readonly LayerParticle[] = LAYER_PARTICLE_OPTIONS.map((option) => option.value);

export function readLayerParticle(values: Values, target: string): LayerParticle {
  return readString(values, target, LAYER_PARTICLES, "glyphs");
}

/** Sizes against the layer's glyph size. */
const LAYER_SIZE: Record<Exclude<LayerParticle, "glyphs">, number> = {
  bars: 0.85,
  blocks: 0.5,
  boxes: 0.6,
  dashes: 0.9,
  dots: 0.36,
  plus: 0.6,
  rings: 0.6,
};

export function layerParticleMark(kind: Exclude<LayerParticle, "glyphs">): UnitMark {
  return MARK[kind];
}

export function layerParticleSize(kind: Exclude<LayerParticle, "glyphs">): number {
  return LAYER_SIZE[kind];
}

/** The heading a burst stroke character stands for, so dashes turn with it. */
export function strokeHeading(glyph: string): number {
  if (glyph === "|") return Math.PI / 2;
  if (glyph === "\\") return Math.PI / 4;
  if (glyph === "/") return -Math.PI / 4;
  return 0;
}

/** Burst heads and embers draw larger or smaller than its streaks. */
export function strokeWeight(glyph: string): number {
  if (glyph === "*" || glyph === "+") return 1.4;
  if (glyph === "." || glyph === ":") return 0.55;
  return 1;
}
