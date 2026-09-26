/**
 * The swirl: streams of binary and arrow characters orbiting a centre on
 * spiral arms, each character turned to face along its path, like the vortex
 * of digits circling the coin in the reference film.
 *
 * Every particle makes a whole number of turns per loop, so the stream closes
 * on itself and the loop has no seam.
 */

import { MAX_SWIRL_PARTICLES } from "./engine-constants";
import type { SwirlSettings } from "./engine-settings";

export type SwirlParticle = Readonly<{
  angle: number;
  glyph: string;
  x: number;
  y: number;
}>;

const TAU = Math.PI * 2;
const STREAM_GLYPHS = ["0", "1", "0", "1", "<", ">", "v"] as const;
const ARMS = 3;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 97, 2_654_435_761) ^ Math.imul(salt + 53, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

export function collectSwirl(
  swirl: SwirlSettings,
  width: number,
  height: number,
  progress: number,
): SwirlParticle[] {
  if (!swirl.enabled) return [];
  const count = Math.max(0, Math.min(MAX_SWIRL_PARTICLES, Math.round(swirl.count)));
  const turns = Math.max(1, Math.round(swirl.turns));
  const centerX = ((swirl.center.x + 1) / 2) * width;
  const centerY = ((swirl.center.y + 1) / 2) * height;
  const radius = (Math.min(width, height) * swirl.radius) / 100;
  const band = Math.min(1, Math.max(0, swirl.band / 100));

  const particles: SwirlParticle[] = [];
  for (let index = 0; index < count; index += 1) {
    const lane = 1 - band / 2 + band * hash(index, 1);
    const arm = Math.floor(hash(index, 2) * ARMS);
    // Outer lanes trail their arm, which winds the streams into a spiral.
    const start = (TAU * arm) / ARMS + lane * 2.4 + (hash(index, 3) - 0.5) * 0.7;
    // Whole turns per loop: most particles one lap per turn, a few two.
    const laps = turns * (hash(index, 4) < 0.3 ? 2 : 1);
    const angle = start + TAU * laps * progress;
    const breathe = 1 + 0.07 * Math.sin(TAU * (turns * progress + hash(index, 5)));
    const distance = radius * lane * breathe;
    particles.push({
      angle: angle + Math.PI / 2,
      glyph: STREAM_GLYPHS[Math.floor(hash(index, 6) * STREAM_GLYPHS.length)],
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
    });
  }
  return particles;
}
