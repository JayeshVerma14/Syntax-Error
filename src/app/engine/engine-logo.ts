/**
 * The logo reveal: an uploaded logo assembles, locks into its crisp form
 * with a flash, holds, and can leave again. The default Cinematic build
 * flies the logo's parts in through a moving 3D camera (engine-logo-cinema);
 * Dot matrix grows it from a single point as LED dots (engine-logo-dots).
 * The flat styles are other ways a machine might put a mark together:
 * blocks flying in, dropping into place like a printer, a scanline resolving
 * glyph noise, glitching chunks, rows streaking in like sorted pixels,
 * barcode data strips resolving into the mark, or a swarm spiralling in.
 * Every style but Dot matrix can be built from blocks, dots, dashes, glyphs
 * or plus signs. An optional HUD frames it with corner brackets, a counter
 * and a striped progress bar. With music, beats jolt the build and pop an
 * echo off the locked mark, the bass lights a matrix bed behind it and the
 * highs sparkle round its outline (engine-logo-audio).
 *
 * Every frame is a pure function of the sequence time and the audio pulse,
 * so preview, scrubbing and export agree.
 */

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import type { LogoArt } from "./engine-logo-art";
import { beatShake } from "./engine-logo-audio";
import { LOGO_CAMERAS, logoBoxOf, type LogoBox, type LogoCameraMode } from "./engine-logo-camera";
import { drawCinematicHudOnly, drawCinematicLogo, SCAN_SECONDS } from "./engine-logo-cinema";
import { LOCK_SETTLE_SECONDS } from "./engine-logo-cinema-plan";
import { drawDotMatrixLogo } from "./engine-logo-dots";
import { drawFlatLogo, type FlatStyle } from "./engine-logo-flat";
import { drawBlockHud } from "./engine-logo-hud";
import { LOGO_PARTICLES, type LogoParticle } from "./engine-logo-particles";
import type { TypeSettings, VectorPoint } from "./engine-settings";
import type { Paint2D } from "./engine-units";
import {
  readBoolean,
  readHex,
  readNumber,
  readString,
  readVector,
  type Values,
} from "./engine-values";

export const logoTargets = {
  block: "logo.block",
  build: "logo.build",
  camera: "logo.camera",
  delay: "logo.delay",
  depth: "logo.depth",
  enabled: "logo.enabled",
  exit: "logo.exit",
  file: "logo.file",
  floor: "logo.floor",
  hold: "logo.hold",
  hud: "logo.hud",
  impact: "logo.impact",
  ink: "logo.ink",
  particle: "logo.particle",
  parts: "logo.parts",
  position: "logo.position",
  size: "logo.size",
  streaks: "logo.streaks",
  style: "logo.style",
  swing: "logo.swing",
  timing: "logo.timing",
  tint: "logo.tint",
} as const;

export type LogoStyle =
  | "barcode"
  | "build"
  | "cinematic"
  | "dots"
  | "fly"
  | "glitch"
  | "scan"
  | "sort"
  | "swarm";
export type LogoExit = "collapse" | "glitch" | "hold" | "reverse" | "shatter";

export const LOGO_STYLES: readonly LogoStyle[] = [
  "cinematic",
  "dots",
  "fly",
  "build",
  "scan",
  "glitch",
  "sort",
  "barcode",
  "swarm",
];
export const LOGO_EXITS: readonly LogoExit[] = ["hold", "shatter", "reverse", "glitch", "collapse"];

export type LogoSettings = Readonly<{
  /** Starts after the code roll and end text instead of at the loop start. */
  afterText: boolean;
  /** Block size in frame pixels. */
  block: number;
  /** Seconds to assemble. */
  build: number;
  /** Cinematic camera: a shot list with cuts, an orbit, a fly-through, or square on. */
  camera: LogoCameraMode;
  /** Seconds after its start point before it begins. */
  delay: number;
  /** Cinematic extrusion as a multiple of the block size (0..6). */
  depth: number;
  enabled: boolean;
  exit: LogoExit;
  /** Cinematic floor grid under the mark. */
  floor: boolean;
  /** Seconds it holds once locked. */
  hold: number;
  hud: boolean;
  /** 0..1: cinematic docking flash, shake, rings and sparks. */
  impact: number;
  ink: string;
  /** What the blocks are drawn as. */
  particle: LogoParticle;
  /** How many pieces the cinematic and dot-matrix builds cut the logo into. */
  parts: number;
  position: VectorPoint;
  /** 10..100: width as a share of the frame. */
  size: number;
  /** Cinematic debris and speed streaks. */
  streaks: boolean;
  style: LogoStyle;
  /** 0..1.5: how far the cinematic camera turns away from square on. */
  swing: number;
  tint: boolean;
  /** The HUD's typeface: the code roll's, so the readouts match the terminal type. */
  type: TypeSettings;
}>;

/** The HUD's typeface when none is given: the house mono face. */
export const LOGO_HUD_TYPE: TypeSettings = {
  color: "#FFFFFF",
  fontId: "ibm-plex-mono",
  fontSize: 18,
  fontWeight: "600",
  letterSpacing: 0,
  lineHeight: 1.25,
  opacity: 100,
  textCase: "original",
};

/** Reads every logo setting; `type` is the HUD's typeface (pass the code roll's). */
export function readLogo(values: Values, type: TypeSettings = LOGO_HUD_TYPE): LogoSettings {
  return {
    afterText: readString(values, logoTargets.timing, ["after", "start"], "after") === "after",
    block: Math.min(48, Math.max(4, readNumber(values, logoTargets.block, 12))),
    build: Math.min(20, Math.max(0.3, readNumber(values, logoTargets.build, 2.8))),
    camera: readString(values, logoTargets.camera, LOGO_CAMERAS, "cuts"),
    delay: Math.min(20, Math.max(0, readNumber(values, logoTargets.delay, 0.2))),
    depth: Math.min(600, Math.max(0, readNumber(values, logoTargets.depth, 250))) / 100,
    enabled: readBoolean(values, logoTargets.enabled, false),
    exit: readString(values, logoTargets.exit, LOGO_EXITS, "hold"),
    floor: readBoolean(values, logoTargets.floor, true),
    hold: Math.min(20, Math.max(0, readNumber(values, logoTargets.hold, 2.5))),
    hud: readBoolean(values, logoTargets.hud, true),
    impact: Math.min(100, Math.max(0, readNumber(values, logoTargets.impact, 70))) / 100,
    ink: readHex(values, logoTargets.ink, "#FFFFFF"),
    particle: readString(values, logoTargets.particle, LOGO_PARTICLES, "blocks"),
    parts: Math.round(Math.min(16, Math.max(2, readNumber(values, logoTargets.parts, 7)))),
    position: readVector(values, logoTargets.position, { x: 0, y: 0 }),
    size: Math.min(100, Math.max(10, readNumber(values, logoTargets.size, 45))),
    streaks: readBoolean(values, logoTargets.streaks, true),
    style: readString(values, logoTargets.style, LOGO_STYLES, "cinematic"),
    swing: Math.min(150, Math.max(0, readNumber(values, logoTargets.swing, 100))) / 100,
    tint: readBoolean(values, logoTargets.tint, true),
    type,
  };
}

export type LogoSchedule = Readonly<{ built: number; end: number; exitStart: number; start: number }>;

/** When the logo starts, locks, begins to leave and is gone, in sequence seconds. */
export function logoSchedule(logo: LogoSettings, afterSeconds: number): LogoSchedule | null {
  if (!logo.enabled) return null;
  const start = (logo.afterText ? afterSeconds : 0) + logo.delay;
  const built = start + logo.build;
  const cinematic = logo.style === "cinematic";
  // A cinematic lock always gets to finish its scan, ring and sparks before a departure.
  const hold = cinematic && logo.exit !== "hold" ? Math.max(logo.hold, LOCK_SETTLE_SECONDS) : logo.hold;
  const exitStart = built + hold;
  // A cinematic rewind first runs its lock scan backwards.
  const unscan = cinematic && logo.exit === "reverse" ? SCAN_SECONDS : 0;
  const leaving = logo.exit === "hold" ? 0 : Math.min(1.4, Math.max(0.5, logo.build * 0.6)) + unscan;
  return { built, end: exitStart + leaving, exitStart, start };
}

/** The cinematic reverse departure: the lock scan runs back up the mark, then the whole flight rewinds, cuts and all. */
function drawCinematicRewind(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  box: LogoBox,
  logo: LogoSettings,
  art: LogoArt,
  crisp: OffscreenCanvas | null,
  schedule: LogoSchedule,
  time: number,
  pulse: AudioPulse,
): void {
  const buildSeconds = Math.max(1e-3, schedule.built - schedule.start);
  const since = time - schedule.exitStart;
  const rewindSeconds = Math.max(1e-3, schedule.end - schedule.exitStart - SCAN_SECONDS);
  const rewound = Math.min(1, Math.max(0, (since - SCAN_SECONDS) / rewindSeconds));
  const unscanning = since < SCAN_SECONDS;
  const moment = {
    build: unscanning ? 1 : 1 - rewound,
    buildSeconds,
    fade: unscanning ? 1 : 1 - rewound ** 3,
    live: false,
    rewindSeconds: unscanning ? 0 : rewindSeconds,
    sinceLock: unscanning ? SCAN_SECONDS - since : -1,
    sinceStart: time - schedule.start,
  };
  drawCinematicLogo(context, frame, box, logo, art, crisp, moment, pulse);
}

/** The box moved by a beat's jolt; silence leaves it exactly where it was. */
function jolted(box: LogoBox, pulse: AudioPulse): LogoBox {
  const shake = beatShake(pulse, box.cell);
  if (shake.x === 0 && shake.y === 0) return box;
  return {
    ...box,
    centreX: box.centreX + shake.x,
    centreY: box.centreY + shake.y,
    left: box.left + shake.x,
    top: box.top + shake.y,
  };
}

/**
 * Draws the logo reveal at sequence second `time`. `pulse` is the music at
 * this frame; SILENT_PULSE (the default) draws exactly what no pulse does.
 */
export function drawLogo(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  logo: LogoSettings,
  art: LogoArt | null,
  crisp: OffscreenCanvas | null,
  schedule: LogoSchedule | null,
  time: number,
  pulse: AudioPulse = SILENT_PULSE,
): void {
  if (!logo.enabled || !art || art.count === 0 || !schedule || !Number.isFinite(time)) return;
  const leaves = logo.exit !== "hold";
  if (time < schedule.start || (leaves && time >= schedule.end)) return;

  const box = logoBoxOf(frame, logo.size, logo.position, art.aspect, art.cols);
  const buildSeconds = Math.max(1e-3, schedule.built - schedule.start);
  const build = Math.min(1, Math.max(0, (time - schedule.start) / buildSeconds));
  const exiting = leaves && time >= schedule.exitStart;
  const leave = exiting
    ? Math.min(1, Math.max(0, (time - schedule.exitStart) / Math.max(1e-3, schedule.end - schedule.exitStart)))
    : 0;
  const rewinding = exiting && logo.exit === "reverse";
  const building = !exiting && time < schedule.built;

  if (logo.style === "cinematic" && rewinding) {
    drawCinematicRewind(context, frame, box, logo, art, crisp, schedule, time, pulse);
    return;
  }
  if (logo.style === "cinematic" && !exiting) {
    const moment = {
      build,
      buildSeconds,
      fade: 1,
      live: true,
      rewindSeconds: 0,
      sinceLock: time - schedule.built,
      sinceStart: time - schedule.start,
    };
    drawCinematicLogo(context, frame, box, logo, art, crisp, moment, pulse);
    return;
  }
  if (logo.style === "dots" && (rewinding || building)) {
    const shown = rewinding ? 1 - leave : build;
    const moved = building ? jolted(box, pulse) : box;
    drawDotMatrixLogo(context, moved, logo, art, shown, time, 1, pulse);
    if (logo.hud) {
      const hud = {
        build: shown,
        cell: box.cell,
        fade: 1 - leave,
        frameHeight: frame.height,
        frameWidth: frame.width,
        height: box.height,
        ink: logo.ink,
        type: logo.type,
      };
      drawBlockHud(context, { ...hud, left: moved.left, locked: false, time, top: moved.top, width: box.width }, pulse);
    }
    return;
  }
  if (logo.style === "cinematic") {
    // Departures other than rewinding leave from the flat locked logo, under the cinematic HUD.
    drawFlatLogo(context, frame, box, { ...logo, hud: false }, "fly", art, crisp, schedule, time, pulse);
    drawCinematicHudOnly(context, frame, box, logo, art, 1 - leave, time - schedule.start, pulse);
    return;
  }
  // Dot matrix closes into square pixels, so its lock resolves from squares, in a ring from the centre.
  const flat = logo.style === "dots" ? { ...logo, particle: "blocks" as const, ring: true } : logo;
  const style: FlatStyle = logo.style === "dots" ? "fly" : logo.style;
  drawFlatLogo(context, frame, building ? jolted(box, pulse) : box, flat, style, art, crisp, schedule, time, pulse);
}
