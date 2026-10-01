/**
 * Word wall: one word appears boxed at the centre of the frame, then copies
 * of it land all over a grid around it, each whole word at once at its own
 * random moment, until the screen is full. After a hold the wall blows apart:
 * every word is thrown out from the centre on the burst's explosive launch
 * curve, spinning and fading, and the Burst section's explosion can fire
 * under it.
 *
 * The four phases share one Duration by their relative weights, and the wall
 * runs on the sequence clock after the code roll, end text and logo or from
 * the top of the loop. Words are drawn from one cached sprite, so rotation
 * costs a texture draw rather than a re-rasterised glyph run.
 *
 * Every frame is a pure function of the sequence time.
 */

import type { BurstEvent } from "./engine-burst";
import { applyTextCase, fontStackFor } from "./engine-fonts";
import type { TypeSettings } from "./engine-settings";
import type { Paint2D } from "./engine-units";
import { readBoolean, readNumber, readString, readText } from "./engine-values";

type Values = Readonly<Record<string, unknown>>;

export const wallTargets = {
  blast: "wall.blast",
  burst: "wall.burst",
  colGap: "wall.colGap",
  cover: "wall.cover",
  duration: "wall.duration",
  entry: "wall.entry",
  enabled: "wall.enabled",
  land: "wall.land",
  force: "wall.force",
  hero: "wall.hero",
  hold: "wall.hold",
  rowGap: "wall.rowGap",
  spin: "wall.spin",
  text: "wall.text",
  timing: "wall.timing",
  type: "wall.type",
} as const;

/** How each word arrives: snaps in boxed, springs in, tears in, or just appears. */
export type WallEntry = "flash" | "glitch" | "plain" | "pop";
export const WALL_ENTRIES: readonly WallEntry[] = ["flash", "pop", "glitch", "plain"];
/** Seconds one word takes to arrive. */
const ENTRY_SECONDS = 0.22;
/** Chance per tick that a landed word flashes boxed. */
const SHIMMER = 0.006;

export type WallTiming = "after" | "start";
export const WALL_TIMINGS: readonly WallTiming[] = ["after", "start"];

export const WALL_TYPE: TypeSettings = {
  color: "#FFFFFF",
  fontId: "ibm-plex-mono",
  fontSize: 28,
  fontWeight: "500",
  letterSpacing: 0.1,
  lineHeight: 1.25,
  opacity: 100,
  textCase: "original",
};

export type WallSettings = Readonly<{
  blast: boolean;
  burst: number;
  colGap: number;
  cover: boolean;
  duration: number;
  enabled: boolean;
  entry: WallEntry;
  land: number;
  force: number;
  hero: number;
  hold: number;
  rowGap: number;
  spin: number;
  text: string;
  timing: WallTiming;
  type: TypeSettings;
}>;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function readWall(values: Values, type: TypeSettings): WallSettings {
  return {
    blast: readBoolean(values, wallTargets.blast, true),
    burst: clamp(readNumber(values, wallTargets.burst, 1.5), 0.1, 30),
    colGap: clamp(readNumber(values, wallTargets.colGap, 1.5), 0, 10),
    cover: readBoolean(values, wallTargets.cover, true),
    duration: clamp(readNumber(values, wallTargets.duration, 5), 1, 30),
    enabled: readBoolean(values, wallTargets.enabled, false),
    entry: readString(values, wallTargets.entry, WALL_ENTRIES, "flash"),
    land: clamp(readNumber(values, wallTargets.land, 30), 1, 100),
    force: clamp(readNumber(values, wallTargets.force, 60), 10, 300),
    hero: clamp(readNumber(values, wallTargets.hero, 15), 1, 100),
    hold: clamp(readNumber(values, wallTargets.hold, 25), 0, 100),
    rowGap: clamp(readNumber(values, wallTargets.rowGap, 0.25), 0, 4),
    spin: clamp(readNumber(values, wallTargets.spin, 40), 0, 100),
    text: readText(values, wallTargets.text, "Transparent"),
    timing: readString(values, wallTargets.timing, WALL_TIMINGS, "after"),
    type,
  };
}

/** Phase boundaries in sequence seconds. */
export type WallSchedule = Readonly<{
  burstStart: number;
  end: number;
  fillEnd: number;
  heroEnd: number;
  start: number;
}>;

/** The wall's place on the sequence clock, or null while it is off. */
export function wallSchedule(wall: WallSettings, after: number): WallSchedule | null {
  if (!wall.enabled || wall.text.trim().length === 0) return null;
  const start = wall.timing === "start" ? 0 : Math.max(0, Number.isFinite(after) ? after : 0);
  // Burst time is seconds taken from the end of Duration; the rest is
  // shared by the hero, landing and hold by their relative weights.
  const burst = Math.min(wall.burst, wall.duration * 0.9);
  const weights = Math.max(1e-6, wall.hero + wall.land + wall.hold);
  const unit = (wall.duration - burst) / weights;
  const heroEnd = start + wall.hero * unit;
  const fillEnd = heroEnd + wall.land * unit;
  const burstStart = fillEnd + wall.hold * unit;
  return { burstStart, end: start + wall.duration, fillEnd, heroEnd, start };
}

/**
 * Whether the wall hides the sheet at this sequence time. With Sheet blast on
 * the sheet returns as the wall blows apart, so the explosion has a grid to
 * fire on and the picture is revealed behind the flying words.
 */
export function wallCovers(wall: WallSettings, plan: WallSchedule | null, time: number): boolean {
  if (!wall.cover || plan === null || time < plan.start) return false;
  return time < (wall.blast ? plan.burstStart : plan.end);
}

/** The Burst section's explosion, fired as the wall blows apart. */
export function wallBurstEvent(
  wall: WallSettings,
  plan: WallSchedule | null,
  time: number,
): BurstEvent | null {
  if (!wall.blast || !plan || time < plan.burstStart || time >= plan.end) return null;
  const age = (time - plan.burstStart) / Math.max(1e-6, plan.end - plan.burstStart);
  return { age, seed: 7 };
}

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 97, 2_654_435_761) ^ Math.imul(salt + 13, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** The burst's explosive launch: most of the distance in the first instants. */
function launch(age: number): number {
  return (1 - 2 ** (-5 * age)) / (1 - 2 ** -5);
}

type Sprite = Readonly<{
  canvas: OffscreenCanvas;
  height: number;
  key: string;
  plain: Readonly<{ x: number; width: number }>;
  boxed: Readonly<{ x: number; width: number }>;
}>;

let cached: Sprite | null = null;

/** One sprite holding the plain word and the boxed, cut-out word side by side. */
function wordSprite(text: string, type: TypeSettings): Sprite | null {
  const size = Math.max(4, type.fontSize);
  const font = `${type.fontWeight} ${size}px ${fontStackFor(type)}`;
  const spacing = `${(type.letterSpacing * size).toFixed(2)}px`;
  // Whether the face has loaded is part of the key, so the sprite redraws once it lands.
  const loaded = typeof document !== "undefined" && document.fonts ? document.fonts.check(font) : true;
  const key = [text, font, spacing, type.color, loaded].join("|");
  if (cached?.key === key) return cached;
  if (typeof OffscreenCanvas === "undefined") return null;
  const probe = new OffscreenCanvas(1, 1).getContext("2d");
  if (!probe) return null;
  probe.font = font;
  probe.letterSpacing = spacing;
  const textWidth = Math.ceil(probe.measureText(text).width);
  const pad = Math.ceil(size * 0.22);
  const height = Math.ceil(size * 1.3);
  const cell = textWidth + pad * 2;
  const canvas = new OffscreenCanvas(cell * 2 + 2, height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = font;
  context.letterSpacing = spacing;
  context.textBaseline = "middle";
  context.fillStyle = type.color;
  context.fillText(text, pad, height / 2);
  // The highlight: a solid box in the text colour with the word cut out.
  const boxX = cell + 2;
  context.fillRect(boxX, 0, cell, height);
  context.globalCompositeOperation = "destination-out";
  context.fillText(text, boxX + pad, height / 2);
  context.globalCompositeOperation = "source-over";
  cached = { boxed: { width: cell, x: boxX }, canvas, height, key, plain: { width: cell, x: 0 } };
  return cached;
}

type Frame = Readonly<{ height: number; width: number }>;

export function drawWall(
  context: Paint2D,
  frame: Frame,
  wall: WallSettings,
  plan: WallSchedule | null,
  time: number,
): void {
  if (!plan || time < plan.start || time >= plan.end) return;
  if (!(frame.width > 0 && frame.height > 0)) return;
  const text = applyTextCase(wall.text.split("\n")[0].trim(), wall.type.textCase);
  if (text.length === 0) return;
  const sprite = wordSprite(text, wall.type);
  if (!sprite) return;

  const size = Math.max(4, wall.type.fontSize);
  const stepX = sprite.plain.width + wall.colGap * size;
  const stepY = sprite.height * Math.max(0.6, wall.type.lineHeight / 1.25) + wall.rowGap * size;
  // Odd counts keep a cell on the exact centre; one spare ring covers the edges.
  const halfCols = Math.ceil(frame.width / 2 / stepX) + 1;
  const halfRows = Math.ceil(frame.height / 2 / stepY) + 1;
  const centreX = frame.width / 2;
  const centreY = frame.height / 2;
  const reach = Math.hypot(frame.width, frame.height) * (wall.force / 100);
  const bursting = time >= plan.burstStart;
  const age = bursting ? (time - plan.burstStart) / Math.max(1e-6, plan.end - plan.burstStart) : 0;
  const travel = launch(age);
  const fade = age < 0.55 ? 1 : Math.max(0, 1 - (age - 0.55) / 0.45);
  const fillSpan = Math.max(1e-6, plan.fillEnd - plan.heroEnd);

  context.save();
  context.globalAlpha = wall.type.opacity / 100;
  const baseAlpha = context.globalAlpha;
  for (let row = -halfRows; row <= halfRows; row += 1) {
    for (let column = -halfCols; column <= halfCols; column += 1) {
      const hero = row === 0 && column === 0;
      const seed = (row + 512) * 1031 + (column + 512);
      // Each word lands whole at its own random moment through the fill,
      // loosely rippling out from the centre so the screen fills with a pulse.
      const ring = Math.min(1, Math.hypot(column / halfCols, row / halfRows) / Math.SQRT2);
      const lands = hero
        ? plan.start
        : plan.heroEnd + (hash(seed, 1) * 0.7 + ring * 0.3) * fillSpan * 0.92;
      if (time < lands) continue;
      let x = centreX + column * stepX;
      let y = centreY + row * stepY;
      let angle = 0;
      let scale = 1;
      let boxed = hero;
      let flicker = 1;
      if (!bursting && wall.entry !== "plain") {
        const entry = Math.min(1, (time - lands) / ENTRY_SECONDS);
        const tick = Math.floor(time * 24);
        if (entry < 1) {
          const rest = 1 - entry;
          if (wall.entry === "flash") {
            // Lands as a selected box that snaps back to plain text.
            if (entry < 0.45) boxed = true;
            scale = 1 + 0.3 * rest * rest;
          } else if (wall.entry === "pop") {
            // Springs in from large with a small overshoot.
            const back = 1 + 2.7 * (entry - 1) ** 3 + 1.7 * (entry - 1) ** 2;
            scale = 0.2 + 0.8 * back + 0.9 * rest * rest;
            flicker = Math.min(1, entry * 3);
          } else {
            // Glitch: tears in sideways, stutters and flashes inverted.
            x += (hash(seed, tick + 40) - 0.5) * stepX * 0.5 * rest;
            if (hash(seed, tick + 80) < 0.35 * rest) flicker = 0;
            boxed = boxed || hash(seed, tick + 120) < 0.4 * rest;
          }
        } else if (!hero && hash(seed, tick + 200) < SHIMMER) {
          // Landed words keep catching the light until the burst.
          boxed = true;
        }
      }
      if (flicker === 0) continue;
      if (!bursting) context.globalAlpha = baseAlpha * flicker;
      if (bursting) {
        const dx = x - centreX;
        const dy = y - centreY;
        const distance = Math.hypot(dx, dy);
        const heading =
          distance > 1 ? Math.atan2(dy, dx) + (hash(seed, 2) - 0.5) * 0.5 : hash(seed, 3) * Math.PI * 2;
        // Words near the centre are hit hardest, as in a blast.
        const push = reach * travel * (0.45 + hash(seed, 4) * 0.8) * (1.2 - Math.min(1, distance / reach) * 0.5);
        x += Math.cos(heading) * push;
        y += Math.sin(heading) * push;
        angle = (hash(seed, 5) - 0.5) * 2 * Math.PI * (wall.spin / 100) * 2 * travel;
        context.globalAlpha = baseAlpha * fade;
      }
      const part = boxed ? sprite.boxed : sprite.plain;
      if (angle === 0 && scale === 1) {
        context.drawImage(
          sprite.canvas, part.x, 0, part.width, sprite.height,
          x - part.width / 2, y - sprite.height / 2, part.width, sprite.height,
        );
        continue;
      }
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.scale(scale, scale);
      context.drawImage(
        sprite.canvas, part.x, 0, part.width, sprite.height,
        -part.width / 2, -sprite.height / 2, part.width, sprite.height,
      );
      context.restore();
    }
  }
  context.restore();
}
