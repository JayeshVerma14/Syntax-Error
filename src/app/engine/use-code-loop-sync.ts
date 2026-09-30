"use client";

/**
 * The timeline length follows the code roll.
 *
 * The roll's phases are authored in seconds, so the loop is set to their sum
 * whenever the user changes one of them, turns the roll on, or opens a
 * workspace whose loop does not match. Without this, a sequence longer than
 * the loop would be squeezed into it and every timing slider would seem to do
 * nothing but change proportions.
 *
 * The loop is written only for forward edits. An undo steps back through
 * history and must not write a new step, and a loop length the user sets by
 * hand stands until they change the sequence again. Writes wait for a drag to
 * settle, so one slider gesture adds one history step.
 */

import * as React from "react";

import type { ToolcraftState } from "@/toolcraft/runtime";
import {
  useToolcraftDispatch,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";

import { codeSchedule } from "./engine-code";
import { readCodeRoll, readEndText } from "./engine-settings";

/** The runtime's accepted loop range. */
const MIN_LOOP_SECONDS = 1;
const MAX_LOOP_SECONDS = 60;
const SETTLE_MS = 350;

/** The sequence length the loop should have, or null while the roll is off. */
function selectSequenceSeconds(state: ToolcraftState): number | null {
  const code = readCodeRoll(state.values);
  if (!code.enabled) return null;
  const total = codeSchedule(code, readEndText(state.values)).total;
  const clamped = Math.min(MAX_LOOP_SECONDS, Math.max(MIN_LOOP_SECONDS, total));
  return Math.round(clamped * 100) / 100;
}

function selectUndoDepth(state: ToolcraftState): number {
  return state.history.undo.length;
}

function selectLoopSeconds(state: ToolcraftState): number {
  return state.timeline.durationSeconds;
}

export function useCodeLoopSync(): void {
  const sequence = useToolcraftSelector(selectSequenceSeconds);
  const depth = useToolcraftSelector(selectUndoDepth);
  const dispatch = useToolcraftDispatch();
  // The current loop is only read to skip a write that would change nothing.
  const loopRef = React.useRef(0);
  loopRef.current = useToolcraftSelector(selectLoopSeconds);
  const dispatchRef = React.useRef(dispatch);
  dispatchRef.current = dispatch;
  const seen = React.useRef<{ depth: number; sequence: number | null } | null>(null);
  const pending = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const previous = seen.current;
    seen.current = { depth, sequence };
    if (sequence === null) return;
    if (previous && previous.sequence === sequence) return;
    if (previous && depth < previous.depth) return;
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      if (Math.abs(loopRef.current - sequence) < 0.01) return;
      dispatchRef.current({ durationSeconds: sequence, type: "timeline.setDuration" });
    }, SETTLE_MS);
  }, [depth, sequence]);

  React.useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    [],
  );
}
