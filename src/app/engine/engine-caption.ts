/**
 * The caption: terminal-style text set over the sheet, as in the glyph films
 * where lines type on, words decode out of scrambled characters, and one word
 * sits in a solid box. The caption is screen text rather than halftone, so it
 * stays crisp above the grid, the camera and the glitch.
 *
 * Every reveal returns to its first frame at the loop point: typed text is
 * backspaced away before the loop closes, and decoded text scrambles again.
 */

import { SCRAMBLE_GLYPHS } from "./engine-constants";
import { applyTextCase, fontStackFor } from "./engine-fonts";
import type { CaptionSettings } from "./engine-settings";

/** Blinks and cursor flashes per loop; even counts keep the seam continuous. */
const BLINKS_PER_LOOP = 8;
const CURSOR_FLASHES_PER_LOOP = 16;
const SCRAMBLE_TICKS_PER_LOOP = 36;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 43, 2_654_435_761) ^ Math.imul(salt + 19, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** How many characters are typed at this loop phase. */
export function typedCount(total: number, progress: number): number {
  if (progress < 0.55) return Math.floor((total * progress) / 0.55);
  if (progress < 0.9) return total;
  return Math.max(0, Math.floor(total * (1 - (progress - 0.9) / 0.1)));
}

/** The character a decoding caption shows at position `index`. */
export function decodedCharacter(
  character: string,
  index: number,
  total: number,
  progress: number,
): string {
  if (character.trim().length === 0) return character;
  const share = total > 1 ? index / (total - 1) : 0;
  const lock = 0.06 + 0.46 * share + 0.08 * hash(index, 1);
  const release = 0.88 + 0.1 * share;
  if (progress >= lock && progress < release) return character;
  const tick = Math.floor(progress * SCRAMBLE_TICKS_PER_LOOP);
  return SCRAMBLE_GLYPHS[Math.floor(hash(index, tick + 2) * SCRAMBLE_GLYPHS.length)];
}

type Frame = Readonly<{ height: number; width: number }>;

export function drawCaption(
  context: CanvasRenderingContext2D,
  frame: Frame,
  caption: CaptionSettings,
  progress: number,
): void {
  const text = applyTextCase(caption.text, caption.type.textCase).replace(/\r/g, "");
  if (text.trim().length === 0) return;
  const lines = text.split("\n");
  const type = caption.type;
  const size = type.fontSize;
  const lineStep = size * type.lineHeight;

  context.save();
  context.font = `${type.fontWeight} ${size}px ${fontStackFor(type)}`;
  context.letterSpacing = `${(type.letterSpacing * size).toFixed(2)}px`;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.globalAlpha = type.opacity / 100;

  // Bound before the line loop so the calls inside it pass strings only.
  const widthOf = (text: string): number => context.measureText(text).width;
  const widths = lines.map(widthOf);
  const blockWidth = Math.max(0, ...widths);
  const blockHeight = lineStep * lines.length;
  const left = ((caption.position.x + 1) / 2) * frame.width - blockWidth / 2;
  const top = ((caption.position.y + 1) / 2) * frame.height - blockHeight / 2;

  const total = lines.reduce((sum, line) => sum + line.length, 0);
  const visible =
    caption.reveal === "type" ? typedCount(total, progress) : total;
  const boxOn = !caption.blink || Math.floor(progress * BLINKS_PER_LOOP) % 2 === 0;
  const highlight = caption.highlight.trim().toLowerCase();

  let consumed = 0;
  let cursorX = left;
  let cursorY = top + lineStep / 2;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const y = top + lineStep * (lineIndex + 0.5);
    const shown = Math.max(0, Math.min(line.length, visible - consumed));
    const typed = line.slice(0, shown);
    const display =
      caption.reveal === "decode"
        ? Array.from(typed, (character, offset) =>
            decodedCharacter(character, consumed + offset, total, progress),
          ).join("")
        : typed;
    context.fillStyle = type.color;
    context.fillText(display, left, y);

    // Every occurrence of the highlight word gets a solid box with the word
    // cut out of it, so it reads as selected text in any background.
    if (highlight.length > 0 && boxOn) {
      const lower = line.toLowerCase();
      let from = lower.indexOf(highlight);
      while (from >= 0 && from + highlight.length <= shown) {
        const x = left + widthOf(line.slice(0, from));
        const word = display.slice(from, from + highlight.length);
        const wordWidth = widthOf(word);
        const pad = size * 0.14;
        context.fillRect(x - pad, y - size * 0.62, wordWidth + pad * 2, size * 1.24);
        context.globalCompositeOperation = "destination-out";
        context.fillText(word, x, y);
        context.globalCompositeOperation = "source-over";
        from = lower.indexOf(highlight, from + highlight.length);
      }
    }

    if (shown > 0 || lineIndex === 0) {
      cursorX = left + widthOf(display);
      cursorY = y;
    }
    consumed += line.length;
    if (consumed >= visible) break;
  }

  const cursorOn =
    !caption.blink || Math.floor(progress * CURSOR_FLASHES_PER_LOOP) % 2 === 0;
  if (caption.cursor && cursorOn) {
    context.fillText("_", cursorX + size * 0.08, cursorY);
  }
  context.restore();
}
