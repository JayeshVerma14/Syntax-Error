/**
 * How the code breaks apart. Each style decides two things: the order in
 * which characters leave their lines, and the path a character takes once it
 * has left. Both are pure functions of the character and its age, so every
 * frame is reproducible for scrubbing and export.
 *
 * Positions are in units of the shorter frame side, with the frame centre at
 * (`cu`, `cv`); velocities are per second.
 */

import { SCRAMBLE_GLYPHS } from "./engine-constants";
import type { CodeBreakStyle } from "./engine-settings";

export type BreakingCharacter = Readonly<{
  kickX: number;
  kickY: number;
  /** Smooth 0..1 field over the page, so neighbours leave together. */
  patch: number;
  /** Horizontal position across the frame, 0..1. */
  px: number;
  /** Line position down the text, 0..1. */
  py: number;
  /** Uniform 0..1 per character. */
  rand: number;
  seed: number;
  /** Tumble in radians per second. */
  spin: number;
}>;

export type BreakPose = {
  alpha: number;
  angle: number;
  /** A replacement character, for styles that scramble what they carry. */
  glyph: string | null;
  scale: number;
  u: number;
  v: number;
};

export type BreakFrame = Readonly<{ cu: number; cv: number }>;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 97, 2_654_435_761) ^ Math.imul(salt + 13, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** Distance from the frame centre as a 0..1 share of the half diagonal. */
function centreDistance(character: BreakingCharacter): number {
  return Math.min(1, Math.hypot(character.px - 0.5, character.py - 0.5) / 0.7071);
}

/** When, as a 0..1 share of the release window, a character leaves its line. */
export function breakOrder(style: CodeBreakStyle, character: BreakingCharacter): number {
  const { patch, px, py, rand } = character;
  switch (style) {
    case "burst":
      // A shock wave: the centre goes first and the edge last.
      return 0.8 * centreDistance(character) + 0.2 * rand;
    case "vortex":
      // The rim is drawn in first, so the text drains into the middle.
      return 0.8 * (1 - centreDistance(character)) + 0.2 * rand;
    case "fall":
      // The bottom lines give way first, and the rest collapse onto them.
      return 0.75 * (1 - py) + 0.25 * rand;
    case "wind":
      // A gust sweeps the page from left to right.
      return 0.75 * px + 0.25 * rand;
    case "glitch":
      return rand;
    default:
      return 0.7 * patch + 0.3 * rand;
  }
}

/** Three travelling waves whose curl is the swirl's divergence-free flow. */
const WAVES = [
  { amplitude: 0.07, cx: Math.cos(0.35), k: 5.2, omega: 0.9, phase: 0.3, sy: Math.sin(0.35) },
  { amplitude: 0.04, cx: Math.cos(2.1), k: 8.3, omega: -1.3, phase: 1.7, sy: Math.sin(2.1) },
  { amplitude: 0.09, cx: Math.cos(4), k: 3.6, omega: 0.6, phase: 4.1, sy: Math.sin(4) },
] as const;
const SWIRL_STEPS = 12;
const KICK_DECAY = 3;

/**
 * Writes the pose of a character `age` seconds after it left home (`u0`,
 * `v0`), `life` seconds before it is gone. `release` is the sequence second it
 * left, which keeps the swirl's travelling waves continuous in time.
 */
export function poseBroken(
  style: CodeBreakStyle,
  pose: BreakPose,
  character: BreakingCharacter,
  frame: BreakFrame,
  u0: number,
  v0: number,
  age: number,
  life: number,
  release: number,
): void {
  const h2 = hash(character.seed, 21);
  const h3 = hash(character.seed, 22);
  const h4 = hash(character.seed, 23);
  const share = life > 0 ? age / life : 1;
  pose.alpha = 1;
  pose.angle = character.spin * age;
  pose.glyph = null;
  pose.scale = 1;

  switch (style) {
    case "burst": {
      const dx = u0 - frame.cu;
      const dy = v0 - frame.cv;
      const distance = Math.hypot(dx, dy);
      const heading =
        (distance > 1e-4 ? Math.atan2(dy, dx) : h2 * Math.PI * 2) + (h3 - 0.5) * 0.6;
      // Nearer the centre flies faster, and drag settles every fragment
      // within the frame rather than flinging it straight off the edge.
      const speed = (0.3 + 0.55 * h4) * (1 + 0.6 * (1 - Math.min(1, distance / 0.7)));
      const travel = (speed * (1 - Math.exp(-1.4 * age))) / 1.4;
      pose.u = u0 + Math.cos(heading) * travel;
      pose.v = v0 + Math.sin(heading) * travel + 0.12 * age * age;
      pose.angle = character.spin * 2 * age;
      pose.scale = 1 + 0.25 * age;
      return;
    }
    case "vortex": {
      const dx = u0 - frame.cu;
      const dy = v0 - frame.cv;
      const start = Math.max(0.02, Math.hypot(dx, dy));
      const radius = start * Math.exp(-(1.2 + h2) * age);
      const pulled = 1 - radius / start;
      const theta = Math.atan2(dy, dx) + (2.2 + 2 * h3) * age * (1 + 1.5 * pulled);
      pose.u = frame.cu + radius * Math.cos(theta);
      pose.v = frame.cv + radius * Math.sin(theta);
      pose.angle = theta - Math.atan2(dy, dx);
      pose.scale = 0.25 + 0.75 * (1 - pulled);
      return;
    }
    case "fall": {
      pose.u = u0 + (h2 - 0.5) * 0.3 * age;
      pose.v = v0 - (0.05 + 0.3 * h3) * age + 1.2 * age * age;
      pose.angle = character.spin * 1.5 * age;
      return;
    }
    case "wind": {
      pose.u = u0 + (0.15 + 0.2 * h3) * age + 0.5 * (0.9 + 0.8 * h2) * age * age;
      const phase = h4 * Math.PI * 2;
      // The flutter starts from zero, so a character leaves without a hop.
      pose.v = v0 - 0.06 * age + 0.03 * (Math.sin(7 * age + phase) - Math.sin(phase));
      pose.angle = character.spin * 0.6 * age;
      return;
    }
    case "glitch": {
      // Characters stay put but jump in blocks, swap for noise and flicker out.
      const tick = Math.floor(age * 20);
      pose.u = u0 + (hash(character.seed, tick * 3 + 11) - 0.5) * 0.06;
      pose.v = v0 + (hash(character.seed, tick + 5) < 0.15 ? (h2 < 0.5 ? -0.02 : 0.02) : 0);
      pose.angle = 0;
      pose.glyph =
        SCRAMBLE_GLYPHS[Math.floor(hash(character.seed, tick + 17) * SCRAMBLE_GLYPHS.length)] ??
        null;
      pose.alpha = hash(character.seed, tick + 29) < 0.35 + 0.5 * share ? 0 : 1;
      return;
    }
    default: {
      let u = u0;
      let v = v0;
      const step = age / SWIRL_STEPS;
      for (let index = 0; index < SWIRL_STEPS; index += 1) {
        const tau = release + step * (index + 0.5);
        let vx = 0.06;
        let vy = -0.03;
        for (const wave of WAVES) {
          const flow =
            wave.amplitude *
            wave.k *
            Math.cos(wave.k * (u * wave.cx + v * wave.sy) + wave.phase + wave.omega * tau);
          vx += flow * wave.sy;
          vy -= flow * wave.cx;
        }
        u += vx * step;
        v += vy * step;
      }
      const kick = (1 - Math.exp(-KICK_DECAY * age)) / KICK_DECAY;
      pose.u = u + character.kickX * kick;
      pose.v = v + character.kickY * kick;
    }
  }
}
