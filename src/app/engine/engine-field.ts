/**
 * Motion for the idle field, as in the reference films where the quiet
 * marks around a subject never sit still: they boil as characters are
 * re-picked, march sideways a cell at a time, fall in columns, light up as a
 * denser band sweeps through, morph from one particle to the next, twinkle
 * as a pulse of light crosses a dot matrix, or come and go in patches like a
 * targeting grid.
 *
 * The field moves while the clearance around the subject stays where the
 * subject is, so the marks stream behind it. Speed is in real seconds, and
 * every style still closes the timeline loop without a jump: Shimmer and
 * Wave round to a whole number of cycles per loop, and Drift and Rain use two
 * copies of the field that each restart while unseen (see `travel`).
 */

import { backdropGlyph, backdropShown } from "./engine-glyphs";

export type FieldMotion =
  | "drift"
  | "morph"
  | "patches"
  | "rain"
  | "shimmer"
  | "still"
  | "twinkle"
  | "wave";

export const FIELD_MOTIONS: readonly FieldMotion[] = [
  "still",
  "shimmer",
  "drift",
  "rain",
  "wave",
  "morph",
  "twinkle",
  "patches",
];

/**
 * A field cell as drawn this frame: its character, a size factor, and the
 * Morph step it shows (-1 when the cell keeps its own particle).
 */
export type FieldPick = { glyph: string; scale: number; stage: number };

/** Characters the field moves through, faintest first. */
const FIELD_LADDER: readonly string[] = [".", "-", ">", "+", "#"];
/** Half-width of the Wave band, as a share of its sweep. */
const WAVE_HALF_WIDTH = 0.07;
/** Rough length of one Drift or Rain hand-over cycle, in seconds. */
const TRAVEL_CYCLE_SECONDS = 3;

/*
 * What Speed (1..100 %) means for each style. At 1 % the field is barely
 * alive; at the default 20 % it moves like the reference films.
 */
/** Drift and Rain, in cells per second. */
const travelRate = (speed: number) => 0.3 + speed * 0.15;
/** Shimmer, in character changes per cell per second. */
const shimmerRate = (speed: number) => 0.03 + speed * 0.02;
/** Wave, in passes per second. */
const waveRate = (speed: number) => speed * 0.006;
/** Morph, in full particle cycles per second. */
const morphRate = (speed: number) => 0.05 + speed * 0.012;
/** Twinkle, in pulses per second. */
const twinkleRate = (speed: number) => 0.05 + speed * 0.012;
/** Patches, in patch changes per second. */
const patchRate = (speed: number) => 0.1 + speed * 0.02;

/** Particles Morph steps through before it repeats. */
export const MORPH_STAGES = 4;
/** A patch is this many cells wide and tall. */
const PATCH_COLUMNS = 6;
const PATCH_ROWS = 4;

function hash(column: number, row: number, salt: number): number {
  let h = Math.imul(column + 1, 374_761_393) ^ Math.imul(row + 1, 668_265_263);
  h = Math.imul(h ^ Math.imul(salt + 3, 2_246_822_519), 1_274_126_177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_295;
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function ladderStep(glyph: string, steps: number): string {
  const index = FIELD_LADDER.indexOf(glyph);
  if (index < 0) return glyph;
  return FIELD_LADDER[Math.min(FIELD_LADDER.length - 1, index + steps)];
}

type Travel = Readonly<{
  /** Whole-cell offsets of the two copies. */
  offsetA: number;
  offsetB: number;
  /** Share of cells showing copy A; 0 whenever A restarts, 1 when B does. */
  weightA: number;
}>;

/**
 * Seamless travel at any speed. A field moving a fraction of its own width
 * per loop cannot close the loop by itself, so two copies move half a cycle
 * apart. Each restarts at the moment no cell shows it, and cells hand over
 * between the copies on their own thresholds, so the restarts never show and
 * the motion reads as one steady drift. The cycle divides the loop exactly.
 */
function travel(loop: number, loopSeconds: number, cellsPerSecond: number): Travel {
  const cycles = Math.max(1, Math.round(loopSeconds / TRAVEL_CYCLE_SECONDS));
  const cycleSeconds = loopSeconds / cycles;
  const phase = wrap(loop * cycles, 1);
  const span = cellsPerSecond * cycleSeconds;
  return {
    offsetA: Math.floor(phase * span),
    offsetB: Math.floor(wrap(phase + 0.5, 1) * span),
    weightA: 1 - Math.abs(2 * phase - 1),
  };
}

/**
 * Returns what the field shows in a cell at this loop position, or null for
 * an empty cell. `speed` is 1..100 and `loopSeconds` the timeline length. The
 * returned pick is reused between calls, so read it before the next cell.
 */
export function createFieldSampler(
  motion: FieldMotion,
  speed: number,
  loopSeconds: number,
  cols: number,
  rows: number,
  density: number,
  progress: number,
): (column: number, row: number) => FieldPick | null {
  const pick: FieldPick = { glyph: "", scale: 1, stage: -1 };
  const loop = wrap(progress, 1);
  const pace = Math.min(100, Math.max(1, speed));
  const seconds = loopSeconds > 0 ? loopSeconds : 4;

  const at = (column: number, row: number): FieldPick | null => {
    if (!backdropShown(column, row, density)) return null;
    pick.glyph = backdropGlyph(column, row);
    pick.scale = 1;
    pick.stage = -1;
    return pick;
  };

  switch (motion) {
    case "drift": {
      // The pattern marches right, one whole cell at a time.
      const move = travel(loop, seconds, travelRate(pace));
      return (column, row) => {
        const offset = hash(column, row, 71) < move.weightA ? move.offsetA : move.offsetB;
        return at(wrap(column - offset, cols), row);
      };
    }
    case "rain": {
      // Columns fall at one of two speeds, so the field shears as it falls.
      const slow = travel(loop, seconds, travelRate(pace));
      const fast = travel(loop, seconds, travelRate(pace) * 1.7);
      return (column, row) => {
        const move = hash(column, 0, 5) < 0.5 ? slow : fast;
        const offset = hash(column, row, 73) < move.weightA ? move.offsetA : move.offsetB;
        return at(column, wrap(row - offset, rows));
      };
    }
    case "shimmer": {
      // Each cell re-picks its character on its own beat, and a few blink.
      const ticks = Math.max(1, Math.round(shimmerRate(pace) * seconds));
      return (column, row) => {
        const tick = Math.floor(wrap(loop * ticks + hash(column, row, 31) * ticks, ticks));
        const shown = backdropShown(column, row, density);
        if (shown && hash(column, row, tick + 80) < 0.08) return null;
        if (!shown && !(hash(column, row, tick + 90) < 0.04 * density)) return null;
        pick.scale = 1;
        pick.stage = -1;
        pick.glyph =
          hash(column, row, tick + 40) < 0.35
            ? FIELD_LADDER[Math.floor(hash(column, row, tick + 60) * 3)]
            : backdropGlyph(column, row);
        return pick;
      };
    }
    case "wave": {
      // A band of denser, fuller marks sweeps across on a slight diagonal.
      const passes = Math.max(1, Math.round(waveRate(pace) * seconds));
      const front = loop * passes;
      return (column, row) => {
        const position = (0.8 * column) / Math.max(1, cols) + (0.2 * row) / Math.max(1, rows);
        const distance = Math.abs(wrap(position - front + 0.5, 1) - 0.5);
        const lift = Math.max(0, 1 - distance / WAVE_HALF_WIDTH);
        const base = at(column, row);
        if (lift <= 0) return base;
        if (!base) {
          if (lift < 0.35) return null;
          pick.glyph = ".";
        }
        pick.glyph = ladderStep(pick.glyph, Math.round(lift * 2));
        pick.scale = 1 + 0.8 * lift;
        return pick;
      };
    }
    case "morph": {
      // Cells flip to the next particle as a front crosses the field, with
      // a little per-cell lag so the change ripples rather than cuts.
      const cycles = Math.max(1, Math.round(morphRate(pace) * seconds));
      return (column, row) => {
        const base = at(column, row);
        if (!base) return null;
        const phase = loop * cycles + (0.2 * column) / Math.max(1, cols) + 0.05 * hash(column, row, 41);
        base.stage = Math.floor(wrap(phase, 1) * MORPH_STAGES) % MORPH_STAGES;
        return base;
      };
    }
    case "twinkle": {
      // A pulse of light crosses the matrix on a diagonal; lit cells swell.
      const pulses = Math.max(1, Math.round(twinkleRate(pace) * seconds));
      return (column, row) => {
        const base = at(column, row);
        if (!base) return null;
        const along = (0.6 * column) / Math.max(1, cols) + (0.4 * row) / Math.max(1, rows);
        const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (loop * pulses - along - 0.15 * hash(column, row, 43)));
        base.scale = 0.35 + 1.3 * wave ** 6;
        return base;
      };
    }
    case "patches": {
      // Blocks of the field switch on and off; a block shrinks in and out.
      const epochs = Math.max(2, Math.round(patchRate(pace) * seconds));
      const now = loop * epochs;
      const epoch = Math.floor(now);
      const blend = smoothstep(0.7, 1, now - epoch);
      return (column, row) => {
        const px = Math.floor(column / PATCH_COLUMNS);
        const py = Math.floor(row / PATCH_ROWS);
        const on = hash(px, py, 50 + (epoch % epochs)) < 0.45 ? 1 : 0;
        const next = hash(px, py, 50 + ((epoch + 1) % epochs)) < 0.45 ? 1 : 0;
        const level = on + (next - on) * blend;
        if (level < 0.05) return null;
        const base = at(column, row);
        if (!base) return null;
        base.scale = level;
        return base;
      };
    }
    default:
      return at;
  }
}
