"use client";

/**
 * Video exports start at 4K.
 *
 * Toolcraft's Video Export resolution defaults to Current, the artboard size,
 * which on the square artboard is only 1080 by 1080. A workspace that has not
 * had this preset applied gets 4K once, and a product-owned marker records
 * that, so choosing Current afterwards is kept across reloads. The switch is
 * written without a history step: it is a starting setting, not an edit.
 */

import * as React from "react";

import type { ToolcraftState } from "@/toolcraft/runtime";
import {
  useToolcraftDispatch,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";

import { VIDEO_QUALITY_PRESET_TARGET } from "./engine-constants";

const VIDEO_RESOLUTION_TARGET = "export.video.resolution";

function selectPresetPending(state: ToolcraftState): boolean {
  return state.values[VIDEO_QUALITY_PRESET_TARGET] !== true;
}

export function useVideoQualityPreset(): void {
  const pending = useToolcraftSelector(selectPresetPending);
  const dispatch = useToolcraftDispatch();
  // Read through a ref, so the effect runs only when the marker changes.
  const dispatchRef = React.useRef(dispatch);
  dispatchRef.current = dispatch;

  React.useEffect(() => {
    if (!pending) return;
    dispatchRef.current({
      history: "skip",
      type: "controls.apply",
      values: {
        [VIDEO_QUALITY_PRESET_TARGET]: true,
        [VIDEO_RESOLUTION_TARGET]: "4k",
      },
    });
  }, [pending]);
}
