/**
 * Moves of the whole screen: a beat's punch in and shake, applied under the
 * picture, and its white flash, laid over it. The CRT pass sits above both.
 */

import type { FrameHit } from "./engine-audio-react";
import type { Paint2D } from "./engine-units";

type Frame = Readonly<{ height: number; width: number }>;

/** A beat's punch in and shake, about the frame centre. */
export function applyHit(context: Paint2D, frame: Frame, hit: FrameHit): void {
  if (hit.zoom === 1 && hit.shakeX === 0 && hit.shakeY === 0) return;
  context.translate(frame.width / 2 + hit.shakeX * frame.width, frame.height / 2 + hit.shakeY * frame.width);
  context.scale(hit.zoom, hit.zoom);
  context.translate(-frame.width / 2, -frame.height / 2);
}

/** A beat's white flash over the whole frame. */
export function drawFlash(context: Paint2D, frame: Frame, flash: number): void {
  if (flash <= 0) return;
  context.save();
  context.globalAlpha = Math.min(1, flash);
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, frame.width, frame.height);
  context.restore();
}
