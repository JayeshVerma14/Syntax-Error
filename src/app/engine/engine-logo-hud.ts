/**
 * The HUD of the cinematic logo reveal: lock-on brackets drawn on the logo
 * plane, so they turn and foreshorten with the camera and close in as parts
 * dock; a turning reticle on the aim point; and readouts that frame the
 * brackets wherever the camera puts them (camera, angles, distance, a
 * zero-padded counter, a striped progress bar, the docked part count and a
 * timecode), easing onto the logo's box as it locks and always kept inside
 * a safe area of the frame. Once the mark locks, the brackets sit square on
 * the box and the readout reports the lock.
 *
 * The flat styles get a simpler HUD (drawBlockHud): brackets that open out
 * from the mark and the same counter, bar and status line under it. Both
 * kick their brackets out on a beat and show a level meter while music
 * plays. The text is set in the typeface it is given (the code roll's).
 */

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import { applyTextCase, fontStackFor } from "./engine-fonts";
import { beatKick, drawLevelMeter } from "./engine-logo-audio";
import { projectPoint, type LogoShot, type LogoView } from "./engine-logo-camera";
import type { TypeSettings } from "./engine-settings";
import type { Paint2D } from "./engine-units";

export type CinemaHud = Readonly<{
  /** 0..1 share of the build. */
  build: number;
  cell: number;
  docked: number;
  fade: number;
  frameHeight: number;
  frameWidth: number;
  height: number;
  ink: string;
  left: number;
  locked: boolean;
  parts: number;
  shot: LogoShot;
  /** Seconds since the reveal started. */
  time: number;
  top: number;
  type: TypeSettings;
  width: number;
}>;

type Rect = { bottom: number; left: number; right: number; top: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const pad = (value: number, digits: number) => String(Math.max(0, Math.floor(value))).padStart(digits, "0");
const signed = (value: number, digits: number) =>
  `${value < 0 ? "-" : "+"}${pad(Math.abs(Math.round(value)), digits)}`;

/** The HUD's font at a size, from its typeface. */
const fontOf = (type: TypeSettings, px: number) => `${type.fontWeight} ${px}px ${fontStackFor(type)}`;

/** HUD text sizes for a frame and logo: never smaller than 1.7% of the frame height, so it reads on a phone. */
function textSizes(frameHeight: number, width: number): Readonly<{ size: number; small: number }> {
  const size = Math.max(11, frameHeight * 0.017, width * 0.034);
  return { size, small: Math.max(10, size * 0.8) };
}

/** Corner brackets on the logo plane, `margin` outside the box; returns their screen bounds. */
function drawBrackets(context: Paint2D, view: LogoView, hud: CinemaHud, margin: number): Rect | null {
  const halfW = hud.width / 2 + margin;
  const halfH = hud.height / 2 + margin;
  const arm = Math.min(hud.width, hud.height) * 0.14;
  const bounds: Rect = { bottom: -Infinity, left: Infinity, right: -Infinity, top: Infinity };
  let seen = 0;
  context.beginPath();
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const corner = projectPoint(view, sx * halfW, sy * halfH, 0);
    const across = projectPoint(view, sx * (halfW - arm), sy * halfH, 0);
    const down = projectPoint(view, sx * halfW, sy * (halfH - arm), 0);
    if (!corner || !across || !down) continue;
    context.moveTo(across.x, across.y);
    context.lineTo(corner.x, corner.y);
    context.lineTo(down.x, down.y);
    bounds.left = Math.min(bounds.left, corner.x);
    bounds.right = Math.max(bounds.right, corner.x);
    bounds.top = Math.min(bounds.top, corner.y);
    bounds.bottom = Math.max(bounds.bottom, corner.y);
    seen += 1;
  }
  context.stroke();
  return seen === 4 ? bounds : null;
}

/** A reticle on the aim point: a broken ring that turns, with four ticks. */
function drawReticle(context: Paint2D, view: LogoView, hud: CinemaHud, alpha: number): void {
  if (alpha <= 0.01) return;
  const centre = projectPoint(view, 0, 0, 0);
  if (!centre) return;
  const radius = Math.max(12, hud.cell * 2.2);
  const turn = hud.time * 1.8;
  context.globalAlpha = hud.fade * alpha;
  context.beginPath();
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const start = turn + (quarter * Math.PI) / 2 + 0.25;
    context.moveTo(centre.x + Math.cos(start) * radius, centre.y + Math.sin(start) * radius);
    context.arc(centre.x, centre.y, radius, start, start + Math.PI / 2 - 0.5);
  }
  for (let tick = 0; tick < 4; tick += 1) {
    const angle = (tick * Math.PI) / 2;
    context.moveTo(centre.x + Math.cos(angle) * radius * 1.25, centre.y + Math.sin(angle) * radius * 1.25);
    context.lineTo(centre.x + Math.cos(angle) * radius * 1.75, centre.y + Math.sin(angle) * radius * 1.75);
  }
  context.stroke();
}

/**
 * Where the readouts go: round the brackets as the camera sees them, easing
 * onto the flat box as the mark locks, at least wide enough for the text,
 * and slid inside a safe area 4% in from the frame edges.
 */
function readoutFrame(hud: CinemaHud, seen: Rect | null, flat: Rect, size: number, small: number): Rect {
  const follow = seen && !hud.locked ? 1 - smoothstep(0.78, 1, hud.build) : 0;
  const mix = (a: number, b: number) => a + (b - a) * follow;
  const rect: Rect = seen
    ? { bottom: mix(flat.bottom, seen.bottom), left: mix(flat.left, seen.left), right: mix(flat.right, seen.right), top: mix(flat.top, seen.top) }
    : { ...flat };
  const safe = 0.04 * Math.min(hud.frameWidth, hud.frameHeight);
  const minWidth = size * 22;
  if (rect.right - rect.left < minWidth) {
    const centre = (rect.left + rect.right) / 2;
    rect.left = centre - minWidth / 2;
    rect.right = centre + minWidth / 2;
  }
  if (rect.left < safe) {
    rect.right += safe - rect.left;
    rect.left = safe;
  }
  if (rect.right > hud.frameWidth - safe) {
    rect.left = Math.max(safe, rect.left - (rect.right - (hud.frameWidth - safe)));
    rect.right = hud.frameWidth - safe;
  }
  // Room above for one line of small text, below for the counter and the parts line.
  const topLimit = safe + small * 1.9;
  const bottomLimit = hud.frameHeight - safe - size * 2.75 - small * 0.6;
  if (rect.bottom - rect.top < size * 2) rect.bottom = rect.top + size * 2;
  if (rect.top < topLimit) {
    rect.bottom += topLimit - rect.top;
    rect.top = topLimit;
  }
  if (rect.bottom > bottomLimit) {
    rect.top = Math.max(topLimit, rect.top - (rect.bottom - bottomLimit));
    rect.bottom = bottomLimit;
  }
  return rect;
}

/** A hard-edged striped bar, filled to a share. */
function drawStripedBar(context: Paint2D, left: number, y: number, width: number, size: number, share: number, fade: number): void {
  const stripe = size * 0.5;
  const filled = width * clamp01(share);
  context.globalAlpha = fade * 0.35;
  context.fillRect(left, y - size * 0.35, width, size * 0.7);
  context.globalAlpha = fade;
  context.beginPath();
  for (let x = 0; x < filled; x += stripe * 1.6) {
    context.rect(left + x, y - size * 0.35, Math.min(stripe, filled - x), size * 0.7);
  }
  context.fill();
}

/** The readouts above and below the readout frame. */
function drawReadouts(context: Paint2D, hud: CinemaHud, rect: Rect, size: number, small: number, pulse: AudioPulse): void {
  const { type } = hud;
  const text = (value: string) => applyTextCase(value, type.textCase);
  const { left, right } = rect;
  context.textBaseline = "middle";
  context.font = fontOf(type, small);
  const above = rect.top - small * 1.3;
  const shot = hud.locked ? "LOCK" : `CAM ${pad(hud.shot.index + 1, 2)}  ${hud.shot.label}`;
  const angles = hud.locked
    ? "YAW +000  PIT +000  Z 1.00"
    : `YAW ${signed((hud.shot.yaw * 180) / Math.PI, 3)}  PIT ${signed((hud.shot.pitch * 180) / Math.PI, 3)}  Z ${(
        hud.shot.distance / hud.shot.zoom
      ).toFixed(2)}`;
  context.globalAlpha = hud.fade * 0.85;
  context.textAlign = "left";
  context.fillText(text(shot), left, above);
  context.textAlign = "right";
  context.fillText(text(angles), right, above);

  context.font = fontOf(type, size);
  context.textAlign = "left";
  const below = rect.bottom + size * 1.4;
  context.globalAlpha = hud.fade;
  if (!hud.locked) {
    context.fillText(text(`ASSEMBLING ${pad(hud.build * 100, 3)}%`), left, below);
    const barWidth = Math.min((right - left) * 0.36, right - left - size * 10.5);
    drawStripedBar(context, right - barWidth, below, barWidth, size, hud.build, hud.fade);
  } else {
    const label = text("[ OK ] LOGO LOCKED");
    context.fillText(label, left, below);
    if (Math.floor(hud.time * 2.5) % 2 === 0) {
      const caret = left + context.measureText(label).width + size * 0.4;
      context.fillRect(caret, below - size * 0.5, size * 0.6, size);
    }
  }
  context.font = fontOf(type, small);
  const under = below + size * 1.35;
  context.globalAlpha = hud.fade * 0.7;
  context.fillText(text(`PARTS ${pad(hud.docked, 2)}/${pad(hud.parts, 2)}`), left, under);
  context.textAlign = "right";
  const frames = Math.floor(hud.time * 30);
  context.fillText(text(`T+${pad(frames / 30, 2)}:${pad(frames % 30, 2)}`), right, under);
  drawLevelMeter(context, pulse, (left + right) / 2 - small * 3, under, small, hud.time);
}

export function drawCinemaHud(
  context: Paint2D,
  view: LogoView,
  hud: CinemaHud,
  pulse: AudioPulse = SILENT_PULSE,
): void {
  if (hud.fade <= 0.01) return;
  const rest = Math.max(hud.cell * 2, hud.width * 0.05);
  const share = hud.parts > 0 ? hud.docked / hud.parts : 1;
  // Brackets open wide, then tighten onto the mark as parts dock.
  const open = easeOutCubic(clamp01(hud.build / 0.12));
  const kick = beatKick(pulse, hud.cell);
  const margin = (hud.locked ? rest : rest + (1 - share) * hud.width * 0.28 * open) + kick;
  context.save();
  context.strokeStyle = hud.ink;
  context.fillStyle = hud.ink;
  context.lineWidth = Math.max(2, hud.cell * 0.28);
  context.globalAlpha = hud.fade * open;
  const seen = drawBrackets(context, view, hud, margin);
  context.lineWidth = Math.max(1.5, hud.cell * 0.16);
  drawReticle(context, view, hud, hud.locked ? 0 : 0.8 * open);
  const { size, small } = textSizes(hud.frameHeight, hud.width);
  const tight = rest + kick;
  const flat: Rect = {
    bottom: hud.top + hud.height + tight,
    left: hud.left - tight,
    right: hud.left + hud.width + tight,
    top: hud.top - tight,
  };
  drawReadouts(context, hud, readoutFrame(hud, seen, flat, size, small), size, small, pulse);
  context.restore();
}

export type BlockHud = Readonly<{
  build: number;
  cell: number;
  fade: number;
  frameHeight: number;
  frameWidth: number;
  height: number;
  ink: string;
  left: number;
  locked: boolean;
  time: number;
  top: number;
  type: TypeSettings;
  width: number;
}>;

/**
 * The flat styles' HUD: corner brackets that open out from the mark, and a
 * readout under it: a zero-padded counter and a hard-edged striped progress
 * bar while it builds, then a status line and a blinking block cursor. The
 * readout stays inside the frame's safe area.
 */
export function drawBlockHud(context: Paint2D, hud: BlockHud, pulse: AudioPulse = SILENT_PULSE): void {
  const { cell, height, left, top, type, width } = hud;
  const margin = Math.max(cell * 2, width * 0.05) + beatKick(pulse, cell);
  const open = easeOutCubic(clamp01(hud.build / 0.2));
  const centreX = left + width / 2;
  const centreY = top + height / 2;
  const arm = Math.min(width, height) * 0.14;
  context.save();
  context.globalAlpha = hud.fade;
  context.strokeStyle = hud.ink;
  context.fillStyle = hud.ink;
  context.lineWidth = Math.max(2, cell * 0.28);
  context.beginPath();
  for (const [x, y, sx, sy] of [
    [left - margin, top - margin, 1, 1],
    [left + width + margin, top - margin, -1, 1],
    [left - margin, top + height + margin, 1, -1],
    [left + width + margin, top + height + margin, -1, -1],
  ] as const) {
    const cx = centreX + (x - centreX) * open;
    const cy = centreY + (y - centreY) * open;
    context.moveTo(cx + sx * arm * open, cy);
    context.lineTo(cx, cy);
    context.lineTo(cx, cy + sy * arm * open);
  }
  context.stroke();

  const { size } = textSizes(hud.frameHeight, width);
  const safe = 0.04 * Math.min(hud.frameWidth, hud.frameHeight);
  const baseline = Math.min(top + height + margin + size * 1.4, hud.frameHeight - safe - size * 0.6);
  const textLeft = Math.max(safe, left - margin);
  const textRight = Math.min(hud.frameWidth - safe, Math.max(left + width + margin, textLeft + size * 20));
  const text = (value: string) => applyTextCase(value, type.textCase);
  context.font = fontOf(type, size);
  context.textAlign = "left";
  context.textBaseline = "middle";
  if (!hud.locked) {
    context.fillText(text(`ASSEMBLING ${pad(hud.build * 100, 3)}%`), textLeft, baseline);
    const barWidth = Math.min((textRight - textLeft) * 0.36, textRight - textLeft - size * 10.5);
    drawStripedBar(context, textRight - barWidth, baseline, barWidth, size, hud.build, hud.fade);
  } else {
    const label = text("[ OK ] LOGO LOCKED");
    context.fillText(label, textLeft, baseline);
    if (Math.floor(hud.time * 2.5) % 2 === 0) {
      const caret = textLeft + context.measureText(label).width + size * 0.4;
      context.fillRect(caret, baseline - size * 0.5, size * 0.6, size);
    }
    drawLevelMeter(context, pulse, textRight - size * 6.5, baseline, size * 0.8, hud.time);
  }
  context.restore();
}
