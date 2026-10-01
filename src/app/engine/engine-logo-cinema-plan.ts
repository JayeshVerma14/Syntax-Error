/**
 * The choreography of the cinematic logo reveal: when each part launches
 * and docks, where it starts relative to the camera, how it tumbles, and the
 * impacts its docking throws. The biggest part slams in first as the anchor,
 * straight past the lens; the next parts follow close behind at staggered
 * depths, then the gaps widen toward the lock. Each part decelerates hard,
 * overshoots its dock by a cell or two and snaps back on the impact frame.
 *
 * Every pose is a pure function of the build share.
 */

import type { LogoBox, LogoCameraMode, LogoView } from "./engine-logo-camera";
import { shotAt, viewFor } from "./engine-logo-camera";
import { IMPACT_SECONDS, type Impact } from "./engine-logo-fx";
import type { LogoParts } from "./engine-logo-parts";
import { POSE_STRIDE } from "./engine-logo-voxels";

export type CinemaMoment = Readonly<{
  /** Build share shown, 0..1 (runs backwards for the reverse departure). */
  build: number;
  /** Seconds the build lasts. */
  buildSeconds: number;
  /** 0..1 opacity of the whole reveal. */
  fade: number;
  /** Whether impacts play (off while rewinding). */
  live: boolean;
  /** Seconds the rewind takes to run the whole build backwards, or 0 going forward. */
  rewindSeconds: number;
  /** Seconds since the build finished, or negative while building. */
  sinceLock: number;
  /** Seconds since the reveal started. */
  sinceStart: number;
}>;

const FIRST_DOCK = 0.12;
const LAST_DOCK = 0.78;
/** Above 1, docks come thick and fast early, then the gaps widen toward the lock. */
const DOCK_SPREAD = 1.2;
const FLIGHT = 0.26;
const LOCK_FLIGHT = 0.3;
/** Seconds the lock scan takes to resolve the blocks into the crisp logo. */
export const SCAN_SECONDS = 0.38;
/** Seconds a cinematic lock needs before a departure: its scan, ring and sparks all finish. */
export const LOCK_SETTLE_SECONDS = Math.max(SCAN_SECONDS, IMPACT_SECONDS * 1.3);
/** Seconds of the pull-back before a part launches. */
const ANTICIPATION = 0.05;
/** Share of the flight after which a part punches past its dock and snaps back. */
const PUNCH_FROM = 0.72;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 307, 2_654_435_761) ^ Math.imul(salt + 11, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

/** Build share at which the part of this rank docks; the last one docks at the lock. */
export function dockShare(rank: number, count: number): number {
  if (count <= 1 || rank >= count - 1) return 1;
  const r = count > 2 ? rank / (count - 2) : 0;
  return FIRST_DOCK + (LAST_DOCK - FIRST_DOCK) * r ** DOCK_SPREAD;
}

/** Build share at which the part of this rank leaves its start. */
function launchShare(rank: number, count: number): number {
  const dock = dockShare(rank, count);
  if (rank === 0) return 0;
  return Math.max(0.025 * rank, dock - (rank >= count - 1 ? LOCK_FLIGHT : FLIGHT));
}

/** How a part arrives: out of the depth, rushing past the lens, or sliding in from a side. */
type Approach = "depth" | "lens" | "side";

function approachOf(rank: number, count: number, mode: LogoCameraMode): Approach {
  if (mode === "fly") return "lens";
  // The Cuts anchor tears past the lens of the close pass, so the first hit fills the frame.
  if (rank === 0) return mode === "cuts" ? "lens" : "depth";
  if (rank === count - 1) return "lens";
  return (["depth", "side", "lens"] as const)[rank % 3];
}

/**
 * Where a part starts relative to its docked place, and how it tumbles:
 * [x, y, z, axis x, axis y, axis z, turn]. Starts are placed against the
 * camera at launch, so every shot sees parts rush past it.
 */
function launchOf(
  rank: number,
  count: number,
  dockX: number,
  dockY: number,
  box: LogoBox,
  lock: number,
  camera: LogoView,
  mode: LogoCameraMode,
): number[] {
  const approach = approachOf(rank, count, mode);
  const side = hash(rank, 1) < 0.5 ? -1 : 1;
  const lift = hash(rank, 2) - 0.5;
  let x: number;
  let y: number;
  let z: number;
  if (approach === "lens") {
    // Just beside the lens (behind it in a fly-through), so it sweeps across the frame.
    const ahead = mode === "fly" ? -0.25 * lock : rank === 0 ? 0.08 * lock : 0.16 * lock;
    const across = side * lock * (rank === 0 ? 0.12 : 0.2 + 0.1 * hash(rank, 3));
    const down = lift * lock * 0.24;
    x = camera.x + camera.wx * ahead + camera.rx * across + camera.ux * down - dockX;
    y = camera.y + camera.wy * ahead + camera.ry * across + camera.uy * down - dockY;
    z = camera.z + camera.wz * ahead + camera.rz * across + camera.uz * down;
  } else if (approach === "side") {
    const across = side * box.width * (1.7 + 0.5 * hash(rank, 3));
    const back = box.width * 0.5;
    x = camera.rx * across + camera.wx * back + camera.ux * lift * box.width * 0.8;
    y = camera.ry * across + camera.wy * back + camera.uy * lift * box.width * 0.8;
    z = camera.rz * across + camera.wz * back + camera.uz * lift * box.width * 0.8;
  } else {
    // Out of the depth behind the mark, arcing in from one side, each from its own distance.
    const back = box.width * (rank === 0 ? 1.4 : 1.2 + 0.8 * rank * hash(rank, 3));
    const across = side * box.width * (rank === 0 ? 0.7 : 1.1);
    x = camera.wx * back + camera.rx * across + camera.ux * lift * box.width;
    y = camera.wy * back + camera.ry * across + camera.uy * lift * box.width;
    z = camera.wz * back + camera.rz * across + camera.uz * lift * box.width;
  }
  const ax = hash(rank, 5) - 0.5;
  const ay = hash(rank, 6) - 0.5;
  const az = (hash(rank, 7) - 0.5) * 0.6;
  const norm = Math.hypot(ax, ay, az) || 1;
  const spin = approach === "lens" ? 0.35 + 0.3 * hash(rank, 8) : 0.6 + 0.6 * hash(rank, 8);
  const turn = spin * Math.PI * (hash(rank, 9) < 0.5 ? -1 : 1);
  return [x, y, z, ax / norm, ay / norm, az / norm, turn];
}

/** Where the anchor part docks, in logo widths from the centre: the first shot frames it. */
export function anchorFocus(parts: LogoParts, box: LogoBox): Readonly<{ x: number; y: number }> {
  if (parts.count === 0) return { x: 0, y: 0 };
  const part = parts.rankPart[0];
  return {
    x: (parts.centres[part * 4] * box.cell - box.width / 2) / box.width,
    y: (parts.centres[part * 4 + 1] * box.cell - box.height / 2) / box.width,
  };
}

/**
 * How far along its path a part still has to go (1 at launch, 0 docked):
 * a short pull-back, then a hard deceleration into the dock.
 */
function leftOf(flight: number, flightSeconds: number): number {
  if (flight < 0) return 1;
  const pull = ANTICIPATION / Math.max(0.05, flightSeconds);
  if (flight < pull) return 1 + 0.03 * Math.sin((Math.PI * flight) / pull);
  return (1 - (flight - pull) / (1 - pull)) ** 2.4;
}

/** The punch past the dock late in the flight: up and back to 0 exactly as it docks. */
function punchOf(flight: number): number {
  if (flight <= PUNCH_FROM || flight >= 1) return 0;
  return Math.sin((Math.PI * (flight - PUNCH_FROM)) / (1 - PUNCH_FROM));
}

/**
 * Every part's pose at build share `u`: rotation, origin, flight progress
 * (-1 before launch, 1 once docked) and seconds since docking (-1 before).
 */
export function planParts(
  parts: LogoParts,
  box: LogoBox,
  logo: Readonly<{ camera: LogoCameraMode; impact: number; swing: number }>,
  lock: number,
  u: number,
  buildSeconds: number,
  impact: number,
): Float64Array {
  const poses = new Float64Array(parts.count * POSE_STRIDE);
  const focus = anchorFocus(parts, box);
  for (let rank = 0; rank < parts.count; rank += 1) {
    const part = parts.rankPart[rank];
    const o = part * POSE_STRIDE;
    const cx = parts.centres[part * 4] * box.cell - box.width / 2;
    const cy = parts.centres[part * 4 + 1] * box.cell - box.height / 2;
    const launch = launchShare(rank, parts.count);
    const dock = dockShare(rank, parts.count);
    const flight = u < launch ? -1 : Math.min(1, (u - launch) / Math.max(1e-6, dock - launch));
    const shot = shotAt(logo.camera, launch, logo.swing, focus, buildSeconds);
    const camera = viewFor(shot, lock, box.width, 0, 0);
    const [sx, sy, sz, kx, ky, kz, turn] = launchOf(rank, parts.count, cx, cy, box, lock, camera, logo.camera);
    const left = leftOf(flight, (dock - launch) * buildSeconds);
    // Overshoot along the direction of travel by a cell and a half, snapping back on the dock.
    const reach = Math.hypot(sx, sy, sz) || 1;
    const punch = (punchOf(flight) * box.cell * 1.6) / reach;
    const angle = turn * Math.max(0, left);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const c1 = 1 - cos;
    poses.set(
      [
        cos + kx * kx * c1,
        kx * ky * c1 - kz * sin,
        kx * kz * c1 + ky * sin,
        ky * kx * c1 + kz * sin,
        cos + ky * ky * c1,
        ky * kz * c1 - kx * sin,
        kz * kx * c1 - ky * sin,
        kz * ky * c1 + kx * sin,
        cos + kz * kz * c1,
      ],
      o,
    );
    const age = u >= dock ? (u - dock) * buildSeconds : -1;
    // Docking punches the part into the plane, and it springs back.
    const recoil = age >= 0 && age < 0.4 ? impact * box.cell * 2.4 * Math.exp(-age * 15) * Math.sin(age * 44) : 0;
    poses[o + 9] = cx + sx * (left - punch);
    poses[o + 10] = cy + sy * (left - punch);
    poses[o + 11] = sz * (left - punch) + recoil;
    poses[o + 12] = flight;
    poses[o + 13] = age;
  }
  return poses;
}

/** Impacts still playing at a moment: one per docked part, the last one weighted as the lock. */
export function impactsAt(parts: LogoParts, box: LogoBox, moment: CinemaMoment): Impact[] {
  if (!moment.live) return [];
  const impacts: Impact[] = [];
  const elapsed = clamp01(moment.build) * moment.buildSeconds + Math.max(0, moment.sinceLock);
  for (let rank = 0; rank < parts.count; rank += 1) {
    const part = parts.rankPart[rank];
    const age = elapsed - dockShare(rank, parts.count) * moment.buildSeconds;
    if (age < 0 || age > IMPACT_SECONDS * 1.4) continue;
    const lock = rank === parts.count - 1;
    impacts.push({
      age,
      cx: lock ? 0 : parts.centres[part * 4] * box.cell - box.width / 2,
      cy: lock ? 0 : parts.centres[part * 4 + 1] * box.cell - box.height / 2,
      reach: lock ? Math.max(box.width, box.height) * 0.5 : parts.centres[part * 4 + 3] * box.cell,
      seed: rank + 1,
      weight: lock ? 2.2 : 1,
    });
  }
  return impacts;
}
