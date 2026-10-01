/**
 * Data text items: each label, bullet, wordmark and boxed tag as its reveal,
 * hold and exit have it at one moment.
 *
 * A decoding label shows noise of the same kind as each character until it
 * locks; typed text runs a block caret; a flickering label stutters on. A
 * wordmark's newest letters build up from horizontal fragments. A boxed tag's
 * four target squares slide in white and lock red, its box opens from the
 * middle, then its text decodes in the box's own ink. On the way out, text
 * decodes away from its end (a wordmark sheds its fragments instead), or
 * backspaces into a square that blinks twice; the target squares fly off in
 * the ink colour.
 *
 * With music, a beat drops a fresh few held labels back into noise that
 * relocks as the beat decays, pops the bullets, and kicks a boxed tag's
 * target squares out, white for the first frame or two of a hit, before they
 * lock back on; the mids let those squares breathe.
 *
 * Steady lines draw as one fillText each; only characters mid-reveal are
 * drawn one by one, so a held frame costs a handful of calls.
 */

import type { DataExit, DataReveal, DataTextSettings } from "./engine-datatext";
import {
  beatScramble,
  bulletPop,
  glyphScrambled,
  targetKick,
  targetsUnlocked,
  type DataMusic,
} from "./engine-datatext-audio";
import type { DataLayout, LaidItem } from "./engine-datatext-layout";
import type { DataTiling } from "./engine-datatext-marks";
import {
  BACKSPACE_SECONDS,
  BOX_CLOSE_SECONDS,
  BOX_OPEN_DELAY,
  BOX_OPEN_SECONDS,
  BOX_TEXT_DELAY,
  BULLET_LEAD,
  CARET_TAIL,
  clamp01,
  dataHash,
  decodeInGlyph,
  decodeOutGlyph,
  boxCloseStart,
  easeInCubic,
  easeOutCubic,
  easeOutExpo,
  FLICKER_SECONDS,
  LINE_LAG,
  SCRAMBLE_RATE,
  scrambleGlyph,
  TARGET_LOCK_SECONDS,
  typeStep,
  type DataPlan,
  type ItemTiming,
} from "./engine-datatext-timing";
import { drawFragments, drawLines, drawPrefix, drawShed } from "./engine-datatext-word";
import type { Paint2D } from "./engine-units";

const FLASH = "#FFFFFF";
const FLASH_SECONDS = 0.06;
const DARK_INK = "#0B0E14";
const LIGHT_INK = "#FFFFFF";

type TextKind = "backspace" | "flicker" | "fragments" | "in" | "out" | "shed" | "steady" | "type";

type Env = Readonly<{
  alpha: number;
  box: string;
  boxInk: string;
  exit: DataExit;
  ink: string;
  /** The music, or null when silent. */
  music: DataMusic | null;
  reveal: DataReveal;
  tick: number;
  time: number;
}>;

/** One copy of an item in the repeated block. */
type Copy = Readonly<{
  /** Vertical offset of this copy. */
  dy: number;
  /** Share of held characters a beat shows as noise; 0 without one. */
  scramble: number;
  seed: number;
}>;

/** Dark text on a light box, light text on a dark one. */
function inkOnBox(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(value)) return DARK_INK;
  const luma = 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
  return luma > 140 ? DARK_INK : LIGHT_INK;
}

/** Visible while a leaving square blinks twice; white on its first frames. */
function blinkOn(age: number): boolean {
  return age < 0.26 || (age >= 0.31 && age < 0.36);
}

function textKind(item: LaidItem, timing: ItemTiming, env: Env): TextKind {
  if (env.time >= timing.exit) {
    if (env.exit === "bullet") return "backspace";
    return item.style === "wordmark" ? "shed" : "out";
  }
  if (env.time >= timing.shown) return "steady";
  if (env.reveal === "flicker") return "flicker";
  if (env.reveal === "type") return "type";
  return item.style === "wordmark" ? "fragments" : "in";
}

/**
 * Draws one item's text in its current state. The context is already set to
 * the item's face; a stretched wordmark is drawn inside its own transform.
 */
function drawText(context: Paint2D, item: LaidItem, kind: TextKind, age: number, copy: Copy, env: Env): void {
  const leaving = kind === "out" || kind === "backspace" || kind === "shed";
  if (item.lines.length === 0 || (kind !== "steady" && !leaving && age < 0)) return;
  const stretched = item.stretch !== 1;
  if (stretched) {
    context.save();
    context.translate(item.x, 0);
    context.scale(item.stretch, 1);
  }
  const ox = stretched ? 0 : item.x;
  const baseline = item.y + copy.dy + item.cap / 2;
  const seed = copy.seed;
  if (kind === "steady" && copy.scramble > 0) drawShaken(context, item, ox, baseline, copy, env);
  else if (kind === "steady") drawLines(context, item, ox, baseline);
  else if (kind === "flicker") drawFlicker(context, item, ox, baseline, age, seed, env);
  else if (kind === "type") drawTyped(context, item, ox, baseline, age);
  else if (kind === "backspace") drawBackspaced(context, item, ox, baseline, age);
  else if (kind === "fragments") drawFragments(context, item, ox, baseline, age, seed, env.tick);
  else if (kind === "shed") drawShed(context, item, ox, baseline, age, seed, env.tick);
  else drawDecoding(context, item, ox, baseline, age, seed, env.tick, kind === "in");
  if (stretched) context.restore();
}

/** Held text a beat has shaken: a scatter of its characters shows noise of the same kind. */
function drawShaken(context: Paint2D, item: LaidItem, ox: number, baseline: number, copy: Copy, env: Env): void {
  const beatIndex = env.music ? env.music.beatIndex : 0;
  item.lines.forEach((line, index) => {
    const lineSeed = copy.seed + index * 7;
    const y = baseline + index * item.lineStep;
    line.glyphs.forEach((glyph, k) => {
      if (glyph === " ") return;
      const noisy = glyphScrambled(k, lineSeed, copy.scramble, beatIndex);
      context.fillText(noisy ? scrambleGlyph(glyph, k * 31 + lineSeed, env.tick) : glyph, ox + line.offsets[k], y);
    });
  });
}

function drawFlicker(context: Paint2D, item: LaidItem, ox: number, baseline: number, age: number, seed: number, env: Env): void {
  const tick = Math.floor(env.time * 30);
  if (dataHash(tick, seed) > 0.15 + 0.85 * (age / FLICKER_SECONDS)) return;
  // Some of the on frames only half light, like a failing tube.
  context.globalAlpha = env.alpha * (dataHash(tick, seed + 1) < 0.4 ? 0.4 : 1);
  drawLines(context, item, ox + (dataHash(tick, seed + 2) < 0.2 ? item.size * 0.12 : 0), baseline);
  context.globalAlpha = env.alpha;
}

function drawDecoding(
  context: Paint2D,
  item: LaidItem,
  ox: number,
  baseline: number,
  age: number,
  seed: number,
  tick: number,
  arriving: boolean,
): void {
  item.lines.forEach((line, index) => {
    const lineSeed = seed + index * 7;
    const lineAge = arriving ? age - index * LINE_LAG : age;
    const y = baseline + index * item.lineStep;
    const count = line.glyphs.length;
    line.glyphs.forEach((glyph, k) => {
      if (glyph === " ") return;
      const shown = arriving
        ? decodeInGlyph(glyph, k, count, lineAge, lineSeed, tick)
        : decodeOutGlyph(glyph, k, count, lineAge, lineSeed, tick);
      if (shown.length > 0) context.fillText(shown, ox + line.offsets[k], y);
    });
  });
}

function drawTyped(context: Paint2D, item: LaidItem, ox: number, baseline: number, age: number): void {
  const total = item.lines.reduce((sum, line) => sum + line.glyphs.length, 0);
  let remaining = Math.floor(age / Math.max(1e-4, typeStep(total)));
  let caretX = Number.NaN;
  let caretY = baseline;
  item.lines.forEach((line, index) => {
    const count = Math.max(0, Math.min(line.glyphs.length, remaining));
    const y = baseline + index * item.lineStep;
    drawPrefix(context, line, count, ox, y);
    // The caret sits on the first line still typing, or ends the last one.
    const last = index === item.lines.length - 1;
    if (Number.isNaN(caretX) && (count < line.glyphs.length || last)) {
      caretX = ox + (count < line.glyphs.length ? line.offsets[count] : line.width);
      caretY = y;
    }
    remaining -= line.glyphs.length;
  });
  // The block caret leads the typing and stays a moment once it is done.
  if (!Number.isNaN(caretX) && age < total * typeStep(total) + CARET_TAIL) {
    context.fillRect(caretX + item.size * 0.04, caretY - item.cap * 1.15, item.advance * 0.9, item.cap * 1.35);
  }
}

function drawBackspaced(context: Paint2D, item: LaidItem, ox: number, baseline: number, age: number): void {
  const left = 1 - clamp01(age / BACKSPACE_SECONDS);
  item.lines.forEach((line, index) => {
    drawPrefix(context, line, Math.ceil(line.glyphs.length * left), ox, baseline + index * item.lineStep);
  });
}

/** A square that stands in for the text on its way out, and blinks twice. */
function drawExitSquare(context: Paint2D, x: number, y: number, side: number, age: number, env: Env): void {
  if (!blinkOn(age)) return;
  context.fillStyle = age < FLASH_SECONDS ? FLASH : env.ink;
  context.fillRect(x - side / 2, y - side / 2, side, side);
  context.fillStyle = env.ink;
}

function paintLabel(context: Paint2D, item: LaidItem, timing: ItemTiming, copy: Copy, env: Env): void {
  const kind = textKind(item, timing, env);
  const lead = item.bullet ? BULLET_LEAD : 0;
  const age = kind === "out" || kind === "backspace" || kind === "shed" ? env.time - timing.exit : env.time - timing.start - lead;
  const dy = copy.dy;
  drawText(context, item, kind, age, copy, env);
  const square = item.bullet ?? { side: Math.max(3, item.cap * (item.stretch !== 1 ? 1.1 : 1)), x: item.x + item.cap / 2, y: item.y };
  if (kind === "backspace") {
    drawExitSquare(context, square.x, square.y + dy, square.side, env.time - timing.exit, env);
  } else if (item.bullet) {
    const pop = env.time - timing.start;
    // A beat pops the square about its centre.
    const side = env.music ? square.side * bulletPop(env.music) : square.side;
    context.fillStyle = pop < FLASH_SECONDS ? FLASH : env.ink;
    context.fillRect(square.x - side / 2, square.y + dy - side / 2, side, side);
    context.fillStyle = env.ink;
  }
}

/** A target square, solid or, for the checker one, dithered in a 4 by 4. */
function drawTarget(context: Paint2D, x: number, y: number, side: number, checker: boolean): void {
  if (!checker) {
    context.fillRect(x - side / 2, y - side / 2, side, side);
    return;
  }
  const cell = side / 4;
  context.beginPath();
  for (let row = 0; row < 4; row += 1) {
    for (let column = (row % 2); column < 4; column += 2) {
      context.rect(x - side / 2 + column * cell, y - side / 2 + row * cell, cell, cell);
    }
  }
  context.fill();
}

function drawTargets(context: Paint2D, item: LaidItem, timing: ItemTiming, dy: number, env: Env): void {
  const box = item.box;
  if (!box) return;
  const age = env.time - timing.start;
  const leaving = env.time >= timing.exit ? env.time - timing.exit : -1;
  const exitLength = Math.max(1e-3, timing.end - timing.exit);
  if (leaving >= 0 && (env.exit === "bullet" ? leaving >= 0.1 : leaving >= exitLength * 0.65)) return;
  // Squares slide in from wide and lock on; on the way out they fly off.
  let spread = leaving >= 0
    ? 1 + 0.9 * easeInCubic(clamp01(leaving / exitLength))
    : 1 + 0.9 * (1 - easeOutExpo(clamp01(age / TARGET_LOCK_SECONDS)));
  const locked = leaving >= 0 || age >= TARGET_LOCK_SECONDS;
  // Arriving squares are white-hot until they lock; leaving ones fly off in ink.
  let white = !locked;
  if (env.music) {
    // A beat kicks them out; a hit shows them white for a frame or two.
    spread += targetKick(env.music);
    white = white || (leaving < 0 && targetsUnlocked(env.music));
  }
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2 + dy;
  context.fillStyle = white ? FLASH : env.ink;
  box.targets.forEach(([tx, ty], index) => {
    const checker = !white && leaving < 0 && index === 3 && Math.floor(env.time * 4) % 2 === 1;
    drawTarget(context, cx + (tx - cx) * spread, cy + (ty + dy - cy) * spread, box.square, checker);
  });
  context.fillStyle = env.ink;
}

/** The box's drawn size now: opening from the middle, closing like a tube. */
function boxShape(item: LaidItem, timing: ItemTiming, env: Env): readonly [number, number] {
  const box = item.box;
  if (!box) return [0, 0];
  const open = easeOutExpo(clamp01((env.time - timing.start - BOX_OPEN_DELAY) / BOX_OPEN_SECONDS));
  if (env.time < timing.exit) return [box.width * open, box.height];
  const leaving = env.time - timing.exit;
  if (env.exit === "bullet") {
    const side = box.height * 0.8;
    const s = easeOutCubic(clamp01(leaving / BACKSPACE_SECONDS));
    return blinkOn(leaving) ? [box.width + (side - box.width) * s, box.height + (side - box.height) * s] : [0, 0];
  }
  const q = clamp01((leaving - boxCloseStart(item.lines.map((line) => line.text))) / BOX_CLOSE_SECONDS);
  if (q < 0.5) return [box.width, box.height * (1 - 0.94 * easeOutCubic(q / 0.5))];
  return [box.width * (1 - easeInCubic((q - 0.5) / 0.5)), box.height * 0.06];
}

function paintBoxed(context: Paint2D, item: LaidItem, timing: ItemTiming, copy: Copy, env: Env): void {
  const box = item.box;
  if (!box) return;
  const dy = copy.dy;
  drawTargets(context, item, timing, dy, env);
  const [width, height] = boxShape(item, timing, env);
  if (width > 0.5 && height > 0.25) {
    const leaving = env.time >= timing.exit ? env.time - timing.exit : -1;
    context.fillStyle = env.exit === "bullet" && leaving >= 0 && leaving < FLASH_SECONDS ? FLASH : env.box;
    if (env.exit === "bullet" && leaving >= BACKSPACE_SECONDS) context.fillStyle = env.ink;
    context.fillRect(box.left + (box.width - width) / 2, box.top + dy + (box.height - height) / 2, width, height);
  }
  // A tag snapping into a bullet drops its text at once.
  if (env.exit === "bullet" && env.time >= timing.exit) {
    context.fillStyle = env.ink;
    return;
  }
  const kind = textKind(item, timing, env);
  const age = kind === "out" ? env.time - timing.exit : env.time - timing.start - BOX_TEXT_DELAY;
  context.fillStyle = env.boxInk;
  drawText(context, item, kind, age, copy, env);
  context.fillStyle = env.ink;
}

/**
 * Whether to draw a copy of an item: the one the user placed always, a
 * repeated one only when it fits the band whole, so the edges of the stack
 * show whole rows rather than sliced letters.
 */
function inBand(item: LaidItem, dy: number, band: DataTiling["band"]): boolean {
  return !band || dy === 0 || (item.bounds.top + dy >= band[0] && item.bounds.bottom + dy <= band[1]);
}

/** Draws every item, in list order, for each copy of the block. `music` is null when silent. */
export function paintDataItems(
  context: Paint2D,
  layout: DataLayout,
  plan: DataPlan,
  settings: DataTextSettings,
  time: number,
  tiling: DataTiling,
  music: DataMusic | null = null,
): void {
  const env: Env = {
    alpha: context.globalAlpha,
    box: settings.box,
    boxInk: inkOnBox(settings.box),
    exit: settings.exit,
    ink: settings.type.color,
    music,
    reveal: settings.reveal,
    tick: Math.floor(time * SCRAMBLE_RATE),
    time,
  };
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = env.ink;
  let font = "";
  let spacing = "";
  layout.items.forEach((item, index) => {
    const timing = plan.items[index];
    if (!timing || time < timing.start || time >= timing.end || item.lines.length === 0) return;
    if (item.font !== font) {
      font = item.font;
      context.font = font;
    }
    if (item.letterSpacing !== spacing) {
      spacing = item.letterSpacing;
      context.letterSpacing = spacing;
    }
    const seed = index * 101 + 7;
    tiling.tiles.forEach(({ dy, key }) => {
      if (!inBand(item, dy, tiling.band)) return;
      // Each copy of the block is shaken on its own, so repeats do not flicker in step.
      const copy: Copy = { dy, scramble: beatScramble(music, index * 32 + key, item.style), seed };
      if (item.style === "boxed") paintBoxed(context, item, timing, copy, env);
      else paintLabel(context, item, timing, copy, env);
    });
  });
}
