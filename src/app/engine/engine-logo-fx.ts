/**
 * Set dressing for the cinematic logo reveal: a perspective floor grid under
 * the mark, debris blocks streaming past the lens, and the impact of each
 * docking part (a shockwave ring on the logo plane and a spray of sparks).
 * Everything is projected through the same camera as the logo, so the whole
 * scene turns together, and everything is a pure function of time.
 */

import type { LogoView } from "./engine-logo-camera";
import type { Paint2D } from "./engine-units";

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 307, 2_654_435_761) ^ Math.imul(salt + 11, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

export type SceneBox = Readonly<{ cell: number; height: number; width: number }>;

/**
 * A line-segment drawer bound to one view: clips each world segment at the
 * near plane and appends it to the current path.
 */
function segmentDrawer(context: Paint2D, view: LogoView) {
  const { focal, near, ox, oy, rx, ry, rz, ux, uy, uz, wx, wy, wz } = view;
  return (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number => {
    let ax = x0 - view.x;
    let ay = y0 - view.y;
    let az = z0 - view.z;
    let bx = x1 - view.x;
    let by = y1 - view.y;
    let bz = z1 - view.z;
    const da = ax * wx + ay * wy + az * wz;
    const db = bx * wx + by * wy + bz * wz;
    if (da < near && db < near) return -1;
    if (da < near || db < near) {
      // Slide the hidden end forward to the near plane.
      const t = (near - da) / (db - da);
      const cx = ax + (bx - ax) * t;
      const cy = ay + (by - ay) * t;
      const cz = az + (bz - az) * t;
      if (da < near) {
        ax = cx;
        ay = cy;
        az = cz;
      } else {
        bx = cx;
        by = cy;
        bz = cz;
      }
    }
    const za = Math.max(near, ax * wx + ay * wy + az * wz);
    const zb = Math.max(near, bx * wx + by * wy + bz * wz);
    context.moveTo(ox + ((ax * rx + ay * ry + az * rz) * focal) / za, oy + ((ax * ux + ay * uy + az * uz) * focal) / za);
    context.lineTo(ox + ((bx * rx + by * ry + bz * rz) * focal) / zb, oy + ((bx * ux + by * uy + bz * uz) * focal) / zb);
    return (za + zb) / 2;
  };
}

/**
 * A floor of grid lines under the mark, fading with distance. `reach` is
 * how far out in front of the logo the floor runs, in frame units.
 */
export function drawFloor(
  context: Paint2D,
  view: LogoView,
  box: SceneBox,
  ink: string,
  opacity: number,
  reach: number,
): void {
  if (opacity <= 0.01) return;
  const floorY = box.height / 2 + Math.max(box.cell * 4, box.height * 0.36);
  const spacing = Math.max(box.width, box.height) / 5;
  const half = Math.ceil((box.width * 2.6) / spacing) * spacing;
  const nearZ = -Math.ceil(reach / spacing) * spacing;
  const farZ = Math.ceil((box.width * 5) / spacing) * spacing;
  const segment = segmentDrawer(context, view);
  const lock = view.focal;
  // Seen at a grazing angle the grid packs into a solid band, so it fades out.
  const grazing = Math.min(1, Math.max(0, (floorY - view.y) / (lock * 0.3)));
  if (grazing <= 0.01) return;
  context.strokeStyle = ink;
  context.lineWidth = Math.max(1, box.cell * 0.09);
  // Three bands by distance, each one stroke: nearer lines are brighter.
  const bands = [0.34, 0.2, 0.09];
  for (let band = 0; band < bands.length; band += 1) {
    context.beginPath();
    const inBand = (depth: number) => {
      const tier = depth < lock * 1.1 ? 0 : depth < lock * 2.2 ? 1 : 2;
      return tier === band;
    };
    for (let z = nearZ; z <= farZ; z += spacing) {
      for (let x = -half; x < half; x += spacing * 2) {
        // Cross lines are split into short runs so each run takes its own band.
        const depth = (z - view.z) * view.wz + (x + spacing - view.x) * view.wx + (floorY - view.y) * view.wy;
        if (!inBand(depth)) continue;
        segment(x, floorY, z, x + spacing * 2, floorY, z);
      }
    }
    for (let x = -half; x <= half; x += spacing) {
      for (let z = nearZ; z < farZ; z += spacing) {
        const depth = (z + spacing / 2 - view.z) * view.wz + (x - view.x) * view.wx + (floorY - view.y) * view.wy;
        if (!inBand(depth)) continue;
        segment(x, floorY, z, x, floorY, z + spacing);
      }
    }
    context.globalAlpha = opacity * bands[band] * grazing;
    context.stroke();
  }
}

/** Cube faces by corner index (x side + 2 × y side + 4 × far): near, far, left, right, top, bottom. */
const CUBE_FACES: readonly (readonly number[])[] = [
  [0, 1, 3, 2],
  [4, 6, 7, 5],
  [0, 2, 6, 4],
  [1, 5, 7, 3],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
];

/**
 * Debris cubes streaming toward and past the lens, each with a streak
 * behind it. `amount` fades the whole stream (0..1).
 */
export function drawDebris(
  context: Paint2D,
  view: LogoView,
  box: SceneBox,
  ink: string,
  time: number,
  amount: number,
  lock: number,
): void {
  if (amount <= 0.01) return;
  const count = 64;
  const span = box.width * 6 + lock;
  const segment = segmentDrawer(context, view);
  const { focal, near, ox, oy, rx, ry, rz, ux, uy, uz, wx, wy, wz } = view;
  const corners = new Float64Array(16);
  const cubes: number[] = [];
  context.strokeStyle = ink;
  context.lineWidth = Math.max(1, box.cell * 0.12);
  context.globalAlpha = 0.5 * amount;
  context.beginPath();
  for (let index = 0; index < count; index += 1) {
    const speed = box.width * (1.8 + 2.4 * hash(index, 3));
    const phase = hash(index, 4) * span;
    // Travels from far behind the mark toward the viewer, then wraps.
    const z = box.width * 5 - ((time * speed + phase) % span);
    const angle = hash(index, 1) * Math.PI * 2;
    const radius = box.width * (0.55 + 1.5 * hash(index, 2));
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.6;
    segment(x, y, z + speed * 0.08, x, y, z);
    cubes.push(x, y, z, box.cell * (0.5 + 1.8 * hash(index, 5) ** 2));
  }
  context.stroke();
  context.fillStyle = ink;
  // Two passes over the same cubes: shaded sides first, then the faces toward the lens.
  for (let pass = 0; pass < 2; pass += 1) {
    context.globalAlpha = (pass === 0 ? 0.4 : 0.85) * amount;
    context.beginPath();
    for (let at = 0; at < cubes.length; at += 4) {
      const half = cubes[at + 3] / 2;
      let hidden = false;
      for (let corner = 0; corner < 8; corner += 1) {
        const dx = cubes[at] + (corner & 1 ? half : -half) - view.x;
        const dy = cubes[at + 1] + (corner & 2 ? half : -half) - view.y;
        const dz = cubes[at + 2] + (corner & 4 ? half : -half) - view.z;
        const depth = dx * wx + dy * wy + dz * wz;
        if (depth < near) {
          hidden = true;
          break;
        }
        corners[corner * 2] = ox + ((dx * rx + dy * ry + dz * rz) * focal) / depth;
        corners[corner * 2 + 1] = oy + ((dx * ux + dy * uy + dz * uz) * focal) / depth;
      }
      if (hidden) continue;
      const faces = [
        view.z < cubes[at + 2] - half,
        view.z > cubes[at + 2] + half,
        view.x < cubes[at] - half,
        view.x > cubes[at] + half,
        view.y < cubes[at + 1] - half,
        view.y > cubes[at + 1] + half,
      ];
      for (let face = pass === 0 ? 2 : 0; face < (pass === 0 ? 6 : 2); face += 1) {
        if (!faces[face]) continue;
        const [a, b, c, d] = CUBE_FACES[face];
        context.moveTo(corners[a * 2], corners[a * 2 + 1]);
        context.lineTo(corners[b * 2], corners[b * 2 + 1]);
        context.lineTo(corners[c * 2], corners[c * 2 + 1]);
        context.lineTo(corners[d * 2], corners[d * 2 + 1]);
      }
    }
    context.fill();
  }
}

export type Impact = Readonly<{
  /** Seconds since the part docked. */
  age: number;
  /** Centre of the part on the logo plane. */
  cx: number;
  cy: number;
  /** Reach of the part, in frame units. */
  reach: number;
  seed: number;
  /** 1 for a normal dock, more for the final lock. */
  weight: number;
}>;

export const IMPACT_SECONDS = 0.55;

/** A ring on the logo plane that races out from the part and thins as it goes. */
export function drawShockRing(context: Paint2D, view: LogoView, impact: Impact, strength: number, cell: number): void {
  const life = impact.age / (IMPACT_SECONDS * (impact.weight > 1 ? 1.3 : 0.8));
  if (life >= 1) return;
  const grow = 1 - (1 - life) ** 3;
  const radius = impact.reach * (0.6 + (impact.weight > 1 ? 1.1 : 1.6) * grow) + cell * 2 * grow;
  const segment = segmentDrawer(context, view);
  context.beginPath();
  const steps = 56;
  for (let step = 0; step < steps; step += 1) {
    const a0 = (step / steps) * Math.PI * 2;
    const a1 = ((step + 1) / steps) * Math.PI * 2;
    segment(
      impact.cx + Math.cos(a0) * radius,
      impact.cy + Math.sin(a0) * radius,
      0,
      impact.cx + Math.cos(a1) * radius,
      impact.cy + Math.sin(a1) * radius,
      0,
    );
  }
  context.globalAlpha = Math.min(1, strength * (1 - life) ** 1.5 * (impact.weight > 1 ? 1 : 0.8));
  context.lineWidth = Math.max(1, cell * (0.18 + 0.5 * (1 - life)) * (impact.weight > 1 ? 1.4 : 1));
  context.stroke();
}

/** Sparks thrown off the docking seam, flying out and toward the lens with drag. */
function drawSparks(context: Paint2D, view: LogoView, impact: Impact, strength: number, cell: number): void {
  const life = impact.age / IMPACT_SECONDS;
  if (life >= 1) return;
  const count = Math.round((impact.weight > 1 ? 44 : 20) * Math.min(1.5, strength + 0.3));
  const segment = segmentDrawer(context, view);
  context.beginPath();
  const travelled = (age: number, speed: number) => (speed * (1 - Math.exp(-age * 7))) / 7;
  for (let index = 0; index < count; index += 1) {
    const seed = impact.seed * 131 + index;
    const angle = hash(seed, 1) * Math.PI * 2;
    const start = impact.reach * (0.55 + 0.45 * hash(seed, 2));
    const x0 = impact.cx + Math.cos(angle) * start;
    const y0 = impact.cy + Math.sin(angle) * start;
    const lift = -(0.2 + 0.8 * hash(seed, 3));
    const norm = Math.hypot(1, lift);
    const speed = (impact.reach * 3 + cell * 30) * (0.4 + hash(seed, 4)) * impact.weight ** 0.5;
    const far = travelled(impact.age, speed);
    const near = travelled(Math.max(0, impact.age - 0.045), speed);
    const dx = Math.cos(angle) / norm;
    const dy = Math.sin(angle) / norm;
    const dz = lift / norm;
    segment(x0 + dx * near, y0 + dy * near, dz * near, x0 + dx * far, y0 + dy * far, dz * far);
  }
  context.globalAlpha = Math.min(1, strength * (1 - life) ** 0.8);
  context.lineWidth = Math.max(1, cell * 0.2 * (1 - life * 0.6));
  context.stroke();
}

export function drawImpact(
  context: Paint2D,
  view: LogoView,
  impact: Impact,
  ink: string,
  strength: number,
  cell: number,
): void {
  if (strength <= 0 || impact.age < 0) return;
  context.strokeStyle = ink;
  drawShockRing(context, view, impact, strength, cell);
  drawSparks(context, view, impact, strength, cell);
}

/** Camera shake from recent impacts: a sharp jolt that rings down fast. */
export function shakeOf(impacts: readonly Impact[], strength: number, cell: number): Readonly<{ x: number; y: number }> {
  let x = 0;
  let y = 0;
  for (const impact of impacts) {
    if (impact.age < 0 || impact.age > 0.4) continue;
    const amplitude = strength * cell * 0.7 * impact.weight * Math.exp(-impact.age * 14);
    x += amplitude * Math.sin(impact.age * 83 + impact.seed * 1.7);
    y += amplitude * Math.cos(impact.age * 71 + impact.seed * 2.3);
  }
  return { x, y };
}

/**
 * A one-or-two frame glitch on a hard cut: a flash of ink, torn horizontal
 * bars and a sideways jump of the picture.
 */
export function drawCutGlitch(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  ink: string,
  age: number,
  seed: number,
  strength: number,
): void {
  if (age < 0 || age >= 0.075 || strength <= 0) return;
  const fade = 1 - age / 0.075;
  context.fillStyle = ink;
  context.globalAlpha = 0.28 * strength * fade;
  context.fillRect(0, 0, frame.width, frame.height);
  context.globalAlpha = 0.85 * fade;
  context.beginPath();
  for (let bar = 0; bar < 7; bar += 1) {
    const y = hash(seed * 17 + bar, 1) * frame.height;
    const h = Math.max(2, frame.height * (0.004 + 0.02 * hash(seed * 17 + bar, 2)));
    const x = hash(seed * 17 + bar, 3) * frame.width * 0.6;
    context.rect(x, y, frame.width * (0.2 + 0.6 * hash(seed * 17 + bar, 4)), h);
  }
  context.fill();
}

/** Sideways jump of the picture during a cut glitch, in frame units. */
export function cutJump(age: number, seed: number, width: number): number {
  if (age < 0 || age >= 0.075) return 0;
  return (hash(seed, 9) - 0.5) * width * 0.06;
}

/** Seconds the opening power-on line lasts. */
export const POWER_ON_SECONDS = 0.32;

/**
 * The opening beat, like a tube switching on: a hot point where the mark
 * will stand snaps out into a line across the whole frame, then thins and
 * fades while the first parts fly in.
 */
export function drawPowerOn(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  view: LogoView,
  ink: string,
  age: number,
  strength: number,
): void {
  if (age < 0 || age >= POWER_ON_SECONDS || strength <= 0) return;
  const life = age / POWER_ON_SECONDS;
  const centreX = view.ox;
  const centreY = view.oy;
  const reach = frame.width * (1 - 2 ** (-14 * life));
  const thick = Math.max(1, frame.height * 0.012 * (1 - life) ** 2);
  context.fillStyle = ink;
  context.globalAlpha = Math.min(1, strength * 1.2) * (1 - life) ** 1.5;
  context.fillRect(centreX - reach, centreY - thick / 2, reach * 2, thick);
  // The hot point, and a faint haze of the line above and below it.
  const dot = frame.height * 0.014 * (1 - life);
  context.fillRect(centreX - dot, centreY - dot, dot * 2, dot * 2);
  context.globalAlpha *= 0.25;
  context.fillRect(centreX - reach, centreY - thick * 3, reach * 2, thick * 6);
}

