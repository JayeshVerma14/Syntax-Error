/**
 * Data text letters drawn in runs: a line's first few glyphs as one fillText
 * per run (a whole label line, or each word of a wordmark, which sets its
 * spaces narrow), and a wordmark's letters assembling out of horizontal
 * fragments on the way in and shedding them on the way out.
 *
 * On the way in, letters land in order, each building up from a few of five
 * horizontal bands and jittering sideways until it settles, with a solid chip
 * flying ahead of the newest letter. On the way out the same happens in
 * reverse from the wordmark's end, so a display word never turns into a
 * big scrambled word.
 */

import type { DataLine, LaidItem } from "./engine-datatext-layout";
import { dataHash, FRAGMENT_OUT_SECONDS, FRAGMENT_SECONDS, wordOutStep, wordStep } from "./engine-datatext-timing";
import type { Paint2D } from "./engine-units";

/** A line's first `count` glyphs, one fillText per run. */
export function drawPrefix(context: Paint2D, line: DataLine, count: number, x: number, y: number): void {
  for (const run of line.runs) {
    if (run.from >= count) return;
    const shown = count - run.from;
    const text = shown >= run.count ? run.text : line.glyphs.slice(run.from, count).join("");
    context.fillText(text, x + run.x, y);
  }
}

/** Every line whole. */
export function drawLines(context: Paint2D, item: LaidItem, ox: number, baseline: number): void {
  item.lines.forEach((line, index) => {
    drawPrefix(context, line, line.glyphs.length, ox, baseline + index * item.lineStep);
  });
}

const glyphTotal = (item: LaidItem) => item.lines.reduce((sum, line) => sum + line.glyphs.length, 0);

/** One letter, part built: `share` 0 is a few bands far off, 1 is whole. */
function drawFragment(
  context: Paint2D,
  item: LaidItem,
  glyph: string,
  x: number,
  baseline: number,
  share: number,
  seed: number,
  tick: number,
): void {
  const top = baseline - item.cap * 1.08;
  const band = (item.cap * 1.2) / 5;
  const width = item.advance * 1.3;
  const shift = (dataHash(seed, tick + 1) - 0.5) * item.size * 0.3 * (1 - share);
  context.save();
  context.beginPath();
  let any = false;
  for (let b = 0; b < 5; b += 1) {
    if (dataHash(seed + b, tick) < 0.2 + 0.8 * share) {
      context.rect(x - item.advance * 0.15, top + b * band, width, band + 0.5);
      any = true;
    }
  }
  if (any) {
    context.clip();
    context.fillText(glyph, x + shift, baseline);
  }
  context.restore();
  if (share < 0.5) {
    // A chip of the letter flies ahead of it.
    const chipX = x + item.advance * (0.9 + 0.8 * dataHash(seed, tick + 2));
    const chipY = top + band * Math.floor(dataHash(seed, tick + 3) * 5);
    context.fillRect(chipX, chipY, item.advance * 0.3, band);
  }
}

/** A wordmark typing on, letter by letter out of fragments. */
export function drawFragments(context: Paint2D, item: LaidItem, ox: number, baseline: number, age: number, seed: number, tick: number): void {
  const step = wordStep(glyphTotal(item));
  // Letters that have finished assembling, counted across all lines.
  const done = age >= FRAGMENT_SECONDS ? Math.floor((age - FRAGMENT_SECONDS) / Math.max(1e-4, step)) + 1 : 0;
  let before = 0;
  item.lines.forEach((line, index) => {
    const y = baseline + index * item.lineStep;
    const settled = Math.max(0, Math.min(line.glyphs.length, done - before));
    drawPrefix(context, line, settled, ox, y);
    for (let k = settled; k < line.glyphs.length; k += 1) {
      const share = (age - (before + k) * step) / FRAGMENT_SECONDS;
      if (share < 0) break;
      if (share < 1 && line.glyphs[k] !== " ") {
        drawFragment(context, item, line.glyphs[k], ox + line.offsets[k], y, share, (before + k) * 5 + seed, tick);
      }
    }
    before += line.glyphs.length;
  });
}

/** A wordmark leaving from its end, each letter shedding its fragments in turn. */
export function drawShed(context: Paint2D, item: LaidItem, ox: number, baseline: number, age: number, seed: number, tick: number): void {
  const total = glyphTotal(item);
  const step = wordOutStep(total);
  // Letters still whole, counted from the start across all lines.
  const whole = age < 0 ? total : Math.max(0, total - (Math.floor(age / Math.max(1e-4, step)) + 1));
  let before = 0;
  item.lines.forEach((line, index) => {
    const y = baseline + index * item.lineStep;
    drawPrefix(context, line, Math.max(0, Math.min(line.glyphs.length, whole - before)), ox, y);
    for (let k = Math.max(0, whole - before); k < line.glyphs.length; k += 1) {
      const share = (age - (total - 1 - before - k) * step) / FRAGMENT_OUT_SECONDS;
      if (share >= 0 && share < 1 && line.glyphs[k] !== " ") {
        drawFragment(context, item, line.glyphs[k], ox + line.offsets[k], y, 1 - share, (before + k) * 5 + seed + 3, tick);
      }
    }
    before += line.glyphs.length;
  });
}
