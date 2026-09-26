/**
 * Typefaces chosen through a font picker. The picker loads its selected font;
 * the engine maps the picker's catalog id to a family, knows when that family
 * has actually arrived, and falls back to the bundled interface face offline.
 */

import { getFontPickerFontById } from "@/toolcraft/ui";

import type { TypeSettings } from "./engine-settings";

/** The bundled interface face, so text still renders in Inter offline. */
const BUNDLED_FAMILY = "Inter Variable";
const FONT_PROBE_TEXT = "Syntax 0123 mwMW";
const FONT_POLL_MS = 120;

let fontProbe: OffscreenCanvasRenderingContext2D | null | undefined;

/** The catalog family behind a font picker's font id. */
export function familyFor(type: TypeSettings): string {
  return getFontPickerFontById(type.fontId)?.family ?? "Inter";
}

/** A CSS family list: the chosen family, then the bundled face, then system. */
export function fontStackFor(type: TypeSettings): string {
  return `"${familyFor(type)}", "${BUNDLED_FAMILY}", system-ui, sans-serif`;
}

/**
 * Whether the chosen family has loaded. Until it settles, text in the family
 * measures exactly like its fallback, so it is measured against two different
 * generic fallbacks and a loaded face differs from at least one.
 */
export function isFontReady(type: TypeSettings): boolean {
  fontProbe ??= new OffscreenCanvas(1, 1).getContext("2d");
  const probe = fontProbe;
  if (!probe) return true;
  const family = familyFor(type);
  return ["monospace", "serif"].some((generic) => {
    probe.font = `${type.fontWeight} 40px "${family}", ${generic}`;
    const withFamily = probe.measureText(FONT_PROBE_TEXT).width;
    probe.font = `${type.fontWeight} 40px ${generic}`;
    return withFamily !== probe.measureText(FONT_PROBE_TEXT).width;
  });
}

/** Resolves true once the family loads, or false when it has not by the deadline. */
export function waitForFont(
  type: TypeSettings,
  timeoutMs: number,
  isActive: () => boolean = () => true,
): Promise<boolean> {
  const started = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (isFontReady(type)) resolve(true);
      else if (!isActive() || performance.now() - started > timeoutMs) resolve(false);
      else setTimeout(check, FONT_POLL_MS);
    };
    check();
  });
}

export function applyTextCase(text: string, textCase: string): string {
  if (textCase === "uppercase") return text.toUpperCase();
  if (textCase === "lowercase") return text.toLowerCase();
  if (textCase === "capitalize" || textCase === "titleCase") {
    return text.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
  }
  return text;
}
