/**
 * Transitions: short glitch fillers that hide a cut. A filler covers the
 * finished frame, holds it dark for a beat while the shot changes underneath,
 * then uncovers the next shot. The glow style is the reference light leak, a
 * stepped dome of hot square pixels in a soft bloom sweeping through the
 * frame; the others are a pixel mosaic, a torn RGB slice, a CRT scan beam
 * and a halftone grid wipe.
 *
 * Fillers sit on the sequence's scene cuts (code roll, sheet, end text, data
 * text, logo), on the loop seam, or both (see engine-transition-timing). A
 * seam filler straddles the loop boundary, so the last frames run into it and
 * the first frames come out of it: the loop stays seamless and exported clips
 * cut together cleanly. Every frame is a pure function of the sequence time
 * (and the music), and nothing is drawn between fillers.
 *
 * With music, the fillers answer it (see engine-transition-audio), and the
 * Beats placement fires a filler on every strong beat instead of on the cuts.
 */

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import { driveOf } from "./engine-transition-audio";
import { drawMosaic, drawGridWipe } from "./engine-transition-blocks";
import { drawGlow } from "./engine-transition-glow";
import {
  hexToRgb,
  mixRgb,
  type TransitionPaint,
  WHITE,
} from "./engine-transition-kit";
import { drawScan, drawSlice, tearScene } from "./engine-transition-signal";
import { transitionAt, type TransitionLoop } from "./engine-transition-timing";
import type { Paint2D } from "./engine-units";
import { readBoolean, readHex, readNumber, readString, type Values } from "./engine-values";

export {
  transitionAt,
  transitionClock,
  transitionCuts,
  type TransitionCutOptions,
  type TransitionLoop,
  type TransitionMoment,
  type TransitionSchedule,
} from "./engine-transition-timing";

export const transitionTargets = {
  blocks: "transition.blocks",
  color: "transition.color",
  cover: "transition.cover",
  direction: "transition.direction",
  duration: "transition.duration",
  enabled: "transition.enabled",
  fill: "transition.fill",
  hold: "transition.hold",
  intensity: "transition.intensity",
  placement: "transition.placement",
  style: "transition.style",
  threshold: "transition.threshold",
} as const;

export type TransitionStyle = "glow" | "grid" | "mosaic" | "scan" | "slice";
export type TransitionPlacement = "beats" | "both" | "cuts" | "loop";
export type TransitionDirection = "down" | "left" | "right" | "up";

export const TRANSITION_STYLES: readonly TransitionStyle[] = ["glow", "mosaic", "slice", "scan", "grid"];
export const TRANSITION_PLACEMENTS: readonly TransitionPlacement[] = ["cuts", "loop", "both", "beats"];
export const TRANSITION_DIRECTIONS: readonly TransitionDirection[] = ["up", "down", "left", "right"];

export const MIN_TRANSITION_SECONDS = 0.3;
export const MAX_TRANSITION_SECONDS = 2;
export const MIN_TRANSITION_BLOCKS = 4;
export const MAX_TRANSITION_BLOCKS = 24;

export type TransitionSettings = Readonly<{
  /** Grid pixels across the frame's shorter side. */
  blocks: number;
  /** The glow; its white-hot core is mixed from it. */
  color: string;
  /** 0..100: opacity of the cover at full strength. */
  cover: number;
  /** Which way the filler travels across the frame. */
  direction: TransitionDirection;
  /**
   * Seconds from the first covered frame to the last. A beat-fired filler
   * starts at the cut, so it lasts half this.
   */
  duration: number;
  enabled: boolean;
  /** Colour of the cover. */
  fill: string;
  /** 0..60: share of the filler held fully covered around the cut. */
  hold: number;
  /** 0..100: light, sparks and tearing. */
  intensity: number;
  placement: TransitionPlacement;
  style: TransitionStyle;
  /** 0..100: how strong a beat must be to fire a filler, with the Beats placement. */
  threshold: number;
}>;

export function readTransition(values: Values): TransitionSettings {
  return {
    blocks: Math.round(
      Math.min(MAX_TRANSITION_BLOCKS, Math.max(MIN_TRANSITION_BLOCKS, readNumber(values, transitionTargets.blocks, 6))),
    ),
    color: readHex(values, transitionTargets.color, "#FFFFFF"),
    cover: Math.min(100, Math.max(0, readNumber(values, transitionTargets.cover, 100))),
    direction: readString(values, transitionTargets.direction, TRANSITION_DIRECTIONS, "up"),
    duration: Math.min(
      MAX_TRANSITION_SECONDS,
      Math.max(MIN_TRANSITION_SECONDS, readNumber(values, transitionTargets.duration, 0.8)),
    ),
    enabled: readBoolean(values, transitionTargets.enabled, false),
    fill: readHex(values, transitionTargets.fill, "#050406"),
    hold: Math.min(60, Math.max(0, readNumber(values, transitionTargets.hold, 20))),
    intensity: Math.min(100, Math.max(0, readNumber(values, transitionTargets.intensity, 85))),
    placement: readString(values, transitionTargets.placement, TRANSITION_PLACEMENTS, "both"),
    style: readString(values, transitionTargets.style, TRANSITION_STYLES, "glow"),
    threshold: Math.min(100, Math.max(0, readNumber(values, transitionTargets.threshold, 80))),
  };
}

type Painter = (paint: TransitionPaint) => void;

const PAINTERS: Readonly<Record<TransitionStyle, Painter>> = {
  glow: drawGlow,
  grid: drawGridWipe,
  mosaic: drawMosaic,
  scan: drawScan,
  slice: drawSlice,
};

/**
 * Turns the canvas so a style's travel (always up its own canvas) runs in the
 * chosen direction. Returns the style's canvas size.
 */
function orient(
  context: Paint2D,
  width: number,
  height: number,
  direction: TransitionDirection,
): Readonly<{ height: number; width: number }> {
  if (direction === "down") {
    context.transform(1, 0, 0, -1, 0, height);
    return { height, width };
  }
  if (direction === "left") {
    context.transform(0, 1, 1, 0, 0, 0);
    return { height: width, width: height };
  }
  if (direction === "right") {
    context.transform(0, 1, -1, 0, width, 0);
    return { height: width, width: height };
  }
  return { height, width };
}

/**
 * Draws the filler over the finished frame, in frame units (the caller has
 * already moved to the frame's corner). `timeSeconds` is the sequence time;
 * `loopSeconds` is the sequence length of one loop, or `{ real, sequence }`
 * so a sequence squeezed into a shorter timeline keeps real-time fillers (see
 * `transitionClock`); `cuts` come from `transitionCuts`; `pulse` is the music
 * at this frame. Free when no filler is on screen.
 */
export function drawTransition(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  settings: TransitionSettings,
  timeSeconds: number,
  loopSeconds: number | TransitionLoop,
  cuts: readonly number[],
  pulse: AudioPulse = SILENT_PULSE,
): void {
  const moment = transitionAt(settings, timeSeconds, loopSeconds, cuts, pulse);
  if (!moment || moment.u <= 0 || moment.u >= 1) return;
  if (!(frame.width >= 1 && frame.height >= 1)) return;
  const matrix = context.getTransform();
  const glow = hexToRgb(settings.color);
  const intensity = settings.intensity / 100;
  const drive = driveOf(pulse);
  // Flicker counts real seconds from the cut, so a seam filler matches across the loop boundary.
  const tick = Math.floor(moment.seconds * 24);
  context.save();
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  if (settings.style === "slice") {
    // A beat tears the picture further.
    const tear = intensity * (1 + 0.8 * drive.beat);
    tearScene(context, frame, settings.direction, moment.u, moment.hold, tear, moment.seed, moment.seconds);
  }
  const size = orient(context, frame.width, frame.height, settings.direction);
  const unit = Math.min(frame.width, frame.height);
  PAINTERS[settings.style]({
    block: unit / settings.blocks,
    context,
    cover: (settings.cover / 100) * moment.cover,
    drive,
    fill: settings.fill,
    glow,
    height: size.height,
    hold: moment.hold,
    hot: mixRgb(glow, WHITE, 0.7),
    intensity,
    scale: Math.max(0.1, Math.hypot(matrix.a, matrix.b)),
    seed: moment.seed,
    tick,
    u: moment.u,
    unit,
    width: size.width,
  });
  context.restore();
}
