/**
 * The cinematic logo reveal. The logo is cut into parts that fly in from
 * different directions and depths, tumbling, and dock one after another on
 * a beat: each dock punches the part into the plane and throws a shockwave
 * ring, sparks and a jolt of camera shake. The biggest part lands first as
 * the anchor; the last part slams in and locks the mark with a flash, a
 * bright scan that resolves the blocks into the crisp logo, and a bigger
 * ring, and the mark punches up a few percent and settles. A virtual camera
 * works a shot list round it (see engine-logo-camera), over a perspective
 * floor grid, with debris and speed streaks for pace, hard cuts that glitch
 * for a frame or two and motion smear while it whips. The choreography of
 * the parts lives in engine-logo-cinema-plan.
 *
 * With music, each beat jolts the camera, kicks the HUD out, flashes the
 * frame and sends a thin ring across the logo plane while it builds; once it
 * locks, beats pop an echo off the mark. The bass lifts a bed of matrix dots
 * behind it and the floor grid, and the highs sparkle round its outline.
 *
 * Every frame is a pure function of the build share, the sequence time and
 * the audio pulse.
 */

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import type { LogoArt } from "./engine-logo-art";
import { beatLevel, beatShake, drawBassBed, drawBeatEcho, drawHighGlints } from "./engine-logo-audio";
import {
  cutTimesFor,
  lockDistance,
  projectPoint,
  shotAt,
  viewFor,
  type LogoBox,
  type LogoCameraMode,
  type LogoShot,
  type LogoView,
} from "./engine-logo-camera";
import {
  cutJump,
  drawCutGlitch,
  drawDebris,
  drawFloor,
  drawImpact,
  drawPowerOn,
  drawShockRing,
  shakeOf,
  type Impact,
} from "./engine-logo-fx";
import { anchorFocus, impactsAt, planParts, SCAN_SECONDS, type CinemaMoment } from "./engine-logo-cinema-plan";
import { drawCinemaHud } from "./engine-logo-hud";
import { logoPartsFor, type LogoParts } from "./engine-logo-parts";
import type { LogoParticle } from "./engine-logo-particles";
import { drawPartStreaks, drawVoxelParts, POSE_STRIDE, type VoxelScene } from "./engine-logo-voxels";
import type { TypeSettings } from "./engine-settings";
import type { Paint2D } from "./engine-units";

export type CinemaSettings = Readonly<{
  camera: LogoCameraMode;
  /** Extrusion as a share of the block size (0..6). */
  depth: number;
  floor: boolean;
  hud: boolean;
  /** 0..1: flash, shake, rings and sparks. */
  impact: number;
  ink: string;
  particle: LogoParticle;
  parts: number;
  streaks: boolean;
  /** 0..1.5: how far the camera turns from square on. */
  swing: number;
  tint: boolean;
  /** The HUD's typeface. */
  type: TypeSettings;
}>;

export { anchorFocus, dockShare, planParts, SCAN_SECONDS, type CinemaMoment } from "./engine-logo-cinema-plan";

/** Seconds the locked mark takes to settle from its scale punch. */
const PUNCH_SECONDS = 0.15;
/** The most the docking, cut and beat flashes may add up to in one frame; the lock flash may go higher. */
const FLASH_CAP = 0.35;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;


function hexToRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  if (!Number.isFinite(value)) return "255,255,255";
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

type Stage = Readonly<{
  art: LogoArt;
  box: LogoBox;
  crisp: OffscreenCanvas | null;
  frame: Readonly<{ height: number; width: number }>;
  logo: CinemaSettings;
  moment: CinemaMoment;
  parts: LogoParts;
  pulse: AudioPulse;
}>;

/** How much bigger the mark is than its box in the instant after it locks: a punch that settles fast. */
function lockPunch(stage: Stage): number {
  const { moment } = stage;
  if (!moment.live || moment.sinceLock < 0 || moment.sinceLock >= PUNCH_SECONDS) return 1;
  return 1 + 0.04 * Math.min(1, stage.logo.impact * 1.4) * (1 - moment.sinceLock / PUNCH_SECONDS) ** 2;
}

/** The lock: blocks below a bright scanline, the crisp logo above it. */
function drawLock(context: Paint2D, stage: Stage, scene: VoxelScene, shakeX: number, shakeY: number): void {
  const { box, crisp, moment } = stage;
  const scan = clamp01(moment.sinceLock / SCAN_SECONDS);
  const eased = scan < 0.5 ? 2 * scan * scan : 1 - (-2 * scan + 2) ** 2 / 2;
  const pad = box.cell * 2;
  const line = box.top - pad + (box.height + pad * 2) * eased;
  const alpha = moment.fade;
  const punch = lockPunch(stage);
  context.save();
  if (punch !== 1) {
    // Scaled about the box centre, so the mark settles back onto its box exactly.
    context.translate(box.centreX + shakeX, box.centreY + shakeY);
    context.scale(punch, punch);
    context.translate(-box.centreX - shakeX, -box.centreY - shakeY);
  }
  if (scan < 1) {
    context.save();
    context.beginPath();
    context.rect(-stage.frame.width, line + shakeY, stage.frame.width * 3, stage.frame.height * 2);
    context.clip();
    drawVoxelParts(context, scene, () => alpha);
    context.restore();
  }
  if (crisp && line > box.top) {
    context.save();
    context.beginPath();
    context.rect(box.left - pad + shakeX, box.top - pad + shakeY, box.width + pad * 2, line - box.top + pad);
    context.clip();
    context.globalAlpha = alpha;
    context.drawImage(crisp, box.left + shakeX, box.top + shakeY, box.width, box.height);
    context.restore();
  }
  if (scan < 1) {
    // The scan: a hard bright line with a glow trailing above it.
    const glow = context.createLinearGradient(0, line - box.cell * 6, 0, line);
    const rgb = hexToRgb(stage.logo.ink);
    glow.addColorStop(0, `rgba(${rgb},0)`);
    glow.addColorStop(1, `rgba(${rgb},0.45)`);
    context.globalAlpha = alpha;
    context.fillStyle = glow;
    context.fillRect(box.left - pad + shakeX, line - box.cell * 6, box.width + pad * 2, box.cell * 6);
    context.fillStyle = stage.logo.ink;
    context.fillRect(box.left - pad * 2 + shakeX, line - box.cell * 0.22, box.width + pad * 4, box.cell * 0.44);
  } else {
    // Held: a faint scanline keeps passing over the mark.
    const sweep = (((moment.sinceLock - SCAN_SECONDS) / 2.5) % 1 + 1) % 1;
    context.globalAlpha = 0.14 * alpha;
    context.fillStyle = stage.logo.ink;
    context.fillRect(box.left, box.top + sweep * box.height, box.width, Math.max(1, box.cell * 0.5));
  }
  context.restore();
  // The music answers the locked mark once the scan has passed.
  const settled = alpha * clamp01(scan * 2 - 1);
  drawBeatEcho(context, box, crisp, stage.pulse, settled);
  drawHighGlints(context, box, stage.art, stage.logo.ink, stage.pulse, moment.sinceStart, settled);
}

/**
 * Flashes of ink over the frame. The lock is one near-white frame that dies
 * away in a few more; each dock adds a short pop. Docks and beats together
 * never go past FLASH_CAP, and a beat only flashes when nothing else is.
 */
function drawFlashes(context: Paint2D, stage: Stage, impacts: readonly Impact[], cutting: boolean): void {
  const strength = stage.logo.impact;
  let docks = 0;
  let lock = 0;
  for (const impact of impacts) {
    if (impact.weight > 1) {
      const peak = 0.85 * Math.min(1, strength * 1.25);
      lock = impact.age < 1 / 30 ? peak : peak * Math.exp(-(impact.age - 1 / 30) / 0.06);
    } else if (impact.age < 0.09) {
      docks += 0.12 * strength * (1 - impact.age / 0.09) ** 2;
    }
  }
  let flash = Math.min(FLASH_CAP, docks);
  if (flash <= 0 && !cutting && stage.moment.live && stage.moment.sinceLock < 0) {
    flash = Math.min(FLASH_CAP, 0.09 * beatLevel(stage.pulse) ** 2);
  }
  flash = Math.max(flash, lock);
  if (flash <= 0.004) return;
  context.globalAlpha = flash * stage.moment.fade;
  context.fillStyle = stage.logo.ink;
  context.fillRect(0, 0, stage.frame.width, stage.frame.height);
}

const NO_CUT = { age: -1, seed: 0 } as const;

/** The latest hard cut of the Cuts camera and how long ago it played; rewinding, as the rewind crosses it. */
function cutOf(stage: Stage): Readonly<{ age: number; seed: number }> {
  const { moment } = stage;
  if (stage.logo.camera !== "cuts" || moment.sinceLock >= 0) return NO_CUT;
  const cuts = cutTimesFor(moment.buildSeconds);
  if (moment.rewindSeconds > 0) {
    for (let index = 0; index < cuts.length; index += 1) {
      if (cuts[index] >= moment.build) return { age: (cuts[index] - moment.build) * moment.rewindSeconds, seed: index + 3 };
    }
    return NO_CUT;
  }
  if (!moment.live) return NO_CUT;
  const elapsed = moment.build * moment.buildSeconds;
  for (let index = cuts.length - 1; index >= 0; index -= 1) {
    const age = elapsed - cuts[index] * moment.buildSeconds;
    if (age >= 0) return { age, seed: index + 3 };
  }
  return NO_CUT;
}

/** The logo's box as the camera sees it: centred where the mark's centre lands, scaled by its depth. */
function seenBox(box: LogoBox, view: LogoView): LogoBox {
  const centre = projectPoint(view, 0, 0, 0);
  if (!centre) return box;
  const scale = Math.min(4, view.focal / centre.depth);
  const width = box.width * scale;
  const height = box.height * scale;
  const left = centre.x - width / 2;
  const top = centre.y - height / 2;
  return { ...box, centreX: centre.x, centreY: centre.y, height, left, top, width };
}

/** Camera shake from docking impacts plus, while it builds, the latest beat. */
function shakeFor(stage: Stage, impacts: readonly Impact[], locked: boolean): Readonly<{ x: number; y: number }> {
  const shake = shakeOf(impacts, stage.logo.impact, stage.box.cell);
  if (locked || !stage.moment.live) return shake;
  const beat = beatShake(stage.pulse, stage.box.cell);
  if (beat.x === 0 && beat.y === 0) return shake;
  return { x: shake.x + beat.x, y: shake.y + beat.y };
}

/** A thin ring across the logo plane on each beat while it builds. */
function drawBeatRing(context: Paint2D, stage: Stage, view: LogoView, locked: boolean): void {
  const beat = beatLevel(stage.pulse);
  if (beat <= 0.02 || locked || !stage.moment.live) return;
  const ring: Impact = {
    age: stage.pulse.beatAge,
    cx: 0,
    cy: 0,
    reach: Math.max(stage.box.width, stage.box.height) * 0.32,
    seed: stage.pulse.beatIndex + 61,
    weight: 1,
  };
  context.strokeStyle = stage.logo.ink;
  drawShockRing(context, view, ring, Math.min(1, beat) * 0.75 * stage.moment.fade, stage.box.cell);
}

/**
 * How hard the camera is turning: 0 when steady, up to 1 in the middle of a
 * whip, from the change of angle over the last frame (never across a cut).
 */
function smearOf(shot: LogoShot, before: LogoShot): number {
  if (before.index !== shot.index) return 0;
  const turn = Math.abs(shot.yaw - before.yaw) + Math.abs(shot.pitch - before.pitch);
  return clamp01((turn - 1.5 * DEG) / (6 * DEG));
}

/** Motion smear while the camera whips: a ghost of the mark from a frame ago, and trails between the two. */
function drawWhipSmear(context: Paint2D, scene: VoxelScene, ghost: LogoView, smear: number, fade: number): void {
  if (smear <= 0.01) return;
  const blur: VoxelScene = { ...scene, view: ghost };
  drawVoxelParts(context, blur, (part) => (scene.poses[part * POSE_STRIDE + 12] < 0 ? 0 : 0.3 * smear * fade));
  drawPartStreaks(context, scene, scene.poses, 1.6 * smear * fade, ghost);
}

export function drawCinematicLogo(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  box: LogoBox,
  logo: CinemaSettings,
  art: LogoArt,
  crisp: OffscreenCanvas | null,
  moment: CinemaMoment,
  pulse: AudioPulse = SILENT_PULSE,
): void {
  const parts = logoPartsFor(art, logo.parts);
  const stage: Stage = { art, box, crisp, frame, logo, moment, parts, pulse };
  const locked = moment.sinceLock >= 0;
  const u = locked ? 1 : clamp01(moment.build);
  const lock = lockDistance(box.width, box.height);
  const impacts = impactsAt(parts, box, moment);
  const shake = shakeFor(stage, impacts, locked);
  const cut = cutOf(stage);
  const jump = cutJump(cut.age, cut.seed, frame.width);
  const focus = anchorFocus(parts, box);
  const shot = shotAt(logo.camera, u, logo.swing, focus, moment.buildSeconds);
  const ox = box.centreX + shake.x + jump;
  const oy = box.centreY + shake.y;
  const view: LogoView = viewFor(shot, lock, box.width, ox, oy);
  const depth = locked ? 0 : logo.depth * box.cell * (1 - smoothstep(0.84, 1, u));
  const poses = planParts(parts, box, logo, lock, u, moment.buildSeconds, logo.impact);
  const scene: VoxelScene = {
    art,
    bold: true,
    box,
    depth,
    frame,
    ink: logo.ink,
    parts,
    particle: logo.particle,
    poses,
    tick: Math.floor(moment.sinceStart * 20),
    tint: logo.tint,
    view,
  };
  const frameAgo = 1 / 30 / Math.max(1e-3, moment.buildSeconds);
  const before = shotAt(logo.camera, Math.max(0, u - frameAgo), logo.swing, focus, moment.buildSeconds);
  const smear = locked ? 0 : smearOf(shot, before);

  context.save();
  drawBassBed(context, seenBox(box, view), logo.ink, pulse, moment.fade);
  const lift = 1 + 0.8 * Math.min(1, pulse.bass);
  const floorFade = logo.floor ? (1 - smoothstep(0.8, 1, u)) * moment.fade * lift : 0;
  drawFloor(context, view, box, logo.ink, floorFade, lock * Math.max(1.4, shot.distance + 0.4));
  const streaming = logo.streaks && !locked ? (1 - smoothstep(0.7, 0.95, u)) * moment.fade : 0;
  drawDebris(context, view, box, logo.ink, moment.sinceStart, streaming, lock);
  if (logo.streaks && !locked) {
    const trail = planParts(parts, box, logo, lock, Math.max(0, u - 0.05), moment.buildSeconds, 0);
    drawPartStreaks(context, scene, trail, moment.fade);
  }
  drawWhipSmear(context, scene, viewFor(before, lock, box.width, ox, oy), smear, moment.fade);
  if (locked) drawLock(context, stage, scene, shake.x, shake.y);
  else {
    // Parts fade in over the first moment of their flight.
    drawVoxelParts(context, scene, (part) => {
      const flight = poses[part * POSE_STRIDE + 12];
      return flight < 0 ? 0 : Math.min(1, flight * 6) * moment.fade;
    });
  }
  for (const impact of impacts) drawImpact(context, view, impact, logo.ink, logo.impact * moment.fade, box.cell);
  drawBeatRing(context, stage, view, locked);
  drawFlashes(context, stage, impacts, cut.age >= 0 && cut.age < 0.075);
  drawCutGlitch(context, frame, logo.ink, cut.age, cut.seed, logo.impact);
  if (moment.live && !locked) {
    drawPowerOn(context, frame, view, logo.ink, moment.sinceStart, logo.impact * moment.fade);
  }
  if (logo.hud) {
    const docked = parts.rankPart.reduce(
      (sum, part) => sum + (poses[part * POSE_STRIDE + 12] >= 1 ? 1 : 0),
      0,
    );
    drawCinemaHud(
      context,
      view,
      {
        build: u,
        cell: box.cell,
        docked,
        fade: moment.fade,
        frameHeight: frame.height,
        frameWidth: frame.width,
        height: box.height,
        ink: logo.ink,
        left: box.left + shake.x,
        locked,
        parts: parts.count,
        shot,
        time: moment.sinceStart,
        top: box.top + shake.y,
        type: logo.type,
        width: box.width,
      },
      pulse,
    );
  }
  context.restore();
}

/** The locked HUD on its own, fading out, for departures the flat path draws. */
export function drawCinematicHudOnly(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  box: LogoBox,
  logo: CinemaSettings,
  art: LogoArt,
  fade: number,
  sinceStart: number,
  pulse: AudioPulse = SILENT_PULSE,
): void {
  if (!logo.hud) return;
  const parts = logoPartsFor(art, logo.parts);
  const shot = shotAt(logo.camera, 1, logo.swing);
  const view = viewFor(shot, lockDistance(box.width, box.height), box.width, box.centreX, box.centreY);
  drawCinemaHud(
    context,
    view,
    {
      build: 1,
      cell: box.cell,
      docked: parts.count,
      fade,
      frameHeight: frame.height,
      frameWidth: frame.width,
      height: box.height,
      ink: logo.ink,
      left: box.left,
      locked: true,
      parts: parts.count,
      shot,
      time: sinceStart,
      top: box.top,
      type: logo.type,
      width: box.width,
    },
    pulse,
  );
}
