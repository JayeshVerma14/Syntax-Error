/**
 * Procedural motion.
 *
 * Every style is a pure function of wrapped loop phase, so the first and last
 * frames of a loop always match: `t = progress * cycles` with an integer cycle
 * count, and anything periodic in `t` is periodic in the timeline. A style
 * returns how one cell departs from its still state — size, rotation, offset,
 * and which glyph or mark it borrows — and the renderer applies that on top of
 * whatever the source, keyframes and glitch already decided.
 */

import type { MotionStyle } from "./engine-constants";

export type MotionSettings = Readonly<{
  /** 0..100: how far a cell departs from its still state. */
  amount: number;
  /** Whole motion cycles per timeline loop. */
  cycles: number;
  /** Travel direction in degrees, for styles that move along a line. */
  direction: number;
  /** 0..100: how widely the motion is spread across the grid. */
  stagger: number;
  style: MotionStyle;
}>;

export type MotionSample = Readonly<{
  /** Offset in cell widths. */
  dx: number;
  /** Offset in cell heights. */
  dy: number;
  /** Steps through the glyph list, for scrambling characters. */
  glyphShift: number;
  /** Steps through the mark sequence, for morphing shapes. */
  markShift: number;
  /** Added rotation in radians. */
  rotation: number;
  /** Size multiplier; with fixed-size glyphs it moves along the ramp instead. */
  scale: number;
  /** Horizontal scale for card flips; negative shows the mirrored back face. */
  squash: number;
}>;

const STILL: MotionSample = {
  dx: 0,
  dy: 0,
  glyphShift: 0,
  markShift: 0,
  rotation: 0,
  scale: 1,
  squash: 1,
};

const HIDDEN: MotionSample = { ...STILL, scale: 0 };

const TAU = Math.PI * 2;

function wrap(value: number): number {
  return value - Math.floor(value);
}

/** Shortest distance between two phases on the unit circle. */
function phaseDistance(a: number, b: number): number {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, 1 - d);
}

function bump(phase: number, centre: number, width: number): number {
  const d = phaseDistance(phase, centre) / width;
  return Math.exp(-d * d);
}

function smoothstep(value: number): number {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

/** Loop envelope: 0 at both ends of a cycle, 1 at its middle. */
function swell(t: number): number {
  return 0.5 - 0.5 * Math.cos(TAU * wrap(t));
}

/** Smooth two-dimensional value noise in 0..1, for organic cluster growth. */
function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);
  const a = noise(x0, y0, 51);
  const b = noise(x0 + 1, y0, 51);
  const c = noise(x0, y0 + 1, 51);
  const d = noise(x0 + 1, y0 + 1, 51);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Deterministic per-cell noise in 0..1; `salt` keeps channels independent. */
function noise(column: number, row: number, salt: number): number {
  let hash = Math.imul(column + 11, 374_761_393);
  hash ^= Math.imul(row + 17, 668_265_263);
  hash ^= Math.imul(salt + 23, 2_246_822_519);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_295;
}

export type MotionField = Readonly<{
  cols: number;
  /** Direction unit vector, precomputed once per frame. */
  cos: number;
  rows: number;
  sin: number;
  /** Normaliser so `along` spans 0..1 at any direction. */
  span: number;
}>;

export function createMotionField(
  motion: MotionSettings,
  cols: number,
  rows: number,
): MotionField {
  const radians = (motion.direction * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    cols,
    cos,
    rows,
    sin,
    span: Math.max(1e-6, 0.5 * (Math.abs(cos) + Math.abs(sin))),
  };
}

export function sampleMotion(
  motion: MotionSettings,
  field: MotionField,
  progress: number,
  column: number,
  row: number,
): MotionSample {
  if (motion.style === "still" || motion.amount <= 0) return STILL;

  const strength = Math.min(1, motion.amount / 100);
  const spread = Math.min(1, Math.max(0, motion.stagger / 100));
  const cycles = Math.max(1, Math.round(motion.cycles));
  const t = progress * cycles;

  const u = (column + 0.5) / field.cols;
  const v = (row + 0.5) / field.rows;
  // Position along the travel direction, 0 at the trailing edge, 1 at the lead.
  const along =
    (((u - 0.5) * field.cos + (v - 0.5) * field.sin) / field.span + 1) / 2;
  // Distance from the sheet centre, 0 at the centre, 1 at the corners.
  const radial = Math.min(1, Math.hypot(u - 0.5, v - 0.5) / Math.SQRT1_2);

  switch (motion.style) {
    case "pulse": {
      // The whole sheet breathes; stagger delays it along the direction.
      const phase = wrap(t - spread * along);
      return { ...STILL, scale: 1 + 0.6 * strength * Math.cos(TAU * phase) };
    }

    case "heartbeat": {
      // A double beat that radiates out of the centre.
      const phase = wrap(t - spread * radial * 0.5);
      const beat = bump(phase, 0.08, 0.035) + 0.65 * bump(phase, 0.24, 0.04);
      return { ...STILL, scale: 1 - 0.35 * strength + 1.1 * strength * beat };
    }

    case "wave": {
      // A transverse wave travelling along the direction; stagger shortens
      // the wavelength so more crests fit on the sheet.
      const phase = wrap(t - along * (1 + 3 * spread));
      const lift = 0.45 * strength * Math.sin(TAU * phase);
      return {
        ...STILL,
        dx: -field.sin * lift,
        dy: field.cos * lift,
        scale: 1 + 0.15 * strength * Math.cos(TAU * phase),
      };
    }

    case "ripple": {
      // Concentric rings expanding from the centre.
      const phase = wrap(t - radial * (1 + 4 * spread));
      return { ...STILL, scale: 1 + 0.7 * strength * Math.cos(TAU * phase) };
    }

    case "sweep": {
      // A soft band of light crossing the sheet along the direction.
      const width = 0.12 + 0.35 * spread;
      const intensity = bump(along, wrap(t), width);
      return { ...STILL, scale: 1 - 0.55 * strength + 1.35 * strength * intensity };
    }

    case "scan": {
      // A thin CRT scanline running top to bottom with a fading afterglow.
      const head = wrap(t);
      const line = bump(v, head, 0.018 + 0.07 * spread);
      const behind = wrap(head - v);
      const glow = behind < 0.3 ? (1 - behind / 0.3) ** 2 * 0.45 : 0;
      const intensity = Math.min(1, line + glow);
      return { ...STILL, scale: 1 - 0.7 * strength + 1.6 * strength * intensity };
    }

    case "rain": {
      // Each column carries a falling head with a fading trail. Integer
      // speeds keep every column on a whole number of passes per loop.
      const offset = noise(column, 7, 1);
      const speed = 1 + Math.floor(noise(column, 11, 2) * 3);
      const head = wrap(t * speed + offset);
      const behind = wrap(head - v);
      const trail = 0.12 + 0.55 * spread;
      const intensity = behind < trail ? 1 - behind / trail : 0;
      return {
        ...STILL,
        // Characters inside the trail keep changing, like falling code.
        glyphShift:
          intensity > 0
            ? Math.floor(wrap(t * speed * 8 + noise(column, row, 3)) * 7)
            : 0,
        scale: 1 - strength + strength * (0.1 + 1.25 * intensity),
      };
    }

    case "twinkle": {
      // Cells flash independently; stagger decides how scattered the flashes are.
      const frequency = 1 + Math.floor(noise(column, row, 5) * 2);
      const phase = wrap(t * frequency + noise(column, row, 4) * spread);
      const flash = Math.max(0, Math.cos(TAU * phase)) ** 10;
      return { ...STILL, scale: 1 - 0.75 * strength + 1.6 * strength * flash };
    }

    case "drift": {
      // An organic float: each cell bobs on its own phase.
      const a = noise(column, row, 6);
      const b = noise(column, row, 7);
      return {
        ...STILL,
        dx: 0.28 * strength * Math.sin(TAU * (2 * t + b)),
        dy: 0.4 * strength * Math.sin(TAU * (t + a * (0.2 + 0.8 * spread))),
        rotation: 0.35 * strength * Math.sin(TAU * (t + b)),
      };
    }

    case "orbit": {
      // Every mark circles its own cell centre.
      const angle = TAU * (t + noise(column, row, 8) * spread);
      const radius = 0.32 * strength;
      return {
        ...STILL,
        dx: radius * Math.cos(angle),
        dy: radius * Math.sin(angle),
      };
    }

    case "spin": {
      // Whole turns only, so a partial amount never snaps back at the loop.
      const turns = Math.max(1, Math.round(strength * 3));
      const phase = wrap(t - spread * along);
      return { ...STILL, rotation: TAU * turns * phase };
    }

    case "vortex": {
      // Rotation that lags with distance from the centre: a turning spiral.
      const turns = Math.max(1, Math.round(strength * 2));
      const phase = wrap(t - radial * (0.5 + 1.5 * spread));
      return {
        ...STILL,
        rotation: TAU * turns * phase,
        scale: 1 + 0.25 * strength * Math.sin(TAU * phase),
      };
    }

    case "morph": {
      // Marks step through a shape sequence, shrinking at each change so the
      // swap reads as a pop rather than a cut.
      const phase = wrap(t - spread * along);
      const step = phase * 4;
      const within = wrap(step);
      return {
        ...STILL,
        markShift: Math.floor(step),
        scale: 1 - strength + strength * Math.sin(Math.PI * within) ** 0.35,
      };
    }

    case "decode": {
      // Characters scramble, then lock into place in a wave along the
      // direction, with a brief flash as each one resolves.
      const phase = wrap(t - spread * along);
      const scrambles = noise(column, row, 9) < strength;
      if (phase < 0.55 && scrambles) {
        const tick = Math.floor(phase * 28);
        return {
          ...STILL,
          glyphShift: 1 + Math.floor(noise(column, row, tick + 40) * 97),
          markShift: Math.floor(noise(column, row, tick + 90) * 4),
          scale: 0.75 + 0.25 * noise(column, row, tick + 140),
        };
      }
      return { ...STILL, scale: 1 + 0.5 * strength * bump(phase, 0.58, 0.03) };
    }

    case "reveal": {
      // Build in along the direction, hold, then collapse together. The loop
      // starts and ends empty, so the seam is continuous.
      const phase = wrap(t);
      const edge = 0.08 + 0.5 * spread;
      let shown: number;
      if (phase < 0.6) {
        const local = phase / 0.6;
        shown = smoothstep((local * (1 + edge) - along) / edge);
      } else if (phase < 0.85) {
        shown = 1;
      } else {
        shown = 1 - smoothstep((phase - 0.85) / 0.15);
      }
      return { ...STILL, scale: 1 - strength + strength * shown };
    }

    case "shake": {
      // A nervous jitter that jumps between held positions; stagger decides
      // how much of the sheet takes part.
      const tick = Math.floor(wrap(t) * 14);
      const shakes = noise(column, row, 21) < 0.3 + 0.7 * spread;
      if (!shakes) return STILL;
      return {
        ...STILL,
        dx: 0.7 * strength * (noise(column, row, tick + 200) - 0.5),
        dy: 0.7 * strength * (noise(column, row, tick + 300) - 0.5),
        rotation: 0.5 * strength * (noise(column, row, tick + 400) - 0.5),
      };
    }

    case "dissolve": {
      // Cells drop out in a random order and come back; stagger pulls the
      // order from pure noise toward rings around the centre.
      const threshold = (1 - spread) * noise(column, row, 31) + spread * radial;
      return threshold < strength * swell(t) ? HIDDEN : STILL;
    }

    case "grow": {
      // Clusters seed and spread across the sheet, then recede, like cells
      // colonising a dish; every loop starts and ends empty.
      const scaleCells = 3 + 9 * (1 - spread);
      const field = valueNoise(column / scaleCells, row / scaleCells);
      const level = swell(t) * 1.12 - 0.06;
      const grown = smoothstep((level - field) / 0.07);
      return { ...STILL, scale: 1 - strength + strength * grown };
    }

    case "resolve": {
      // Pixels flicker at random, then lock into the image in a wave along
      // the direction, hold, and break up again before the loop closes.
      const phase = wrap(t);
      const lock = 0.08 + 0.45 * (spread * along + (1 - spread) * noise(column, row, 33));
      const release = 0.86 + 0.12 * noise(column, row, 34);
      if (phase >= lock && phase < release) return STILL;
      if (noise(column, row, 35) > strength) return STILL;
      const tick = Math.floor(phase * 30);
      return noise(column, row, tick + 500) < 0.5
        ? HIDDEN
        : { ...STILL, markShift: Math.floor(noise(column, row, tick + 600) * 3) };
    }

    case "flip": {
      // Each mark turns over like a card, one full turn per cycle, the turn
      // travelling along the direction and holding flat between flips.
      const phase = wrap(t - spread * along);
      if (phase > 0.35 || noise(column, row, 37) > 0.25 + 0.75 * strength) return STILL;
      return { ...STILL, squash: Math.cos(TAU * smoothstep(phase / 0.35)) };
    }

    case "scatter": {
      // Marks burst away from the centre, tumbling, and fall back into place.
      const out = Math.sin(Math.PI * wrap(t)) ** 2;
      const du = u - 0.5;
      const dv = v - 0.5;
      const length = Math.max(1e-6, Math.hypot(du, dv));
      const reach = strength * (1.5 + 6 * spread) * (0.4 + noise(column, row, 39)) * out;
      return {
        ...STILL,
        dx: (du / length) * reach,
        dy: (dv / length) * reach,
        rotation: TAU * strength * (noise(column, row, 40) - 0.5) * out,
      };
    }

    default:
      return STILL;
  }
}
