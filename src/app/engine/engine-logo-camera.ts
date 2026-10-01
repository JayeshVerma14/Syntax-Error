/**
 * The virtual camera of the cinematic logo reveal. A shot list moves a
 * pinhole camera round the forming mark: Cuts plays three shots (a low close
 * pass, a high side angle, then a whip round to the front and a dolly out),
 * Orbit swings in from a steep side angle, Fly-through rushes in from far
 * away with the parts overtaking the lens, and Front pushes in square on.
 *
 * Every mode ends on the lock pose: square on at the lock distance with a
 * focal length equal to it, so the logo plane (z = 0) lands on the frame
 * exactly where the flat logo sits.
 *
 * World units are frame pixels, centred on the logo: x right, y down, z away
 * from the viewer.
 */

export type LogoCameraMode = "cuts" | "fly" | "front" | "orbit";

export const LOGO_CAMERAS: readonly LogoCameraMode[] = ["cuts", "orbit", "fly", "front"];

export type LogoShot = Readonly<{
  /** Aim point offset in logo widths. */
  aimX: number;
  aimY: number;
  /** When the current shot started, as a share of the build (for cut glitches). */
  cutAt: number;
  /** Camera distance as a multiple of the lock distance. */
  distance: number;
  index: number;
  label: string;
  /** Radians: pitch up is the camera above the mark looking down. */
  pitch: number;
  roll: number;
  yaw: number;
  /** Focal length as a multiple of the lock distance. */
  zoom: number;
}>;

export type LogoView = Readonly<{
  focal: number;
  near: number;
  /** Screen point the aim projects to. */
  ox: number;
  oy: number;
  /** Camera basis: right, down and forward. */
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  wx: number;
  wy: number;
  wz: number;
  /** Camera position. */
  x: number;
  y: number;
  z: number;
}>;

const DEG = Math.PI / 180;
/** Build share at which the Cuts shot list cuts to shots two and three. */
export const CUT_TIMES: readonly number[] = [0.34, 0.64];
/** Seconds of the closing shot's wind-up, and of its whip to the front. */
const WIND_UP = 0.06;
export const WHIP_SECONDS = 0.22;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;

type Pose = Omit<LogoShot, "cutAt" | "index" | "label">;

const LOCK: Pose = { aimX: 0, aimY: 0, distance: 1, pitch: 0, roll: 0, yaw: 0, zoom: 1 };

/** A build shorter than this plays the Cuts camera as its last shot only. */
export const CUTS_MIN_SECONDS = 1.2;

/** Build shares at which the Cuts camera cuts, for a build this long (none for a short one). */
export function cutTimesFor(buildSeconds: number): readonly number[] {
  return buildSeconds < CUTS_MIN_SECONDS ? [] : CUT_TIMES;
}

/**
 * The closing shot: from a readable three-quarter angle, a short wind-up
 * away from the front, then a fast whip round to square on and a dolly out
 * to the lock. `seconds` is the time into the shot, `span` its length.
 */
function whipPose(seconds: number, span: number): Pose {
  const windUp = seconds < WIND_UP ? Math.sin((Math.PI * seconds) / WIND_UP) : 0;
  const whip = easeInOutCubic(clamp01((seconds - WIND_UP * 0.7) / WHIP_SECONDS));
  const dolly = easeOutQuint(clamp01(seconds / Math.max(1e-3, span)));
  return {
    aimX: 0,
    aimY: 0,
    distance: 0.62 + 0.38 * dolly,
    pitch: (10 + 3 * windUp) * (1 - whip) * DEG,
    roll: 6 * (1 - whip) * DEG,
    yaw: (40 + 9 * windUp) * (1 - whip) * DEG,
    zoom: 1.24 - 0.24 * dolly,
  };
}

function cutsPose(
  u: number,
  focusX: number,
  focusY: number,
  buildSeconds: number,
): Readonly<{ index: number; pose: Pose }> {
  const cuts = cutTimesFor(buildSeconds);
  if (cuts.length === 0) return { index: 2, pose: whipPose(u * buildSeconds, buildSeconds) };
  const [first, second] = cuts;
  if (u < first) {
    // A low close pass on the anchor part: under it looking up, trucking sideways.
    const p = u / first;
    return {
      index: 0,
      pose: {
        aimX: focusX * (1 - 0.4 * p) - 0.05 + 0.1 * p,
        aimY: focusY * (1 - 0.4 * p) + 0.03,
        distance: 0.3 + 0.12 * p,
        pitch: (-17 + 5 * p) * DEG,
        roll: (-12 + 6 * p) * DEG,
        yaw: (58 - 22 * p) * DEG,
        zoom: 0.9,
      },
    };
  }
  if (u < second) {
    // A high side angle, pushing in while parts dock.
    const p = (u - first) / (second - first);
    return {
      index: 1,
      pose: {
        aimX: 0.06 - 0.04 * p,
        aimY: -0.02,
        distance: 0.92 - 0.14 * p,
        pitch: (38 - 7 * p) * DEG,
        roll: (6 - 2 * p) * DEG,
        yaw: (-54 + 16 * p) * DEG,
        zoom: 1.02,
      },
    };
  }
  const span = (1 - second) * buildSeconds;
  return { index: 2, pose: whipPose((u - second) * buildSeconds, span) };
}

function orbitPose(u: number): Pose {
  const e = easeInOutCubic(clamp01(u / 0.94));
  const settle = 1 - e;
  return {
    aimX: 0,
    aimY: 0,
    distance: 0.7 + 0.3 * easeOutCubic(clamp01(u / 0.94)),
    pitch: (26 * settle + 6 * Math.sin(u * Math.PI) * settle) * DEG,
    roll: -7 * settle * DEG,
    // Starts well round to the side but never past 70°, so type never reads mirrored.
    yaw: -68 * settle * DEG,
    zoom: 1,
  };
}

function flyPose(u: number): Pose {
  const e = easeOutCubic(clamp01(u / 0.96));
  const settle = 1 - e;
  return {
    aimX: 0.08 * Math.sin(u * 5) * settle,
    aimY: 0,
    distance: 1 + 2.3 * settle,
    pitch: 9 * Math.sin(u * 4 + 0.6) * settle * DEG,
    roll: -14 * Math.sin(u * 3.2 + 0.4) * settle * DEG,
    yaw: 16 * Math.sin(u * 3.6) * settle * DEG,
    zoom: 1,
  };
}

function frontPose(u: number): Pose {
  const e = easeOutCubic(clamp01(u / 0.96));
  return { ...LOCK, distance: 1 + 0.22 * (1 - e), zoom: 1 + 0.22 * (1 - e) * 0.35 };
}

const LABELS: Readonly<Record<LogoCameraMode, readonly string[]>> = {
  cuts: ["LOW PASS", "HIGH ANGLE", "FRONT"],
  fly: ["FLY-THRU"],
  front: ["FRONT"],
  orbit: ["ORBIT"],
};

/**
 * The camera at a share of the build. `swing` (0..1.5) scales how far the
 * angles turn from square on; 0 keeps every mode square on. `focus` is the
 * anchor part's place in logo widths, which the first Cuts shot frames.
 * A Cuts build shorter than CUTS_MIN_SECONDS plays only the closing whip.
 */
export function shotAt(
  mode: LogoCameraMode,
  build: number,
  swing: number,
  focus: Readonly<{ x: number; y: number }> = { x: 0, y: 0 },
  buildSeconds = 2.8,
): LogoShot {
  const u = clamp01(build);
  let index = 0;
  let pose: Pose;
  let cutAt = 0;
  if (mode === "cuts") {
    const cut = cutsPose(u, focus.x, focus.y, buildSeconds);
    const cuts = cutTimesFor(buildSeconds);
    index = cut.index;
    pose = cut.pose;
    cutAt = cuts.length === 0 || index === 0 ? 0 : cuts[index - 1];
  } else if (mode === "orbit") pose = orbitPose(u);
  else if (mode === "fly") pose = flyPose(u);
  else pose = frontPose(u);
  if (u >= 1) pose = LOCK;
  return {
    aimX: pose.aimX * swing,
    aimY: pose.aimY * swing,
    cutAt,
    distance: pose.distance,
    index,
    label: LABELS[mode][index] ?? "FRONT",
    pitch: pose.pitch * swing,
    roll: pose.roll * swing,
    yaw: pose.yaw * swing,
    zoom: pose.zoom,
  };
}

/** The camera distance that frames a logo box of this size at the lock. */
export function lockDistance(width: number, height: number): number {
  return 1.9 * Math.max(width, height * 1.3);
}

/**
 * Camera basis and position for a shot. `ox`/`oy` is where the aim point
 * lands on screen, normally the logo centre (plus any shake).
 */
export function viewFor(
  shot: LogoShot,
  lock: number,
  logoWidth: number,
  ox: number,
  oy: number,
): LogoView {
  const tx = shot.aimX * logoWidth;
  const ty = shot.aimY * logoWidth;
  const distance = shot.distance * lock;
  const cosPitch = Math.cos(shot.pitch);
  const bx = Math.sin(shot.yaw) * cosPitch;
  const by = -Math.sin(shot.pitch);
  const bz = -Math.cos(shot.yaw) * cosPitch;
  // Forward looks back along the offset; right is down × forward.
  const wx = -bx;
  const wy = -by;
  const wz = -bz;
  let rx = wz;
  let rz = -wx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ry = 0;
  // Down = forward × right.
  let ux = wy * rz - wz * ry;
  let uy = wz * rx - wx * rz;
  let uz = wx * ry - wy * rx;
  const cos = Math.cos(shot.roll);
  const sin = Math.sin(shot.roll);
  const rollRx = rx * cos + ux * sin;
  const rollRy = ry * cos + uy * sin;
  const rollRz = rz * cos + uz * sin;
  ux = ux * cos - rx * sin;
  uy = uy * cos - ry * sin;
  uz = uz * cos - rz * sin;
  return {
    focal: shot.zoom * lock,
    near: lock * 0.06,
    ox,
    oy,
    rx: rollRx,
    ry: rollRy,
    rz: rollRz,
    ux,
    uy,
    uz,
    wx,
    wy,
    wz,
    x: tx + bx * distance,
    y: ty + by * distance,
    z: bz * distance,
  };
}

/** Screen position and camera depth of a world point, or null behind the near plane. */
export function projectPoint(
  view: LogoView,
  x: number,
  y: number,
  z: number,
): Readonly<{ depth: number; x: number; y: number }> | null {
  const dx = x - view.x;
  const dy = y - view.y;
  const dz = z - view.z;
  const depth = dx * view.wx + dy * view.wy + dz * view.wz;
  if (depth < view.near) return null;
  const scale = view.focal / depth;
  return {
    depth,
    x: view.ox + (dx * view.rx + dy * view.ry + dz * view.rz) * scale,
    y: view.oy + (dx * view.ux + dy * view.uy + dz * view.uz) * scale,
  };
}

/** Where the flat logo sits on the frame; every style locks into this box. */
export type LogoBox = Readonly<{
  cell: number;
  centreX: number;
  centreY: number;
  height: number;
  left: number;
  top: number;
  width: number;
}>;

/** The logo's box: `size` percent of the frame width, capped at 86% of its height. */
export function logoBoxOf(
  frame: Readonly<{ height: number; width: number }>,
  size: number,
  position: Readonly<{ x: number; y: number }>,
  aspect: number,
  cols: number,
): LogoBox {
  let width = (frame.width * size) / 100;
  let height = width * aspect;
  if (height > frame.height * 0.86) {
    height = frame.height * 0.86;
    width = height / aspect;
  }
  const centreX = ((position.x + 1) / 2) * frame.width;
  const centreY = ((position.y + 1) / 2) * frame.height;
  return {
    cell: width / Math.max(1, cols),
    centreX,
    centreY,
    height,
    left: centreX - width / 2,
    top: centreY - height / 2,
    width,
  };
}
