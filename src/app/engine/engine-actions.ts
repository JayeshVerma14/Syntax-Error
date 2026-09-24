/**
 * Local section commands. These edit the painted layer or the ink list; the
 * runtime owns every artifact action.
 */

import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { fillPattern, readEditLayer, remapLayer } from "./engine-edit";
import { resolveGridShape } from "./engine-render";
import { engineTargets, readEngineSettings } from "./engine-settings";

/** Deterministic Fisher-Yates over a drawn seed, so history stays sane. */
function shuffled(inks: readonly string[]): string[] {
  const next = [...inks];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

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

  if (action === "palette.remap") {
    const settings = readEngineSettings(values);
    const layer = readEditLayer(values[engineTargets.editCells]);
    if (Object.keys(layer).length === 0 || settings.inks.length === 0) return;
    context.dispatch({
      target: engineTargets.editCells,
      type: "controls.setValue",
      value: remapLayer(layer, settings.inks),
    });
    return;
  }

  if (action === "pattern.fill") {
    const settings = readEngineSettings(values);
    const size = context.state.canvas.size;
    const shape = resolveGridShape(settings, size.width, size.height);
    context.dispatch({
      target: engineTargets.editCells,
      type: "controls.setValue",
      value: fillPattern({
        angleDegrees: settings.patternAngle,
        cols: shape.cols,
        inks: settings.inks,
        kind: settings.patternKind,
        layer: settings.edit,
        rows: shape.rows,
        scale: settings.patternScale,
      }),
    });
    return;
  }

  if (action === "pattern.clear") {
    context.dispatch({
      target: engineTargets.editCells,
      type: "controls.setValue",
      value: {},
    });
  }
}
