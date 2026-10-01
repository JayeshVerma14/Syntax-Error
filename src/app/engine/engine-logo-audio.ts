/**
 * How the logo reveal answers the music. A beat hits: the camera jolts, the
 * HUD brackets kick out, a thin shockwave races across the logo plane and,
 * once the mark has locked, a bright echo of it pops outward. The bass
 * lights a bed of hard matrix dots behind the mark. The highs sparkle: glints
 * twinkle round the logo's outline. A small level meter joins the HUD.
 *
 * Silence (SILENT_PULSE) draws nothing and moves nothing, so a logo drawn
 * without music is pixel-identical to one drawn with no pulse at all. Every
 * reaction is a pure function of the pulse and the time.
 */

import type { AudioPulse } from "./engine-audio-pulse";
import type { LogoArt } from "./engine-logo-art";
import type { LogoBox } from "./engine-logo-camera";
import type { Paint2D } from "./engine-units";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 307, 2_654_435_761) ^ Math.imul(salt + 11, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}


/** Whether the pulse carries any music at all. */
export function hearsMusic(pulse: AudioPulse): boolean {
  return pulse.beat > 0 || pulse.bass > 0 || pulse.mid > 0 || pulse.high > 0;
}

/** The latest beat's envelope, or 0 when there is none to answer. */
export function beatLevel(pulse: AudioPulse): number {
  return pulse.beat > 0 && Number.isFinite(pulse.beatAge) ? Math.min(1.5, pulse.beat) : 0;
}

/** One sharp kick on each beat, in a fresh direction per beat, easing straight back. */
export function beatShake(pulse: AudioPulse, cell: number): Readonly<{ x: number; y: number }> {
  const beat = beatLevel(pulse);
  if (beat <= 0) return { x: 0, y: 0 };
  const angle = hash(pulse.beatIndex, 3) * Math.PI * 2;
  const amplitude = cell * 1.1 * beat * Math.exp(-Math.max(0, pulse.beatAge) * 18);
  return { x: Math.cos(angle) * amplitude, y: Math.sin(angle) * amplitude };
}

/** How far the HUD brackets kick out on a beat, in frame units. */
export function beatKick(pulse: AudioPulse, cell: number): number {
  return beatLevel(pulse) * cell * 2.2;
}

/** Steps the bass bed's dots fall into by distance from the mark: brighter and bigger near it. */
const BED_TIERS: readonly number[] = [0.3, 0.17, 0.08];

/**
 * A bed of hard square matrix dots behind the mark that the bass lights up:
 * the louder the bass, the further out the bed reaches and the bigger its
 * dots, in three hard steps of brightness. No soft glow, so it stays in the
 * terminal look.
 */
export function drawBassBed(context: Paint2D, box: LogoBox, ink: string, pulse: AudioPulse, fade: number): void {
  const level = clamp01(pulse.bass) * fade;
  if (level <= 0.02) return;
  const span = Math.max(box.width, box.height);
  const spacing = Math.max(box.cell * 2, span / 36, 4);
  const reach = span * (0.42 + 0.3 * level);
  const steps = Math.ceil(reach / spacing);
  context.fillStyle = ink;
  for (let tier = 0; tier < BED_TIERS.length; tier += 1) {
    const inner = (reach * tier) / BED_TIERS.length;
    const outer = (reach * (tier + 1)) / BED_TIERS.length;
    const half = spacing * (0.09 + 0.1 * level) * (1 - tier * 0.22);
    context.globalAlpha = BED_TIERS[tier] * level;
    context.beginPath();
    for (let row = -steps; row <= steps; row += 1) {
      for (let column = -steps; column <= steps; column += 1) {
        const x = column * spacing;
        // Rows are squashed to the box's shape, so the bed hugs a wide mark.
        const y = row * spacing;
        const distance = Math.hypot(x, (y * box.width) / Math.max(1, box.height) / 1.6);
        if (distance < inner || distance >= outer) continue;
        context.rect(box.centreX + x - half, box.centreY + y - half, half * 2, half * 2);
      }
    }
    context.fill();
  }
}

/** The locked mark pops a bright echo of itself outward on each beat. */
export function drawBeatEcho(
  context: Paint2D,
  box: LogoBox,
  crisp: OffscreenCanvas | null,
  pulse: AudioPulse,
  fade: number,
): void {
  const beat = beatLevel(pulse);
  if (!crisp || beat <= 0.01 || fade <= 0) return;
  const spread = easeOutCubic(clamp01(pulse.beatAge / 0.5));
  // Two echoes: a close bright one and a wider faint one trailing it.
  for (let echo = 0; echo < 2; echo += 1) {
    const grow = 1 + (echo === 0 ? 0.045 : 0.11) * (0.35 + 0.65 * spread);
    const width = box.width * grow;
    const height = box.height * grow;
    context.globalAlpha = Math.min(1, beat) * fade * (echo === 0 ? 0.5 : 0.22);
    context.drawImage(crisp, box.centreX - width / 2, box.centreY - height / 2, width, height);
  }
}

/** Filled cells with an empty side, and which way that side faces: column, row, dx, dy. */
const outlines = new WeakMap<LogoArt, Int16Array>();

function outlineOf(art: LogoArt): Int16Array {
  const hit = outlines.get(art);
  if (hit) return hit;
  const filled = new Uint8Array(art.cols * art.rows);
  for (let index = 0; index < art.count; index += 1) {
    filled[art.blocks[index * 5 + 1] * art.cols + art.blocks[index * 5]] = 1;
  }
  const isFilled = (column: number, row: number) =>
    column >= 0 && row >= 0 && column < art.cols && row < art.rows && filled[row * art.cols + column] === 1;
  const edges: number[] = [];
  const sides = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  for (let index = 0; index < art.count; index += 1) {
    const column = art.blocks[index * 5];
    const row = art.blocks[index * 5 + 1];
    for (const [dx, dy] of sides) {
      if (isFilled(column + dx, row + dy)) continue;
      edges.push(column, row, dx, dy);
      break;
    }
  }
  const outline = Int16Array.from(edges);
  outlines.set(art, outline);
  return outline;
}

/** Glints that twinkle just outside the logo's outline with the highs. */
export function drawHighGlints(
  context: Paint2D,
  box: LogoBox,
  art: LogoArt,
  ink: string,
  pulse: AudioPulse,
  time: number,
  fade: number,
): void {
  const count = Math.round(clamp01(pulse.high) * 26);
  if (count <= 0 || fade <= 0) return;
  const edges = outlineOf(art);
  const total = edges.length / 4;
  if (total === 0) return;
  const tick = Math.floor(time * 24);
  const { cell } = box;
  const thin = Math.max(1, cell * 0.16);
  context.globalAlpha = fade * Math.min(1, 0.45 + pulse.high);
  context.fillStyle = ink;
  context.beginPath();
  for (let glint = 0; glint < count; glint += 1) {
    const seed = glint * 7919 + tick * 131;
    const at = Math.floor(hash(seed, 1) * total) * 4;
    const reach = cell * (0.7 + 1.4 * hash(seed, 2));
    const x = box.left + (edges[at] + 0.5) * cell + edges[at + 2] * reach;
    const y = box.top + (edges[at + 1] + 0.5) * cell + edges[at + 3] * reach;
    const size = cell * (0.5 + 1.3 * hash(seed, 3) ** 2);
    // A four-point star: a long thin bar each way.
    context.rect(x - size, y - thin / 2, size * 2, thin);
    context.rect(x - thin / 2, y - size, thin, size * 2);
  }
  context.fill();
}

/**
 * A twelve-bar level meter for the HUD, left edge at `x`, centred on `y`:
 * bass on the left, mids in the middle, highs on the right, with a little
 * per-bar flicker so it reads as a spectrum. Draws nothing in silence.
 */
export function drawLevelMeter(
  context: Paint2D,
  pulse: AudioPulse,
  x: number,
  y: number,
  size: number,
  time: number,
): void {
  if (!hearsMusic(pulse)) return;
  const bars = 12;
  const width = size * 0.34;
  const gap = size * 0.18;
  const tick = Math.floor(time * 20);
  context.beginPath();
  for (let bar = 0; bar < bars; bar += 1) {
    const band = bar < 4 ? pulse.bass : bar < 8 ? pulse.mid : pulse.high;
    const level = clamp01(band * (0.55 + 0.45 * hash(bar * 31 + tick, 7)) + beatLevel(pulse) * 0.25);
    const height = Math.max(size * 0.12, size * level);
    context.rect(x + bar * (width + gap), y + size / 2 - height, width, height);
  }
  context.fill();
}
