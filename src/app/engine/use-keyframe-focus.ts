"use client";

/**
 * Clicking a keyframe on the timeline shows that keyframe in the panel.
 *
 * The runtime selects a clicked keyframe, and while it is selected an edit
 * to its control writes into that keyframe. The panel, though, shows each
 * control's base value, and the playhead stays where it was, so the canvas
 * and the control both kept showing some other moment. When a keyframe away
 * from the playhead is selected, this pauses playback, moves the playhead to
 * the keyframe, shows the keyframe's own value in its control and opens the
 * control's section, so the keyframe can be read and edited in place.
 *
 * Moving the playhead off the selected keyframe releases it, so the next edit
 * lands at the playhead, where the canvas is, rather than on a keyframe out
 * of view. Dragging a keyframe keeps the playhead on it.
 *
 * The value shown is written without a history step: selecting a keyframe is
 * not an edit, so Undo still undoes the last real change.
 */

import * as React from "react";

import type { ToolcraftState } from "@/toolcraft/runtime";
import {
  useToolcraftDispatch,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";

type KeyframeFocus = Readonly<{
  baseValue: unknown;
  collapsed: boolean;
  controlId: string;
  id: string;
  playheadSeconds: number;
  playing: boolean;
  sectionId: string | null;
  timeSeconds: number;
  value: unknown;
}>;

/**
 * A playhead this close to a keyframe is already on it. Keyframe times round
 * to 0.01s, and one that is created during playback may trail the playhead
 * by a frame, so this keeps edits during playback from pausing it.
 */
const ON_KEYFRAME_SECONDS = 0.02;

function findSelectedKeyframe(state: ToolcraftState) {
  const id = state.timeline.selectedKeyframeId;
  if (!id) return null;
  for (const group of state.timeline.keyframeGroups) {
    const keyframe = group.keyframes.find((candidate) => candidate.id === id);
    if (keyframe) return keyframe;
  }
  return null;
}

function selectKeyframeFocus(state: ToolcraftState): KeyframeFocus | null {
  const keyframe = findSelectedKeyframe(state);
  if (!keyframe) return null;
  const section = (state.schema.panels.controls?.sections ?? []).find((candidate) =>
    Object.values(candidate.controls).some(
      (control) => control.target === keyframe.controlId,
    ),
  );
  return {
    baseValue: state.values[keyframe.controlId],
    collapsed: section
      ? state.panels.controls.collapsedSections[section.id] === true
      : false,
    controlId: keyframe.controlId,
    id: keyframe.id,
    playheadSeconds: state.timeline.currentTimeSeconds,
    playing: state.timeline.isPlaying,
    sectionId: section?.id ?? null,
    timeSeconds: keyframe.timeSeconds,
    value: keyframe.value,
  };
}

/** The selected keyframe's id once the playhead has left it, else null. */
function selectKeyframeLeft(state: ToolcraftState): string | null {
  const keyframe = findSelectedKeyframe(state);
  if (!keyframe) return null;
  const distance = Math.abs(state.timeline.currentTimeSeconds - keyframe.timeSeconds);
  return distance > ON_KEYFRAME_SECONDS ? keyframe.id : null;
}

/**
 * Only a change of selected keyframe matters. The rest of the focus is the
 * state at the moment of selection, so later edits do not re-apply it.
 */
function sameFocus(previous: KeyframeFocus | null, next: KeyframeFocus | null): boolean {
  return previous?.id === next?.id;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useKeyframeFocus(): void {
  const focus = useToolcraftSelector(selectKeyframeFocus, sameFocus);
  const left = useToolcraftSelector(selectKeyframeLeft);
  const dispatch = useToolcraftDispatch();
  // Read through a ref, so each effect runs only for its own change.
  const dispatchRef = React.useRef(dispatch);
  dispatchRef.current = dispatch;
  // The keyframe this hook is moving the playhead to, until it arrives.
  const arrivingRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!focus) return;
    const send = dispatchRef.current;
    // A keyframe created at the playhead is already in view; only a keyframe
    // clicked elsewhere on the track moves the playhead.
    if (Math.abs(focus.timeSeconds - focus.playheadSeconds) > ON_KEYFRAME_SECONDS) {
      arrivingRef.current = focus.id;
      if (focus.playing) send({ isPlaying: false, type: "timeline.setPlaying" });
      send({ currentTimeSeconds: focus.timeSeconds, type: "timeline.setCurrentTime" });
    }
    if (focus.value !== undefined && !sameValue(focus.value, focus.baseValue)) {
      send({
        history: "skip",
        type: "controls.apply",
        values: { [focus.controlId]: focus.value },
      });
    }
    if (focus.sectionId && focus.collapsed) {
      send({
        collapsed: false,
        sectionId: focus.sectionId,
        type: "panels.setSectionCollapsed",
      });
    }
  }, [focus]);

  React.useEffect(() => {
    if (!left) {
      arrivingRef.current = null;
      return;
    }
    // The playhead has not reached the keyframe this hook just moved it to.
    if (arrivingRef.current === left) return;
    dispatchRef.current({ keyframeId: null, type: "timeline.selectKeyframe" });
  }, [left]);
}
