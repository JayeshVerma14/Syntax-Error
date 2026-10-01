/**
 * The dot-matrix logo build, after an LED dot-matrix mark: the whole logo
 * starts as one point at its centre that flares and bursts, its dots race
 * out to their cells in a ring wave, then twinkle in travelling waves of
 * size and brightness while each part in turn wipes out and back in over a
 * dim bed of matrix dots. To close, the dots swell into square pixels from
 * the centre outward, ready to resolve into the crisp logo.
 *
 * With music, every dot swells on the beat, the bass lifts the dim matrix
 * bed and the matrix behind the mark, and the highs set more dots sparkling.
 */

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import type { LogoArt } from "./engine-logo-art";
import { beatLevel, drawBassBed } from "./engine-logo-audio";
import type { LogoBox } from "./engine-logo-camera";
import { logoPartsFor } from "./engine-logo-parts";
import type { Paint2D } from "./engine-units";

export type DotMatrixSettings = Readonly<{ ink: string; parts: number; tint: boolean }>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 307, 2_654_435_761) ^ Math.imul(salt + 11, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** Brightness tiers each dot falls into; one path per tier. */
const TIERS: readonly number[] = [1, 0.62, 0.3];
/** When each part wipes out and back in, as a share of the build. */
const SWEEP_FIRST = 0.4;
const SWEEP_LAST = 0.78;
const SWEEP_SPAN = 0.17;

/** The seed: one point that flares, throws two rings and bursts. */
function drawSeed(context: Paint2D, box: LogoBox, u: number, fade: number): void {
  if (u >= 0.24) return;
  const grow = easeOutBack(clamp01(u / 0.1));
  const burst = smoothstep(0.1, 0.2, u);
  const radius = box.cell * (0.2 + 1.3 * grow) * (1 - burst);
  context.globalAlpha = fade;
  if (radius > 0.3) {
    context.beginPath();
    context.arc(box.centreX, box.centreY, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.lineWidth = Math.max(1, box.cell * 0.18);
  for (let ring = 0; ring < 2; ring += 1) {
    const life = clamp01((u - 0.06 - ring * 0.05) / 0.16);
    if (life <= 0 || life >= 1) continue;
    context.globalAlpha = fade * (1 - life) ** 1.5;
    context.beginPath();
    context.arc(box.centreX, box.centreY, box.cell * (1.5 + life * 9), 0, Math.PI * 2);
    context.stroke();
  }
}

export function drawDotMatrixLogo(
  context: Paint2D,
  box: LogoBox,
  logo: DotMatrixSettings,
  art: LogoArt,
  build: number,
  time: number,
  fade: number,
  pulse: AudioPulse = SILENT_PULSE,
): void {
  const u = clamp01(build);
  const swell = 1 + 0.45 * beatLevel(pulse);
  const sparkleAt = 0.985 - 0.09 * clamp01(pulse.high);
  const bedLift = 1 + 1.4 * clamp01(pulse.bass);
  const parts = logoPartsFor(art, logo.parts);
  const { cell } = box;
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const tick = Math.floor(time * 16);
  const radiusFull = cell * 0.46;
  const bedRadius = cell * 0.1;
  context.save();
  drawBassBed(context, box, logo.ink, pulse, fade * smoothstep(0.1, 0.3, u));
  context.fillStyle = logo.ink;
  context.strokeStyle = logo.ink;
  drawSeed(context, box, u, fade);

  // Tier buffers of x, y, radius; squares for dots that have locked into pixels.
  const tierDots: number[][] = TIERS.map(() => []);
  const squares: number[] = [];
  const flush = (color: string) => {
    context.fillStyle = color;
    tierDots.forEach((dots, tier) => {
      if (dots.length === 0) return;
      context.globalAlpha = fade * TIERS[tier];
      context.beginPath();
      for (let at = 0; at < dots.length; at += 3) {
        context.moveTo(dots[at] + dots[at + 2], dots[at + 1]);
        context.arc(dots[at], dots[at + 1], dots[at + 2], 0, Math.PI * 2);
      }
      context.fill();
      dots.length = 0;
    });
    if (squares.length > 0) {
      context.globalAlpha = fade;
      context.beginPath();
      for (let at = 0; at < squares.length; at += 3) {
        context.rect(squares[at] - squares[at + 2], squares[at + 1] - squares[at + 2], squares[at + 2] * 2, squares[at + 2] * 2);
      }
      context.fill();
      squares.length = 0;
    }
  };

  const sweepOf = (rank: number) =>
    SWEEP_FIRST + (SWEEP_LAST - SWEEP_FIRST) * (parts.count > 1 ? rank / (parts.count - 1) : 0.5);

  for (let part = 0; part < parts.count; part += 1) {
    const rank = parts.rankOf[part];
    const sweep = (u - sweepOf(rank) + SWEEP_SPAN / 2) / SWEEP_SPAN;
    const sweeping = sweep > 0 && sweep < 1;
    const across = rank % 2 === 0;
    const [minCol, minRow, maxCol, maxRow] = parts.bounds.subarray(part * 4, part * 4 + 4);
    if (sweeping) {
      // A dim bed of matrix dots marks the part's screen area while it wipes.
      const bedSize = bedRadius * (0.6 + Math.sin(Math.PI * sweep));
      context.fillStyle = logo.ink;
      context.globalAlpha = Math.min(1, fade * 0.3 * bedLift);
      context.beginPath();
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minCol; column <= maxCol; column += 1) {
          const x = box.left + (column + 0.5) * cell;
          const y = box.top + (row + 0.5) * cell;
          context.moveTo(x + bedSize, y);
          context.arc(x, y, bedSize, 0, Math.PI * 2);
        }
      }
      context.fill();
    }
    for (let run = parts.partRuns[part]; run < parts.partRuns[part + 1]; run += 1) {
      for (let cursor = parts.runs[run * 3]; cursor < parts.runs[run * 3 + 1]; cursor += 1) {
        const block = parts.order[cursor];
        const column = art.blocks[block * 5];
        const row = art.blocks[block * 5 + 1];
        const tx = box.left + (column + 0.5) * cell;
        const ty = box.top + (row + 0.5) * cell;
        const dx = tx - box.centreX;
        const dy = ty - box.centreY;
        const reach = Math.min(1, Math.hypot(dx / halfW, dy / halfH) / Math.SQRT2);
        const launch = 0.12 + 0.3 * reach + 0.05 * hash(block, 1);
        const flight = clamp01((u - launch) / 0.2);
        if (flight <= 0) continue;
        if (sweeping) {
          // The wipe: a band crossing the part switches its dots off, then on.
          const span = across ? maxCol - minCol + 1 : maxRow - minRow + 1;
          const v = ((across ? column - minCol : row - minRow) + 0.5) / span;
          if (v < sweep * 2 && v > sweep * 2 - 1) continue;
        }
        const eased = easeOutExpo(flight);
        const x = box.centreX + dx * eased;
        const y = box.centreY + dy * eased;
        const close = smoothstep(0.82 + 0.1 * reach, 0.9 + 0.1 * reach, u);
        if (close >= 0.5) {
          squares.push(x, y, cell * (0.36 + 0.08 * (close - 0.5) * 2));
          continue;
        }
        // Travelling diagonal waves of size, with rare sparkles.
        const wave = 0.5 + 0.5 * Math.sin(column * 0.55 + row * 0.35 - time * 9);
        const sparkle = hash(block, tick) > sparkleAt;
        const travel = 0.35 + 0.65 * eased;
        const settle = smoothstep(0.78, 0.9, u);
        const size = sparkle ? 1.15 : 0.42 + 0.58 * (wave * (1 - settle) + settle);
        const radius = radiusFull * travel * (size + (1 - size) * close * 2) * swell;
        const tier = sparkle || close > 0 || wave > 0.62 ? 0 : wave > 0.3 ? 1 : 2;
        tierDots[tier].push(x, y, radius);
      }
      flush(logo.tint ? logo.ink : parts.palette[parts.runs[run * 3 + 2]] ?? logo.ink);
    }
  }
  context.restore();
}
