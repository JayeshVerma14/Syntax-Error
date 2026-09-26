/**
 * Local section commands: reordering the ink list and applying the terminal
 * look. The runtime owns every artifact action.
 */

import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { DEFAULT_GLYPHS } from "./engine-constants";
import { engineTargets } from "./engine-settings";

/** Deterministic Fisher-Yates over a drawn seed, so history stays sane. */
function shuffled(inks: readonly string[]): string[] {
  const next = [...inks];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

/**
 * The glyph-film look in one step: white monospaced characters set on a
 * character grid over saturated blue, the brightest boxed, and a quiet
 * field of dots and dashes held clear of the subject.
 */
export const TERMINAL_LOOK: Readonly<Record<string, unknown>> = {
  [engineTargets.background]: "#0C18F8",
  [engineTargets.includeBackground]: true,
  [engineTargets.paletteMode]: "inks",
  [engineTargets.inks]: ["#FFFFFF"],
  [engineTargets.colorMatch]: "tone",
  [engineTargets.shape]: "glyph",
  [engineTargets.layout]: "type",
  [engineTargets.cell]: 20,
  [engineTargets.gap]: 0,
  [engineTargets.glyphs]: [...DEFAULT_GLYPHS],
  [engineTargets.ramp]: true,
  [engineTargets.glyphSizing]: "fixed",
  [engineTargets.glyphFace]: "mono",
  [engineTargets.glyphBold]: true,
  [engineTargets.knockout]: 8,
  [engineTargets.backdropOn]: true,
  [engineTargets.backdropDensity]: 80,
  [engineTargets.backdropClearance]: 2,
  [engineTargets.backdropOpacity]: 70,
};

export function handleSyntaxErrorPanelAction(
  context: ToolcraftPanelActionContext,
): void {
  const action = context.action.value;
  const values = context.state.values;

  if (action === "palette.shuffle") {
    const current = values[engineTargets.inks];
    if (!Array.isArray(current) || current.length < 2) return;
    const inks = current.filter(
      (entry): entry is string => typeof entry === "string",
    );
    if (inks.length < 2) return;
    context.dispatch({
      target: engineTargets.inks,
      type: "controls.setValue",
      value: shuffled(inks),
    });
    return;
  }

  if (action === "glyph.terminal") {
    // One apply is one undoable step for the whole look.
    context.dispatch({ type: "controls.apply", values: { ...TERMINAL_LOOK } });
  }
}
