/**
 * What a logo is built from: solid blocks, dots, dash strokes that join into
 * rows, plus signs, terminal glyphs, boxed squares (an outline round a centre
 * dot), or a morph that turns each cell from a dash into a dot, a boxed
 * square and finally a solid block as it lands, every cell on its own phase
 * so bands of the build shimmer between shapes. Each shape is drawn from a
 * centre and two half-axis vectors, so the same code draws a flat block, a
 * turned one, or a block foreshortened by the cinematic camera. Shapes are
 * appended to the current path, so a whole batch of them fills at once.
 *
 * Glyphs are vector: each character of the scramble set is a few quads
 * (bars and slanted strokes), so thousands of them batch into one path, stay
 * sharp at any zoom and foreshorten with the camera. Stamping text or bitmap
 * glyphs one at a time costs several microseconds each; a quad in a shared
 * path costs a fraction of that.
 *
 * Subpaths are left open: fill closes them anyway, and closePath in a long
 * path is very slow in Chrome.
 */

import { SCRAMBLE_GLYPHS } from "./engine-constants";
import type { Paint2D } from "./engine-units";

export type LogoParticle = "blocks" | "boxed" | "dashes" | "dots" | "glyphs" | "mixed" | "plus";

export const LOGO_PARTICLES: readonly LogoParticle[] = ["blocks", "dots", "dashes", "glyphs", "plus", "boxed", "mixed"];

/** Morph stages of the mixed particle, passed in the glyph argument: dash, dot, boxed, solid. */
export const MORPH_DASH = 0;
export const MORPH_SOLID = 3;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 307, 2_654_435_761) ^ Math.imul(salt + 11, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/**
 * The mixed particle's shape for a cell at a progress (0 launched, 1
 * landed): dash, dot, boxed square, then solid once it lands. Each cell has
 * its own phase and flickers a step either way while in flight.
 */
export function morphStage(progress: number, seed: number, tick: number): number {
  if (progress >= 1) return MORPH_SOLID;
  if (!(progress > 0)) return MORPH_DASH;
  const phase = hash(seed, 11) * 0.45;
  const shimmer = (hash(seed + tick * 7, 12) - 0.5) * 0.55;
  return Math.max(0, Math.min(2, Math.floor((progress * 1.25 - phase + shimmer) * 3)));
}

/** Octagon directions, so a dot is a polygon that survives any skew. */
const OCTAGON_COS: readonly number[] = Array.from({ length: 8 }, (_, k) => Math.cos(((k + 0.5) * Math.PI) / 4));
const OCTAGON_SIN: readonly number[] = Array.from({ length: 8 }, (_, k) => Math.sin(((k + 0.5) * Math.PI) / 4));

type Quad = readonly number[];

/** Every quad wound the same way, so overlapping strokes of one glyph fill as a union. */
function wound(quad: Quad): Quad {
  let area = 0;
  for (let k = 0; k < 4; k += 1) {
    const j = (k + 1) % 4;
    area += quad[k * 2] * quad[j * 2 + 1] - quad[j * 2] * quad[k * 2 + 1];
  }
  return area >= 0 ? quad : [quad[6], quad[7], quad[4], quad[5], quad[2], quad[3], quad[0], quad[1]];
}

/** An axis-aligned bar in unit cell coordinates (-0.5..0.5 across and down). */
const bar = (u0: number, v0: number, u1: number, v1: number): Quad => wound([u0, v0, u1, v0, u1, v1, u0, v1]);

/** A slanted stroke from one point to another, `width` thick. */
const stroke = (u0: number, v0: number, u1: number, v1: number, width: number): Quad => {
  const length = Math.hypot(u1 - u0, v1 - v0) || 1;
  const nu = (-(v1 - v0) / length) * (width / 2);
  const nv = ((u1 - u0) / length) * (width / 2);
  return wound([u0 + nu, v0 + nv, u1 + nu, v1 + nv, u1 - nu, v1 - nv, u0 - nu, v0 - nv]);
};

/** The quads of every scramble glyph with strokes `T` thick. */
function glyphQuads(T: number): Readonly<Record<string, readonly Quad[]>> {
  const w = T / 0.14;
  return {
    "#": [
      bar(-0.21, -0.42, -0.21 + T, 0.42),
      bar(0.21 - T, -0.42, 0.21, 0.42),
      bar(-0.33, -0.2, 0.33, -0.2 + T),
      bar(-0.33, 0.2 - T, 0.33, 0.2),
    ],
    "*": [bar(-T / 2, -0.34, T / 2, 0.34), stroke(-0.27, -0.2, 0.27, 0.2, T), stroke(-0.27, 0.2, 0.27, -0.2, T)],
    "+": [bar(-0.32, -T / 2, 0.32, T / 2), bar(-T / 2, -0.32, T / 2, 0.32)],
    "/": [stroke(0.24, -0.42, -0.24, 0.42, 0.16 * w)],
    "0": [
      bar(-0.3, -0.42, 0.3, -0.42 + T),
      bar(-0.3, 0.42 - T, 0.3, 0.42),
      bar(-0.3, -0.42, -0.3 + T, 0.42),
      bar(0.3 - T, -0.42, 0.3, 0.42),
      stroke(-0.12, 0.2, 0.12, -0.2, 0.12 * w),
    ],
    "1": [bar(-T / 2, -0.42, T / 2, 0.42), stroke(-0.22, -0.26, 0, -0.4, T), bar(-0.24, 0.42 - T, 0.24, 0.42)],
    ":": [bar(-0.08 * w, -0.26, 0.08 * w, -0.1), bar(-0.08 * w, 0.1, 0.08 * w, 0.26)],
    "<": [stroke(0.26, -0.36, -0.26, 0, 0.15 * w), stroke(-0.26, 0, 0.26, 0.36, 0.15 * w)],
    "=": [bar(-0.3, -0.2, 0.3, -0.2 + T), bar(-0.3, 0.2 - T, 0.3, 0.2)],
    ">": [stroke(-0.26, -0.36, 0.26, 0, 0.15 * w), stroke(0.26, 0, -0.26, 0.36, 0.15 * w)],
    "^": [stroke(-0.28, 0.02, 0, -0.38, 0.15 * w), stroke(0, -0.38, 0.28, 0.02, 0.15 * w)],
    _: [bar(-0.34, 0.42 - T, 0.34, 0.42)],
  };
}

type GlyphSet = Readonly<{ data: readonly number[]; starts: readonly number[] }>;

/** Every scramble glyph's quads, 8 numbers a quad, in SCRAMBLE_GLYPHS order, and where each glyph starts. */
function glyphSet(T: number): GlyphSet {
  const quads = glyphQuads(T);
  const data: number[] = [];
  const starts: number[] = [];
  for (const glyph of SCRAMBLE_GLYPHS) {
    starts.push(data.length);
    for (const quad of quads[glyph] ?? [bar(-0.3, -0.3, 0.3, 0.3)]) {
      for (const value of quad) data.push(value);
    }
  }
  starts.push(data.length);
  return { data, starts };
}

const REGULAR_GLYPHS = glyphSet(0.14);
/** Heavier strokes for the cinematic camera, where glyphs are seen small and at angles. */
const BOLD_GLYPHS = glyphSet(0.18);

export const PARTICLE_GLYPH_COUNT = REGULAR_GLYPHS.starts.length - 1;

/** A glyph cell spans a little more than a block, as type overhangs its cell. */
const GLYPH_SCALE = 2.3;

/**
 * A shape appender bound to one context. The returned function takes the
 * centre (cx, cy), half-axis vectors (ax, ay) across and (bx, by) down, and
 * a glyph index (the character for glyphs, the morph stage for mixed).
 * `bold` thickens dashes, plus signs and glyph strokes for the cinematic
 * camera.
 */
export function particleShaper(
  context: Paint2D,
  particle: LogoParticle,
  bold = false,
): (cx: number, cy: number, ax: number, ay: number, bx: number, by: number, glyph: number) => void {
  const quad = (cx: number, cy: number, ax: number, ay: number, bx: number, by: number) => {
    context.moveTo(cx - ax - bx, cy - ay - by);
    context.lineTo(cx + ax - bx, cy + ay - by);
    context.lineTo(cx + ax + bx, cy + ay + by);
    context.lineTo(cx - ax + bx, cy - ay + by);
  };
  /** The same quad wound the other way, which cuts a hole in a filled one. */
  const hole = (cx: number, cy: number, ax: number, ay: number, bx: number, by: number) => {
    context.moveTo(cx - ax - bx, cy - ay - by);
    context.lineTo(cx - ax + bx, cy - ay + by);
    context.lineTo(cx + ax + bx, cy + ay + by);
    context.lineTo(cx + ax - bx, cy + ay - by);
  };
  const dot = (cx: number, cy: number, ax: number, ay: number, bx: number, by: number) => {
    context.moveTo(cx + ax * OCTAGON_COS[0] + bx * OCTAGON_SIN[0], cy + ay * OCTAGON_COS[0] + by * OCTAGON_SIN[0]);
    for (let k = 1; k < 8; k += 1) {
      context.lineTo(cx + ax * OCTAGON_COS[k] + bx * OCTAGON_SIN[k], cy + ay * OCTAGON_COS[k] + by * OCTAGON_SIN[k]);
    }
  };
  // Slightly wider than the block, so neighbours join into rows of dashes.
  const dashHeight = bold ? 0.5 : 0.34;
  const dash = (cx: number, cy: number, ax: number, ay: number, bx: number, by: number) =>
    quad(cx, cy, ax * 1.14, ay * 1.14, bx * dashHeight, by * dashHeight);
  const boxed = (cx: number, cy: number, ax: number, ay: number, bx: number, by: number) => {
    quad(cx, cy, ax, ay, bx, by);
    hole(cx, cy, ax * 0.62, ay * 0.62, bx * 0.62, by * 0.62);
    quad(cx, cy, ax * 0.28, ay * 0.28, bx * 0.28, by * 0.28);
  };
  const arm = bold ? 0.32 : 0.26;
  const glyphs = bold ? BOLD_GLYPHS : REGULAR_GLYPHS;
  switch (particle) {
    case "dots":
      return dot;
    case "dashes":
      return dash;
    case "boxed":
      return boxed;
    case "mixed":
      return (cx, cy, ax, ay, bx, by, stage) => {
        if (stage <= MORPH_DASH) dash(cx, cy, ax, ay, bx, by);
        else if (stage === 1) dot(cx, cy, ax * 0.8, ay * 0.8, bx * 0.8, by * 0.8);
        else if (stage === 2) boxed(cx, cy, ax, ay, bx, by);
        else quad(cx, cy, ax, ay, bx, by);
      };
    case "plus":
      return (cx, cy, ax, ay, bx, by) => {
        quad(cx, cy, ax, ay, bx * arm, by * arm);
        quad(cx, cy, ax * arm, ay * arm, bx, by);
      };
    case "glyphs":
      return (cx, cy, ax, ay, bx, by, glyph) => {
        const which = Math.abs(glyph) % PARTICLE_GLYPH_COUNT;
        const quads = glyphs.data;
        const starts = glyphs.starts;
        const px = ax * GLYPH_SCALE;
        const py = ay * GLYPH_SCALE;
        const qx = bx * GLYPH_SCALE;
        const qy = by * GLYPH_SCALE;
        for (let at = starts[which]; at < starts[which + 1]; at += 8) {
          context.moveTo(cx + quads[at] * px + quads[at + 1] * qx, cy + quads[at] * py + quads[at + 1] * qy);
          context.lineTo(cx + quads[at + 2] * px + quads[at + 3] * qx, cy + quads[at + 2] * py + quads[at + 3] * qy);
          context.lineTo(cx + quads[at + 4] * px + quads[at + 5] * qx, cy + quads[at + 4] * py + quads[at + 5] * qy);
          context.lineTo(cx + quads[at + 6] * px + quads[at + 7] * qx, cy + quads[at + 6] * py + quads[at + 7] * qy);
        }
      };
    default:
      return quad;
  }
}
