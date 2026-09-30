/**
 * The code roll: the user's own terminal text takes over the canvas, rolls
 * through the frame, holds, then breaks apart in one of several styles, and
 * the end text follows in the caption style.
 *
 * The phases run back to back in real seconds: roll, pause, break, end text.
 * Every frame is a pure function of the sequence time, so preview, scrubbing
 * and each exported frame agree. The timeline loop follows the sequence
 * length; if the loop is set shorter by hand, the sequence plays faster to
 * fit rather than being cut off.
 */

import { drawCaption } from "./engine-caption";
import {
  breakOrder,
  type BreakingCharacter,
  type BreakPose,
  poseBroken,
} from "./engine-code-break";
import { SCRAMBLE_GLYPHS } from "./engine-constants";
import { applyTextCase, fontStackFor, isFontReady } from "./engine-fonts";
import type {
  CodeBreakStyle,
  CodeRollSettings,
  EndTextSettings,
} from "./engine-settings";
import type { Paint2D } from "./engine-units";

export type CodeSchedule = Readonly<{
  /** Sequence second at which the break starts. */
  breakStart: number;
  /** Sequence second at which the last code character has gone. */
  codeEnd: number;
  endEnd: number;
  endStart: number;
  /** Length of the whole sequence in seconds. */
  total: number;
}>;

export function codeSchedule(
  code: CodeRollSettings,
  end: EndTextSettings,
): CodeSchedule {
  const breakStart = code.enabled ? code.rollTime + code.pause : 0;
  const codeEnd = code.enabled ? breakStart + code.breakTime : 0;
  const endEnd = end.enabled ? codeEnd + end.hold : codeEnd;
  return { breakStart, codeEnd, endEnd, endStart: codeEnd, total: endEnd };
}

/** Sequence seconds for a loop position, compressed only when it cannot fit. */
export function sequenceTime(
  progress: number,
  loopSeconds: number,
  total: number,
): number {
  if (!(loopSeconds > 0)) return progress * total;
  const time = progress * loopSeconds;
  return total > loopSeconds ? time * (total / loopSeconds) : time;
}

/** Whether the code roll hides the sheet at this sequence time. */
export function codeTakesOver(
  code: CodeRollSettings,
  schedule: CodeSchedule,
  time: number,
): boolean {
  return code.enabled && (time < schedule.codeEnd || !code.sheetAtEnd);
}

/** A tab, or a typed `\t`, splits a line into a left part and a right-flush part. */
const COLUMN_SPLIT = /\t|\\t/;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 131, 2_654_435_761) ^ Math.imul(salt + 7, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type CodeChar = BreakingCharacter & {
  /** Share of the break at which this character has faded out. */
  endShare: number;
  /** Whether the character sits in the right-flush part of its line. */
  flushRight: boolean;
  glyph: string;
  line: number;
  /** Code-unit offset of the character within its part of the line. */
  offset: number;
  width: number;
  /** Left edge in frame units. */
  x: number;
};

type CodeLine = {
  chars: CodeChar[];
  left: string;
  right: string;
  rightX: number;
};

type CodeLayout = {
  font: string;
  key: string;
  letterSpacing: string;
  lines: CodeLine[];
  lineStep: number;
  margin: number;
};

/** Smooth 0..1 field over the page that decides which patches leave first. */
function patchNoise(u: number, v: number): number {
  const value =
    0.5 +
    0.28 * Math.sin(3.1 * u + 1.3) * Math.sin(2.7 * v + 0.4) +
    0.22 * Math.sin(5.3 * u - 4.1 * v + 2.2);
  return Math.min(1, Math.max(0, value));
}

let cachedLayout: CodeLayout | null = null;

function buildLayout(
  context: Paint2D,
  code: CodeRollSettings,
  width: number,
): CodeLayout {
  const type = code.type;
  const size = type.fontSize;
  const font = `${type.fontWeight} ${size}px ${fontStackFor(type)}`;
  const letterSpacing = `${(type.letterSpacing * size).toFixed(2)}px`;
  const text = applyTextCase(code.text, type.textCase).replace(/\r/g, "");
  // Widths measured before the face lands are the fallback's, so readiness is
  // part of the key and the layout is rebuilt once the font arrives.
  const key = `${text}|${font}|${letterSpacing}|${Math.round(width)}|${isFontReady(type)}`;
  if (cachedLayout && cachedLayout.key === key) return cachedLayout;

  context.font = font;
  context.letterSpacing = letterSpacing;
  const widths = new Map<string, number>();
  const widthOf = (glyph: string): number => {
    let known = widths.get(glyph);
    if (known === undefined) {
      known = context.measureText(glyph).width;
      widths.set(glyph, known);
    }
    return known;
  };

  const margin = size * 1.4;
  const lineStep = size * type.lineHeight;
  const rawLines = text.split("\n");
  const lastLine = Math.max(1, rawLines.length - 1);
  let serial = 0;
  const lines: CodeLine[] = rawLines.map((raw, lineIndex) => {
    const split = COLUMN_SPLIT.exec(raw);
    const left = split ? raw.slice(0, split.index) : raw;
    const right = split
      ? raw.slice(split.index + split[0].length).replace(/\t|\\t/g, " ").trim()
      : "";
    const chars: CodeChar[] = [];
    const py = lineIndex / lastLine;
    const place = (part: string, startX: number, flushRight: boolean) => {
      let x = startX;
      let offset = 0;
      for (const glyph of Array.from(part)) {
        const glyphWidth = widthOf(glyph);
        if (glyph.trim().length > 0) {
          serial += 1;
          const px = Math.min(1, Math.max(0, (x + glyphWidth / 2) / Math.max(1, width)));
          const heading = hash(serial, 4) * Math.PI * 2;
          const kick = 0.02 + 0.04 * hash(serial, 5);
          chars.push({
            endShare: 0.72 + 0.28 * hash(serial, 2),
            flushRight,
            glyph,
            kickX: Math.cos(heading) * kick,
            kickY: Math.sin(heading) * kick,
            line: lineIndex,
            offset,
            patch: patchNoise(px, (lineIndex * lineStep) / Math.max(1, width)),
            px,
            py,
            rand: hash(serial, 1),
            seed: serial,
            spin: (hash(serial, 3) - 0.5) * 6,
            width: glyphWidth,
            x,
          });
        }
        x += glyphWidth;
        offset += glyph.length;
      }
    };
    place(left, margin, false);
    const rightWidth = right.length > 0 ? context.measureText(right).width : 0;
    const rightX = width - margin - rightWidth;
    if (right.length > 0) place(right, rightX, true);
    return { chars, left, right, rightX };
  });

  cachedLayout = { font, key, letterSpacing, lines, lineStep, margin };
  return cachedLayout;
}

/**
 * Release shares for one break style: per character, and the earliest per
 * line, which is when that line stops being drawn whole. Status tags after a
 * tab hold on longest, as the reference log's column does.
 */
let cachedOrder: {
  key: string;
  lineFirst: Float32Array;
  shares: Map<CodeChar, number>;
} | null = null;

function releaseOrder(layout: CodeLayout, style: CodeBreakStyle) {
  const key = `${layout.key}|${style}`;
  if (cachedOrder && cachedOrder.key === key) return cachedOrder;
  const shares = new Map<CodeChar, number>();
  const lineFirst = new Float32Array(layout.lines.length).fill(1);
  layout.lines.forEach((line, index) => {
    for (const character of line.chars) {
      const order = breakOrder(style, character);
      const share = character.flushRight ? 0.3 + 0.3 * order : 0.5 * order;
      shares.set(character, share);
      lineFirst[index] = Math.min(lineFirst[index], share);
    }
  });
  cachedOrder = { key, lineFirst, shares };
  return cachedOrder;
}

/**
 * Tumbling characters are stamped from one glyph atlas. Text drawn at an
 * arbitrary angle is re-rasterized for every new angle, which on a GPU canvas
 * costs whole seconds per frame at a few thousand characters; a rotated
 * region of one shared bitmap is a single textured quad. The atlas is rendered
 * at the target's device scale, so it stays sharp in a 4K export, and rebuilt
 * when the text, face, colour or scale changes.
 */
type GlyphAtlas = {
  canvas: OffscreenCanvas;
  /** Cell size in frame units. */
  cellHeight: number;
  cellWidth: number;
  columns: number;
  /** Cell size in atlas pixels. */
  pixelHeight: number;
  pixelWidth: number;
  slots: Map<string, number>;
};

let cachedAtlas: { atlas: GlyphAtlas | null; key: string } | null = null;

function glyphAtlas(
  layout: CodeLayout,
  color: string,
  size: number,
  deviceScale: number,
): GlyphAtlas | null {
  const key = `${layout.key}|${color}|${deviceScale.toFixed(3)}`;
  if (cachedAtlas && cachedAtlas.key === key) return cachedAtlas.atlas;
  const glyphs = new Map<string, number>();
  let widest = size * 0.6;
  for (const line of layout.lines) {
    for (const character of line.chars) {
      if (!glyphs.has(character.glyph)) glyphs.set(character.glyph, glyphs.size);
      widest = Math.max(widest, character.width);
    }
  }
  // The glitch break swaps characters for noise, so the noise set is stocked.
  for (const glyph of SCRAMBLE_GLYPHS) {
    if (!glyphs.has(glyph)) glyphs.set(glyph, glyphs.size);
  }
  const pad = size * 0.3;
  const cellWidth = widest + pad * 2;
  const cellHeight = size * 1.5;
  const pixelWidth = Math.max(1, Math.ceil(cellWidth * deviceScale));
  const pixelHeight = Math.max(1, Math.ceil(cellHeight * deviceScale));
  const columns = Math.max(1, Math.ceil(Math.sqrt(glyphs.size)));
  const rows = Math.max(1, Math.ceil(glyphs.size / columns));
  const canvas = new OffscreenCanvas(columns * pixelWidth, rows * pixelHeight);
  const paint = canvas.getContext("2d");
  let atlas: GlyphAtlas | null = null;
  if (paint) {
    paint.font = layout.font.replace(
      /(\d+(?:\.\d+)?)px/,
      (_, px: string) => `${Number(px) * deviceScale}px`,
    );
    paint.fillStyle = color;
    paint.textAlign = "center";
    paint.textBaseline = "middle";
    for (const [glyph, slot] of glyphs) {
      paint.fillText(
        glyph,
        ((slot % columns) + 0.5) * pixelWidth,
        (Math.floor(slot / columns) + 0.5) * pixelHeight + size * 0.02 * deviceScale,
      );
    }
    atlas = { canvas, cellHeight, cellWidth, columns, pixelHeight, pixelWidth, slots: glyphs };
  }
  cachedAtlas = { atlas, key };
  return atlas;
}

/** How long one line takes to reveal, and how long a glitching line flickers. */
const MAX_LINE_REVEAL_SECONDS = 0.5;
const MIN_LINE_REVEAL_SECONDS = 0.06;
const GLITCH_REVEAL_SECONDS = 0.24;
const SCRAMBLE_RATE = 24;

export function drawCodeRoll(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  code: CodeRollSettings,
  schedule: CodeSchedule,
  time: number,
): void {
  if (!code.enabled || time < 0 || time >= schedule.codeEnd) return;

  const layout = buildLayout(context, code, frame.width);
  const lineCount = layout.lines.length;
  if (lineCount === 0) return;
  const { lineStep, margin } = layout;
  const height = frame.height;
  const size = code.type.fontSize;
  const blockHeight = lineCount * lineStep;
  const rollTime = Math.max(code.rollTime, 1e-3);
  const interval = rollTime / lineCount;
  const reveal = Math.min(MAX_LINE_REVEAL_SECONDS, Math.max(MIN_LINE_REVEAL_SECONDS, interval));
  const rowsFit = Math.max(1, Math.floor((height - margin * 2) / lineStep));
  const travelSpeed = (blockHeight + margin) / rollTime;

  /** When a line arrives: typed into the terminal, or entering the frame. */
  const arrival = (index: number): number => {
    if (code.motion === "terminal") return index * interval;
    if (code.motion === "up") return ((index + 1) * lineStep) / travelSpeed;
    return (blockHeight - index * lineStep) / travelSpeed;
  };

  /**
   * Centre of a line at a sequence time, or NaN while it is off screen. The
   * text holds its arrived position through the pause and the break.
   */
  const lineCenter = (index: number, at: number): number => {
    const held = Math.min(Math.max(0, at), rollTime);
    let y: number;
    if (code.motion === "terminal") {
      if (held < arrival(index) && at < rollTime) return Number.NaN;
      // The newest line eases the page up by one line instead of jumping.
      const latest = Math.min(lineCount - 1, Math.floor(held / interval));
      const overflow = latest + 1 - rowsFit;
      const ease =
        at >= rollTime ? 1 : smoothstep(0, Math.min(0.25, interval), held - latest * interval);
      const scroll = overflow >= 1 ? overflow - 1 + ease : 0;
      y = margin + (index - scroll + 0.5) * lineStep;
    } else {
      const top =
        code.motion === "up" ? height - travelSpeed * held : -blockHeight + travelSpeed * held;
      y = top + (index + 0.5) * lineStep;
    }
    return y < -lineStep || y > height + lineStep ? Number.NaN : y;
  };

  const breakTime = Math.max(code.breakTime, 0);
  const breakStart = schedule.breakStart;
  const breaking = breakTime > 0 && time >= breakStart;
  const order = breaking ? releaseOrder(layout, code.breakStyle) : null;
  const releaseOf = (character: CodeChar): number =>
    breakStart + breakTime * (order?.shares.get(character) ?? 1);
  const opacity = code.type.opacity / 100;
  const scrambleTick = Math.floor(time * SCRAMBLE_RATE);

  context.save();
  context.font = layout.font;
  context.letterSpacing = layout.letterSpacing;
  context.fillStyle = code.type.color;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.globalAlpha = opacity;

  // Canvas calls that carry a transform or the atlas bitmap are bound here,
  // before the draw loops, so the loops below hand them numbers only.
  let atlas: GlyphAtlas | null = null;
  let base: readonly number[] = [1, 0, 0, 1, 0, 0];
  const beginStamping = (): boolean => {
    const matrix = context.getTransform();
    base = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
    atlas = glyphAtlas(layout, code.type.color, size, Math.hypot(matrix.a, matrix.b));
    return atlas !== null;
  };
  const slotOf = (glyph: string): number | undefined => atlas?.slots.get(glyph);
  /** Stamps one atlas cell at a point, turned and scaled, at an opacity. */
  const stamp = (
    slot: number,
    x: number,
    y: number,
    angle: number,
    scaleBy: number,
    alpha: number,
  ) => {
    if (!atlas) return;
    const [a, b, c, d, e, f] = base;
    const cos = Math.cos(angle) * scaleBy;
    const sin = Math.sin(angle) * scaleBy;
    context.globalAlpha = alpha;
    context.setTransform(
      a * cos + c * sin,
      b * cos + d * sin,
      c * cos - a * sin,
      d * cos - b * sin,
      a * x + c * y + e,
      b * x + d * y + f,
    );
    context.drawImage(
      atlas.canvas,
      (slot % atlas.columns) * atlas.pixelWidth,
      Math.floor(slot / atlas.columns) * atlas.pixelHeight,
      atlas.pixelWidth,
      atlas.pixelHeight,
      -atlas.cellWidth / 2,
      -atlas.cellHeight / 2,
      atlas.cellWidth,
      atlas.cellHeight,
    );
  };
  const endStamping = () => {
    const [a, b, c, d, e, f] = base;
    context.setTransform(a, b, c, d, e, f);
  };

  /** A part of a line with not-yet-resolved characters swapped for noise. */
  const decoded = (part: string, lineIndex: number, age: number, salt: number): string => {
    const span = Math.max(reveal, 0.3);
    return Array.from(part, (glyph, index) => {
      if (glyph.trim().length === 0) return glyph;
      const lock = span * (0.25 + 0.75 * (index / Math.max(1, part.length))) * (0.8 + 0.2 * hash(index + salt, lineIndex));
      if (age >= lock) return glyph;
      return SCRAMBLE_GLYPHS[Math.floor(hash(index + salt, scrambleTick + lineIndex * 7) * SCRAMBLE_GLYPHS.length)];
    }).join("");
  };

  const drawWhole = (line: CodeLine, y: number, dx: number) => {
    if (line.left.length > 0) context.fillText(line.left, margin + dx, y);
    if (line.right.length > 0) context.fillText(line.right, line.rightX + dx, y);
  };

  /** One line before any of it has broken away, as its reveal has it now. */
  const drawArriving = (line: CodeLine, index: number, y: number) => {
    // A whole-line reveal in a rolling block slides in past the frame edge.
    if (code.reveal === "line") {
      drawWhole(line, y, 0);
      return;
    }
    const age = time - arrival(index);
    if (age < 0) return;
    if (code.reveal === "type" && age < reveal) {
      const typed = line.left.slice(0, Math.floor(line.left.length * (age / reveal)));
      context.fillText(typed, margin, y);
      const caret = margin + context.measureText(typed).width;
      context.fillRect(caret + size * 0.05, y - size * 0.55, size * 0.55, size * 1.1);
      return;
    }
    if (code.reveal === "decode" && age < Math.max(reveal, 0.3)) {
      context.fillText(decoded(line.left, index, age, 0), margin, y);
      if (line.right.length > 0) {
        context.fillText(decoded(line.right, index, age, 997), line.rightX, y);
      }
      return;
    }
    if (code.reveal === "glitch" && age < GLITCH_REVEAL_SECONDS) {
      // A new line lands doubled and jittering, then settles.
      const tick = Math.floor(age * 30);
      const settle = 1 - age / GLITCH_REVEAL_SECONDS;
      context.globalAlpha = opacity * 0.55 * settle;
      drawWhole(line, y - size * 0.12, (hash(index, tick + 3) - 0.5) * size * 3);
      drawWhole(line, y + size * 0.12, (hash(index, tick + 9) - 0.5) * size * 3);
      context.globalAlpha = opacity;
      if (hash(index, tick + 17) > 0.25) {
        drawWhole(line, y, (hash(index, tick + 23) - 0.5) * size * 0.8 * settle);
      }
      return;
    }
    drawWhole(line, y, 0);
  };

  for (let index = 0; index < lineCount; index += 1) {
    const y = lineCenter(index, time);
    if (Number.isNaN(y)) continue;
    const line = layout.lines[index];
    if (!order || time < breakStart + breakTime * order.lineFirst[index]) {
      drawArriving(line, index, y);
      continue;
    }
    // Once characters leave, the line is drawn as its unbroken stretches.
    let first: CodeChar | null = null;
    let last: CodeChar | null = null;
    const flush = () => {
      if (!first || !last) return;
      const part = first.flushRight ? line.right : line.left;
      context.fillText(part.slice(first.offset, last.offset + last.glyph.length), first.x, y);
      first = null;
      last = null;
    };
    for (const character of line.chars) {
      const intact = time < releaseOf(character);
      if (!intact || (first && first.flushRight !== character.flushRight)) flush();
      if (intact) {
        first ??= character;
        last = character;
      }
    }
    flush();
  }

  if (breaking) {
    const scale = Math.min(frame.width, height);
    const centre = { cu: frame.width / 2 / scale, cv: height / 2 / scale };
    const pose: BreakPose = { alpha: 1, angle: 0, glyph: null, scale: 1, u: 0, v: 0 };
    if (beginStamping()) {
      for (const line of layout.lines) {
        for (const character of line.chars) {
          const release = releaseOf(character);
          const death = breakStart + breakTime * character.endShare;
          if (time < release || time >= death) continue;
          // A character only breaks away from a line that was on screen.
          const homeY = lineCenter(character.line, release);
          if (Number.isNaN(homeY)) continue;
          const age = time - release;
          const life = death - release;
          poseBroken(
            code.breakStyle,
            pose,
            character,
            centre,
            (character.x + character.width / 2) / scale,
            homeY / scale,
            age,
            life,
            release,
          );
          const fade = pose.alpha * (1 - smoothstep(0.55, 1, age / life));
          const slot = slotOf(pose.glyph ?? character.glyph);
          if (fade <= 0 || slot === undefined || pose.scale <= 0) continue;
          stamp(slot, pose.u * scale, pose.v * scale, pose.angle, pose.scale, opacity * fade);
        }
      }
      endStamping();
    }
  }
  context.restore();
}

/**
 * Caption progress for a moment of the end text's hold. The caption reveal
 * types over 0–0.55 of its progress, holds to 0.9 and exits after; here the
 * reveal takes a fixed pace per character, the exit a fixed moment, and the
 * hold is everything between, so Hold means how long the text stays up.
 */
export function endTextProgress(elapsed: number, hold: number, characters: number): number {
  const revealTime = Math.min(hold * 0.45, 0.2 + characters * 0.04);
  const exitTime = Math.min(hold * 0.2, 0.35);
  if (elapsed < revealTime) return (0.55 * elapsed) / revealTime;
  const steady = hold - revealTime - exitTime;
  if (elapsed < hold - exitTime) {
    return 0.55 + (0.35 * (elapsed - revealTime)) / Math.max(steady, 1e-3);
  }
  return Math.min(0.9999, 0.9 + (0.1 * (elapsed - (hold - exitTime))) / Math.max(exitTime, 1e-3));
}

/** The end text, typed on in the caption style across its hold window. */
export function drawEndText(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  end: EndTextSettings,
  schedule: CodeSchedule,
  time: number,
): void {
  if (!end.enabled || end.hold <= 0) return;
  if (time < schedule.endStart || time >= schedule.endEnd) return;
  const characters = end.text.replace(/\s/g, "").length;
  drawCaption(context, frame, end, endTextProgress(time - schedule.endStart, end.hold, characters));
}
