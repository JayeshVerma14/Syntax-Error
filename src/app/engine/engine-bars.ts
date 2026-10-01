/**
 * Text bars: short labels set in a solid box with the letters cut out, as in
 * the reference films' `>>Faster>>` and `**Secure` tags. Each bar is its own
 * item with its own entrance and departure, and gets a slot of the loop: it
 * comes in, holds, then leaves.
 *
 * Entrances: slide in from a side, fire in like a bullet with a chevron
 * trail, assemble from box fragments, decode while the box grows, or glitch
 * in. Departures: fire out like a bullet, slide back, spin away, flip over,
 * shatter, switch off like a tube, decode out, or glitch out.
 *
 * Bars take turns, one per slot, and the slots divide the loop exactly, so
 * every loop closes on an empty frame.
 */

import { SCRAMBLE_GLYPHS } from "./engine-constants";
import { applyTextCase, fontStackFor } from "./engine-fonts";
import type { TypeSettings, VectorPoint } from "./engine-settings";
import type { Paint2D } from "./engine-units";
import { readBoolean, readNumber, readString, readVector, type Values } from "./engine-values";

export const barTargets = {
  enabled: "bars.enabled",
  hold: "bars.hold",
  items: "bars.items",
  position: "bars.position",
  scatter: "bars.scatter",
  style: "bars.style",
  time: "bars.time",
  type: "bars.type",
} as const;

export const BAR_ENTER_OPTIONS = [
  { label: "From left", value: "left" },
  { label: "From right", value: "right" },
  { label: "Bullet from left", value: "bulletLeft" },
  { label: "Bullet from right", value: "bulletRight" },
  { label: "Assemble", value: "assemble" },
  { label: "Decode", value: "decode" },
  { label: "Glitch in", value: "glitch" },
] as const;

export const BAR_EXIT_OPTIONS = [
  { label: "Bullet right", value: "bulletRight" },
  { label: "Bullet left", value: "bulletLeft" },
  { label: "Slide back", value: "slide" },
  { label: "Spin away", value: "spin" },
  { label: "Flip", value: "flip" },
  { label: "Shatter", value: "shatter" },
  { label: "Switch off", value: "collapse" },
  { label: "Decode out", value: "decode" },
  { label: "Glitch out", value: "glitch" },
] as const;

export type BarEnter = (typeof BAR_ENTER_OPTIONS)[number]["value"];
export type BarExit = (typeof BAR_EXIT_OPTIONS)[number]["value"];
export type BarStyle = "box" | "capsule" | "outline" | "text";

const ENTERS: readonly BarEnter[] = BAR_ENTER_OPTIONS.map((option) => option.value);
const EXITS: readonly BarExit[] = BAR_EXIT_OPTIONS.map((option) => option.value);

export type BarItem = Readonly<{ enter: BarEnter; exit: BarExit; text: string }>;

export type BarSettings = Readonly<{
  enabled: boolean;
  /** 10..90: share of a bar's slot it holds still. */
  hold: number;
  items: readonly BarItem[];
  position: VectorPoint;
  /** 0..100: how far each bar strays from Position. */
  scatter: number;
  style: BarStyle;
  /** Seconds per bar. */
  time: number;
  type: TypeSettings;
}>;

export const DEFAULT_BAR_ITEMS: readonly BarItem[] = [
  { enter: "bulletLeft", exit: "bulletRight", text: ">>Faster>>" },
  { enter: "assemble", exit: "shatter", text: "**Secure" },
  { enter: "right", exit: "decode", text: "--Direct--" },
  { enter: "decode", exit: "bulletLeft", text: "<<System online..." },
];

function readItems(values: Values): readonly BarItem[] {
  const value = values[barTargets.items];
  if (!Array.isArray(value)) return DEFAULT_BAR_ITEMS;
  const items: BarItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text : "";
    const enter = ENTERS.includes(record.enter as BarEnter) ? (record.enter as BarEnter) : "left";
    const exit = EXITS.includes(record.exit as BarExit) ? (record.exit as BarExit) : "bulletRight";
    items.push({ enter, exit, text });
  }
  return items;
}

export function readBars(values: Values, type: TypeSettings): BarSettings {
  return {
    enabled: readBoolean(values, barTargets.enabled, false),
    hold: Math.min(90, Math.max(10, readNumber(values, barTargets.hold, 55))),
    items: readItems(values),
    position: readVector(values, barTargets.position, { x: 0, y: 0.72 }),
    scatter: Math.min(100, Math.max(0, readNumber(values, barTargets.scatter, 30))),
    style: readString(values, barTargets.style, ["box", "capsule", "outline", "text"], "box"),
    time: Math.min(20, Math.max(0.5, readNumber(values, barTargets.time, 1.8))),
    type,
  };
}

/** The bars that have something to show, with their text set in the chosen case. */
export function barLines(bars: BarSettings): readonly BarItem[] {
  return bars.items
    .map((item) => ({ ...item, text: applyTextCase(item.text, bars.type.textCase).replace(/\s+/g, " ").trim() }))
    .filter((item) => item.text.length > 0);
}

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 211, 2_654_435_761) ^ Math.imul(salt + 5, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const easeInCubic = (t: number) => t * t * t;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Text with its not-yet-resolved characters swapped for noise. */
function decoding(text: string, share: number, tick: number): string {
  return Array.from(text, (glyph, index) => {
    if (glyph.trim().length === 0) return glyph;
    const lock = (index + 1) / (text.length + 1);
    if (share >= lock) return glyph;
    return SCRAMBLE_GLYPHS[Math.floor(hash(index, tick) * SCRAMBLE_GLYPHS.length)];
  }).join("");
}

type Pose = {
  alpha: number;
  angle: number;
  /** Which edge holds still while the box narrows: -1 left, 0 centre. */
  anchor: number;
  /** Chevron trail behind a bullet: its strength and the travel direction. */
  bullet: number;
  direction: number;
  /** Faint copies behind a sliding bar, towards this side. */
  ghost: number;
  /** 0..1: how hard the box tears into slices. */
  glitch: number;
  /** Characters shown, when they differ from the bar's text. */
  label: string;
  scaleX: number;
  scaleY: number;
  /** Share of the box's width shown. */
  width: number;
  x: number;
  y: number;
};

type Fragments = { drop: number; spread: number };

/** Where a bar holds, how big its box is, and which side it enters from. */
type Layout = Readonly<{
  boxHeight: number;
  boxWidth: number;
  frameWidth: number;
  homeX: number;
  homeY: number;
  size: number;
}>;

/**
 * A bullet leaves in two beats: a short pull back, then an accelerating zip
 * off the frame that stretches the box and draws a chevron trail behind it.
 */
function bulletOut(pose: Pose, layout: Layout, direction: number, q: number): void {
  pose.direction = direction;
  if (q < 0.18) {
    const pull = Math.sin((q / 0.18) * Math.PI * 0.5);
    pose.x = layout.homeX - direction * layout.boxWidth * 0.06 * pull;
    pose.scaleX = 1 - 0.06 * pull;
    pose.scaleY = 1 + 0.05 * pull;
    return;
  }
  const u = (q - 0.18) / 0.82;
  const speed = Math.min(1, 1.15 * u ** 0.9);
  const reach =
    (direction > 0 ? layout.frameWidth - layout.homeX : layout.homeX) +
    layout.boxWidth * 1.6 +
    layout.size * 10;
  pose.x = layout.homeX - direction * layout.boxWidth * 0.06 + direction * reach * u ** 2.2;
  pose.scaleX = 1 + 1.4 * speed;
  pose.scaleY = 1 - 0.32 * speed;
  pose.bullet = speed;
}

/** The same move in reverse: fired in, it overshoots and recoils into place. */
function bulletIn(pose: Pose, layout: Layout, direction: number, p: number): void {
  pose.direction = direction;
  const reach =
    (direction > 0 ? layout.homeX : layout.frameWidth - layout.homeX) +
    layout.boxWidth * 1.6 +
    layout.size * 10;
  if (p < 0.72) {
    const u = p / 0.72;
    const eased = easeOutExpo(u);
    pose.x = layout.homeX - direction * reach * (1 - eased) + direction * layout.boxWidth * 0.05 * eased;
    const speed = Math.min(1, (1 - eased) * 1.6);
    pose.scaleX = 1 + 1.4 * speed;
    pose.scaleY = 1 - 0.32 * speed;
    pose.bullet = speed;
    return;
  }
  // Recoil: settle back from the overshoot with a small squash.
  const settle = (p - 0.72) / 0.28;
  const overshoot = Math.cos(settle * Math.PI * 0.5);
  pose.x = layout.homeX + direction * layout.boxWidth * 0.05 * overshoot;
  pose.scaleX = 1 - 0.05 * Math.sin(settle * Math.PI);
  pose.scaleY = 1 + 0.05 * Math.sin(settle * Math.PI);
}

function enterPose(
  pose: Pose,
  layout: Layout,
  enter: BarEnter,
  fromLeft: boolean,
  p: number,
  text: string,
  tick: number,
): Fragments | null {
  const side = fromLeft ? -1 : 1;
  switch (enter) {
    case "assemble":
      // Blocks fly together into the box, then the label decodes inside it.
      if (p < 0.7) return { drop: 0, spread: 1 - easeOutCubic(p / 0.7) };
      pose.label = decoding(text, (p - 0.7) / 0.3, tick);
      return null;
    case "decode":
      pose.width = easeOutCubic(p);
      pose.label = decoding(text, p, tick);
      return null;
    case "glitch":
      pose.glitch = 1 - easeOutCubic(p);
      pose.alpha = p < 0.15 ? (hash(tick, 3) < 0.5 ? 0.3 : 0.9) : 1;
      pose.label = decoding(text, 0.3 + p, tick);
      return null;
    case "bulletLeft":
      bulletIn(pose, layout, 1, p);
      return null;
    case "bulletRight":
      bulletIn(pose, layout, -1, p);
      return null;
    default: {
      const offscreenX = fromLeft
        ? -layout.boxWidth / 2 - layout.size
        : layout.frameWidth + layout.boxWidth / 2 + layout.size;
      const eased = easeOutExpo(p);
      pose.x = offscreenX + (layout.homeX - offscreenX) * eased;
      pose.ghost = (1 - eased) * side;
      return null;
    }
  }
}

function exitPose(
  pose: Pose,
  layout: Layout,
  exit: BarExit,
  fromLeft: boolean,
  q: number,
  text: string,
  tick: number,
): Fragments | null {
  const side = fromLeft ? -1 : 1;
  switch (exit) {
    case "bulletRight":
      bulletOut(pose, layout, 1, q);
      return null;
    case "bulletLeft":
      bulletOut(pose, layout, -1, q);
      return null;
    case "spin": {
      // A quarter turn as it drops away, so the label never reads upside down.
      const eased = easeInCubic(q);
      pose.angle = -side * eased * Math.PI * 0.5;
      pose.y = layout.homeY + eased * layout.boxHeight * 4;
      pose.x = layout.homeX - side * eased * layout.boxWidth * 0.3;
      pose.scaleX = pose.scaleY = 1 - 0.45 * eased;
      pose.alpha = 1 - clamp01((q - 0.45) / 0.55);
      return null;
    }
    case "flip":
      // Flips over its horizontal axis; the back of the card is blank.
      pose.scaleY = Math.cos(easeInCubic(q) * Math.PI * 0.5);
      if (pose.scaleY < 0.35) pose.label = "";
      return null;
    case "slide": {
      const offscreenX = fromLeft
        ? -layout.boxWidth / 2 - layout.size
        : layout.frameWidth + layout.boxWidth / 2 + layout.size;
      const eased = easeInCubic(q);
      pose.x = layout.homeX + (offscreenX - layout.homeX) * eased;
      pose.ghost = eased * -side;
      return null;
    }
    case "shatter":
      // The label scrambles, then the box breaks into falling blocks.
      if (q < 0.15) {
        pose.label = decoding(text, 1 - q / 0.15, tick);
        return null;
      }
      return { drop: (q - 0.15) / 0.85, spread: 0 };
    case "decode":
      // The label scrambles from its end while the box retracts to its left edge.
      pose.label = decoding(text, 1 - q * 1.2, tick);
      pose.width = 1 - easeInCubic(q);
      pose.anchor = -1;
      return null;
    case "glitch":
      pose.glitch = easeInCubic(Math.min(1, q * 1.2));
      pose.label = decoding(text, 1 - q, tick);
      pose.alpha = q > 0.75 ? (hash(tick, 5) < 0.5 ? 0 : 1 - q) : 1;
      return null;
    default:
      // A tube switching off: the bar squashes to a line, then to a point.
      pose.scaleY = q < 0.45 ? 1 - 0.95 * easeOutCubic(q / 0.45) : 0.05;
      pose.scaleX = q < 0.45 ? 1 + 0.08 * (q / 0.45) : 1.08 * (1 - easeOutCubic((q - 0.45) / 0.55));
      pose.label = q < 0.25 ? text : "";
      return null;
  }
}

/**
 * Draws the bar whose slot this is. `beat` (0..1, from the music) pops the
 * bar and, on a hard hit, scrambles its label for a moment.
 */
export function drawBars(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  bars: BarSettings,
  loopSeconds: number,
  progress: number,
  beat = 0,
): void {
  if (!bars.enabled) return;
  const lines = barLines(bars);
  if (lines.length === 0) return;

  const loop = loopSeconds > 0 ? loopSeconds : 4;
  const slots = Math.max(1, Math.round(loop / bars.time));
  const time = (((progress % 1) + 1) % 1) * loop;
  const slotLength = loop / slots;
  const slot = Math.min(slots - 1, Math.floor(time / slotLength));
  const local = (time - slot * slotLength) / slotLength;
  const item = lines[slot % lines.length];
  const text = item.text;
  const enterEnd = (1 - bars.hold / 100) / 2;
  const exitStart = 1 - enterEnd;

  const type = bars.type;
  const size = type.fontSize;
  context.save();
  context.font = `${type.fontWeight} ${size}px ${fontStackFor(type)}`;
  context.letterSpacing = `${(type.letterSpacing * size).toFixed(2)}px`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const textWidth = context.measureText(text).width;
  const pad = size * 0.5;
  const boxWidth = textWidth + pad * 2;
  const boxHeight = size * 1.5;

  // Where this bar holds: Position plus a per-bar stray, kept on the frame.
  const stray = bars.scatter / 100;
  const layout: Layout = {
    boxHeight,
    boxWidth,
    frameWidth: frame.width,
    homeX: Math.min(
      frame.width - boxWidth / 2,
      Math.max(
        boxWidth / 2,
        ((bars.position.x + 1) / 2) * frame.width + (hash(slot, 1) - 0.5) * frame.width * 0.5 * stray,
      ),
    ),
    homeY: Math.min(
      frame.height - boxHeight,
      Math.max(
        boxHeight,
        ((bars.position.y + 1) / 2) * frame.height + (hash(slot, 2) - 0.5) * frame.height * 0.5 * stray,
      ),
    ),
    size,
  };
  const fromLeft =
    item.enter === "left" ||
    item.enter === "bulletLeft" ||
    ((item.enter === "assemble" || item.enter === "decode" || item.enter === "glitch") && hash(slot, 3) < 0.5);
  const tick = Math.floor(time * 24);

  const pose: Pose = {
    alpha: 1,
    angle: 0,
    anchor: 0,
    bullet: 0,
    direction: 1,
    ghost: 0,
    glitch: 0,
    label: text,
    scaleX: 1,
    scaleY: 1,
    width: 1,
    x: layout.homeX,
    y: layout.homeY,
  };
  let fragments: Fragments | null = null;
  if (local < enterEnd) {
    const p = clamp01(local / Math.max(1e-3, enterEnd));
    fragments = enterPose(pose, layout, item.enter, fromLeft, p, text, tick);
  } else if (local >= exitStart) {
    const q = clamp01((local - exitStart) / Math.max(1e-3, 1 - exitStart));
    fragments = exitPose(pose, layout, item.exit, fromLeft, q, text, tick);
  }

  if (beat > 0) {
    const pop = 1 + 0.18 * beat;
    pose.scaleX *= pop;
    pose.scaleY *= pop;
    if (beat > 0.7 && pose.label === text) pose.label = decoding(text, 0.55, tick);
  }

  const ink = type.color;
  const opacity = type.opacity / 100;
  const paint = createBarPainter(context, bars.style, layout, pose, ink, opacity);
  if (fragments) {
    paint.fragments(fragments, slot, frame.width, frame.height);
  } else {
    if (pose.ghost !== 0) {
      // Motion trail: fainter blank copies behind a fast bar.
      paint.box(pose.x + pose.ghost * boxWidth * 0.35, pose.y, 0.25, false);
      paint.box(pose.x + pose.ghost * boxWidth * 0.7, pose.y, 0.1, false);
    }
    if (pose.bullet > 0.02) paint.trail(slot);
    if (pose.glitch > 0.02) paint.torn(tick);
    else paint.box(pose.x, pose.y, 1, true);
  }
  context.restore();
}

/**
 * Draw calls for one bar, bound once so each call passes numbers only. The
 * label is cut out of a solid box, or set in the ink for Frame and Text.
 */
function createBarPainter(
  context: Paint2D,
  style: BarStyle,
  layout: Layout,
  pose: Pose,
  ink: string,
  opacity: number,
) {
  const { boxHeight, boxWidth, size } = layout;
  const cut = style === "box" || style === "capsule";

  const box = (x: number, y: number, alpha: number, withLabel: boolean) => {
    const width = boxWidth * pose.width;
    const shift = pose.anchor < 0 ? -(boxWidth - width) / 2 : 0;
    context.save();
    context.globalAlpha = opacity * pose.alpha * alpha;
    context.translate(x + shift * pose.scaleX, y);
    context.rotate(pose.angle);
    context.scale(pose.scaleX, pose.scaleY);
    context.fillStyle = ink;
    context.strokeStyle = ink;
    context.lineWidth = Math.max(1.5, size * 0.08);
    if (style === "box") {
      context.fillRect(-width / 2, -boxHeight / 2, width, boxHeight);
    } else if (style === "capsule") {
      context.beginPath();
      context.roundRect(-width / 2, -boxHeight / 2, width, boxHeight, boxHeight / 2);
      context.fill();
    } else if (style === "outline") {
      context.strokeRect(-width / 2, -boxHeight / 2, width, boxHeight);
    }
    // A blank copy of a text-only bar is its label, faded.
    const label = withLabel || style === "text" ? pose.label : "";
    if (label.length > 0 && width > 1) {
      if (pose.width < 1) {
        context.beginPath();
        context.rect(-width / 2, -boxHeight / 2, width, boxHeight);
        context.clip();
      }
      if (cut && withLabel) context.globalCompositeOperation = "destination-out";
      context.fillText(label, pose.anchor < 0 ? -shift : 0, size * 0.04);
      context.globalCompositeOperation = "source-over";
    }
    context.restore();
  };

  /** Chevrons and speed lines streaming behind a bullet. */
  const trail = (slot: number) => {
    const strength = pose.bullet;
    const direction = pose.direction;
    const rear = pose.x - direction * (boxWidth * pose.scaleX) / 2;
    const count = Math.round(3 + 9 * strength);
    const step = size * 0.62;
    context.save();
    context.fillStyle = ink;
    context.textAlign = "center";
    const chevron = direction > 0 ? ">" : "<";
    for (let index = 0; index < count; index += 1) {
      context.globalAlpha = opacity * pose.alpha * strength * (1 - index / count) * 0.9;
      context.fillText(chevron, rear - direction * (index + 0.8) * step, pose.y + size * 0.04);
    }
    const thickness = Math.max(1, size * 0.07);
    for (let line = 0; line < 3; line += 1) {
      const length = (0.5 + 1.5 * strength) * boxWidth * (0.5 + 0.5 * hash(slot * 7 + line, 11));
      const offset = (line - 1) * boxHeight * 0.36 * pose.scaleY;
      context.globalAlpha = opacity * pose.alpha * strength * 0.55;
      const start = direction > 0 ? rear - length : rear;
      context.fillRect(start, pose.y + offset - thickness / 2, length, thickness);
    }
    context.restore();
  };

  /** The bar torn into horizontal slices that jump sideways, with colour fringes. */
  const torn = (tick: number) => {
    const slices = 4;
    const height = (boxHeight * pose.scaleY) / slices;
    const top = pose.y - (boxHeight * pose.scaleY) / 2;
    for (let slice = 0; slice < slices; slice += 1) {
      if (hash(slice * 13 + tick, 21) < pose.glitch * 0.35) continue;
      const jump = (hash(slice * 31 + tick, 23) - 0.5) * boxWidth * 0.45 * pose.glitch;
      context.save();
      context.beginPath();
      context.rect(pose.x - boxWidth * 2, top + slice * height, boxWidth * 4, height + 0.5);
      context.clip();
      if (cut && pose.glitch > 0.2) {
        const fringe = size * 0.25 * pose.glitch;
        context.globalAlpha = opacity * pose.alpha * 0.6;
        context.fillStyle = "#FF2A55";
        context.fillRect(pose.x + jump - fringe - boxWidth / 2, top + slice * height, boxWidth, height);
        context.fillStyle = "#2AF5FF";
        context.fillRect(pose.x + jump + fringe - boxWidth / 2, top + slice * height, boxWidth, height);
      }
      box(pose.x + jump, pose.y, 1, true);
      context.restore();
    }
  };

  /** The box as a grid of small blocks, flying in from scatter or falling apart. */
  const fragments = (state: Fragments, slot: number, frameWidth: number, frameHeight: number) => {
    const cell = boxHeight / 2;
    const columns = Math.max(1, Math.ceil(boxWidth / cell));
    context.fillStyle = ink;
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const seed = slot * 997 + row * 131 + column;
        const cx = layout.homeX - boxWidth / 2 + (column + 0.5) * (boxWidth / columns);
        const cy = layout.homeY - boxHeight / 2 + (row + 0.5) * cell;
        const heading = hash(seed, 7) * Math.PI * 2;
        const reach = (0.15 + 0.5 * hash(seed, 8)) * frameWidth;
        const out = state.spread + easeOutCubic(state.drop) * 0.6;
        const x = cx + Math.cos(heading) * reach * out;
        const y = cy + Math.sin(heading) * reach * out + state.drop * state.drop * frameHeight * 0.5;
        const alpha = state.drop > 0 ? 1 - state.drop : 1 - state.spread * 0.4;
        context.globalAlpha = opacity * Math.max(0, alpha);
        const spin = (hash(seed, 9) - 0.5) * 6 * Math.max(state.spread, state.drop);
        context.save();
        context.translate(x, y);
        context.rotate(spin);
        context.fillRect(-(boxWidth / columns) / 2, -cell / 2, boxWidth / columns - 1, cell - 1);
        context.restore();
      }
    }
  };

  return { box, fragments, torn, trail };
}
