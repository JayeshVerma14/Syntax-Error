/**
 * The parts of the logo drawn in 3D through the cinematic camera. Every
 * block is a voxel: a front face on the logo plane, extruded back by the
 * depth, with only the faces the camera can see drawn and only the sides no
 * neighbour of the same (or an already docked) part covers. Faces are
 * projected with real perspective and batched: one path per part, colour
 * and face direction, filled once. Side faces are lit by one light, as ink
 * at an opacity, so they shade correctly over any background colour.
 *
 * Other particles (dots, dashes, plus, glyphs) are flat shapes on the logo
 * plane, foreshortened like the voxel front, with a faint echo of each one
 * at the depth so camera moves still read in 3D.
 */

import type { LogoArt } from "./engine-logo-art";
import type { LogoBox, LogoView } from "./engine-logo-camera";
import type { LogoParts } from "./engine-logo-parts";
import { morphStage, particleShaper, PARTICLE_GLYPH_COUNT, type LogoParticle } from "./engine-logo-particles";
import type { Paint2D } from "./engine-units";

/** Numbers per part in a pose array: rotation (9), origin (3), flight, age, spare. */
export const POSE_STRIDE = 16;

export type VoxelScene = Readonly<{
  art: LogoArt;
  /** Heavier dashes, plus signs and glyph strokes, which read better at angles. */
  bold: boolean;
  box: LogoBox;
  /** Extrusion in frame units. */
  depth: number;
  frame: Readonly<{ height: number; width: number }>;
  ink: string;
  parts: LogoParts;
  particle: LogoParticle;
  poses: Float64Array;
  /** Glyph scramble tick. */
  tick: number;
  tint: boolean;
  view: LogoView;
}>;

/** Light direction (toward the light), normalised: from the upper left, in front. */
const LIGHT_X = -0.42;
const LIGHT_Y = -0.62;
const LIGHT_Z = -0.66;
const LIGHT_NORM = Math.hypot(LIGHT_X, LIGHT_Y, LIGHT_Z);
const shade = (facing: number) => 0.14 + 0.66 * Math.max(0, facing / LIGHT_NORM);
/** How lit a docked front face is; caps at this light draw at full ink. */
const CAP_LIGHT = shade(-LIGHT_Z);

/** Front and back vertex orders, then left, right, top, bottom: all wound the same seen from outside. */
const FACES: readonly (readonly number[])[] = [
  [0, 1, 3, 2],
  [4, 6, 7, 5],
  [0, 2, 6, 4],
  [1, 5, 7, 3],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
];

let scratch = new Float32Array(0);
let slots = new Uint8Array(0);

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 307, 2_654_435_761) ^ Math.imul(salt + 11, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

function largestPart(parts: LogoParts): number {
  let most = 1;
  for (let part = 0; part < parts.count; part += 1) {
    most = Math.max(most, parts.partStart[part + 1] - parts.partStart[part]);
  }
  return most;
}

/** Camera depth of each part's origin, far parts first. */
export function depthOrder(poses: Float64Array, count: number, view: LogoView): number[] {
  const depth = (part: number) => {
    const o = part * POSE_STRIDE;
    return (poses[o + 9] - view.x) * view.wx + (poses[o + 10] - view.y) * view.wy + (poses[o + 11] - view.z) * view.wz;
  };
  return Array.from({ length: count }, (_, part) => part).sort((a, b) => depth(b) - depth(a));
}

/**
 * Draws every launched part, far to near. `alphaOf(part)` gives each part's
 * opacity (0 skips it).
 */
export function drawVoxelParts(context: Paint2D, scene: VoxelScene, alphaOf: (part: number) => number): void {
  const { art, box, parts, poses, view } = scene;
  const most = largestPart(parts);
  // Seven regions: four side directions, cap quads, flat caps, flat echoes.
  const region = most * 8;
  if (scratch.length < region * 7) scratch = new Float32Array(region * 7);
  if (slots.length < most) slots = new Uint8Array(most);
  const buffer = scratch;
  const glyphs = slots;
  const counts = new Int32Array(7);
  const blocks = art.blocks;
  const { neighbours, order, partOf } = parts;
  const half = box.cell * 0.44;
  const depth = scene.depth;
  const solid = scene.particle === "blocks";
  const echo = !solid && depth > 0.5;
  const { focal, near, ox, oy } = view;
  const reachX = scene.frame.width;
  const reachY = scene.frame.height;
  const docked = (part: number) => poses[part * POSE_STRIDE + 12] >= 1;

  const shape = particleShaper(context, scene.particle, scene.bold);
  const glyphed = scene.particle === "glyphs";
  const morphing = scene.particle === "mixed";

  const push = (kind: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const at = kind * region + counts[kind] * 8;
    buffer[at] = x0;
    buffer[at + 1] = y0;
    buffer[at + 2] = x1;
    buffer[at + 3] = y1;
    buffer[at + 4] = x2;
    buffer[at + 5] = y2;
    buffer[at + 6] = x3;
    buffer[at + 7] = y3;
    counts[kind] += 1;
  };
  const fillQuads = (kind: number, alpha: number) => {
    const n = counts[kind];
    if (n === 0 || alpha <= 0.004) return;
    context.globalAlpha = alpha;
    context.beginPath();
    for (let q = 0; q < n; q += 1) {
      const at = kind * region + q * 8;
      context.moveTo(buffer[at], buffer[at + 1]);
      context.lineTo(buffer[at + 2], buffer[at + 3]);
      context.lineTo(buffer[at + 4], buffer[at + 5]);
      context.lineTo(buffer[at + 6], buffer[at + 7]);
    }
    context.fill();
  };
  /** Flat shapes: centre and two half-axes, six numbers each, plus a glyph. */
  const fillShapes = (kind: number, alpha: number) => {
    const n = counts[kind];
    if (n === 0 || alpha <= 0.004) return;
    context.globalAlpha = alpha;
    context.beginPath();
    for (let q = 0; q < n; q += 1) {
      const at = kind * region + q * 8;
      shape(buffer[at], buffer[at + 1], buffer[at + 2], buffer[at + 3], buffer[at + 4], buffer[at + 5], glyphs[q]);
    }
    context.fill();
  };

  const drawPart = (part: number, alpha: number) => {
    const o = part * POSE_STRIDE;
    const r00 = poses[o];
    const r01 = poses[o + 1];
    const r02 = poses[o + 2];
    const r10 = poses[o + 3];
    const r11 = poses[o + 4];
    const r12 = poses[o + 5];
    const r20 = poses[o + 6];
    const r21 = poses[o + 7];
    const r22 = poses[o + 8];
    const dx = poses[o + 9] - view.x;
    const dy = poses[o + 10] - view.y;
    const dz = poses[o + 11] - view.z;
    const settled = poses[o + 12] >= 1;
    // Part-to-camera rotation (camera rows times the part rotation) and offset.
    const m00 = view.rx * r00 + view.ry * r10 + view.rz * r20;
    const m01 = view.rx * r01 + view.ry * r11 + view.rz * r21;
    const m02 = view.rx * r02 + view.ry * r12 + view.rz * r22;
    const m10 = view.ux * r00 + view.uy * r10 + view.uz * r20;
    const m11 = view.ux * r01 + view.uy * r11 + view.uz * r21;
    const m12 = view.ux * r02 + view.uy * r12 + view.uz * r22;
    const m20 = view.wx * r00 + view.wy * r10 + view.wz * r20;
    const m21 = view.wx * r01 + view.wy * r11 + view.wz * r21;
    const m22 = view.wx * r02 + view.wy * r12 + view.wz * r22;
    const t0 = view.rx * dx + view.ry * dy + view.rz * dz;
    const t1 = view.ux * dx + view.uy * dy + view.uz * dz;
    const t2 = view.wx * dx + view.wy * dy + view.wz * dz;
    // The camera in the part's own frame decides which faces face it.
    const lcx = -(r00 * dx + r10 * dy + r20 * dz);
    const lcy = -(r01 * dx + r11 * dy + r21 * dz);
    const lcz = -(r02 * dx + r12 * dy + r22 * dz);
    const frontFacing = lcz < 0;
    const backFacing = lcz > depth;
    const axX = m00 * half;
    const axY = m10 * half;
    const axZ = m20 * half;
    const ayX = m01 * half;
    const ayY = m11 * half;
    const ayZ = m21 * half;
    const azX = m02 * depth;
    const azY = m12 * depth;
    const azZ = m22 * depth;
    const spread = Math.abs(axZ) + Math.abs(ayZ);
    const minBack = Math.min(0, azZ);
    const pivotX = parts.centres[part * 4] * box.cell - box.width / 2;
    const pivotY = parts.centres[part * 4 + 1] * box.cell - box.height / 2;
    const lightX = r00 * LIGHT_X + r10 * LIGHT_Y + r20 * LIGHT_Z;
    const lightY = r01 * LIGHT_X + r11 * LIGHT_Y + r21 * LIGHT_Z;
    const lightZ = r02 * LIGHT_X + r12 * LIGHT_Y + r22 * LIGHT_Z;
    const sideAlpha = [shade(-lightX), shade(lightX), shade(-lightY), shade(lightY)];
    // A back face is rim-lit rather than dark, so the mark still reads from behind.
    const capAlpha = frontFacing ? Math.min(1, 0.4 + (0.6 * shade(-lightZ)) / CAP_LIGHT) : 0.78;
    const corners = new Float64Array(16);

    for (let run = parts.partRuns[part]; run < parts.partRuns[part + 1]; run += 1) {
      const color = scene.tint ? scene.ink : parts.palette[parts.runs[run * 3 + 2]] ?? scene.ink;
      counts.fill(0);
      for (let cursor = parts.runs[run * 3]; cursor < parts.runs[run * 3 + 1]; cursor += 1) {
        const block = order[cursor];
        const lx = (blocks[block * 5] + 0.5) * box.cell - box.width / 2 - pivotX;
        const ly = (blocks[block * 5 + 1] + 0.5) * box.cell - box.height / 2 - pivotY;
        const cx = m00 * lx + m01 * ly + t0;
        const cy = m10 * lx + m11 * ly + t1;
        const cz = m20 * lx + m21 * ly + t2;
        if (cz - spread + minBack < near) continue;
        const scale = focal / cz;
        const sx = ox + cx * scale;
        const sy = oy + cy * scale;
        const size = half * scale * 3;
        if (sx < -size || sy < -size || sx > reachX + size || sy > reachY + size) continue;
        // Screen corners: index = x side + 2 × y side + 4 × back.
        for (let corner = 0; corner < 8; corner += 1) {
          if (corner >= 4 && depth <= 0) break;
          const kx = corner & 1 ? 1 : -1;
          const ky = corner & 2 ? 1 : -1;
          const kz = corner & 4 ? 1 : 0;
          const px = cx + kx * axX + ky * ayX + kz * azX;
          const py = cy + kx * axY + ky * ayY + kz * azY;
          const pz = cz + kx * axZ + ky * ayZ + kz * azZ;
          corners[corner * 2] = ox + (px * focal) / pz;
          corners[corner * 2 + 1] = oy + (py * focal) / pz;
        }
        if (!solid) {
          const at = 5 * region + counts[5] * 8;
          // Centre and half-axes of the foreshortened front face.
          buffer[at] = (corners[0] + corners[2] + corners[4] + corners[6]) / 4;
          buffer[at + 1] = (corners[1] + corners[3] + corners[5] + corners[7]) / 4;
          buffer[at + 2] = (corners[2] + corners[6] - corners[0] - corners[4]) / 4;
          buffer[at + 3] = (corners[3] + corners[7] - corners[1] - corners[5]) / 4;
          buffer[at + 4] = (corners[4] + corners[6] - corners[0] - corners[2]) / 4;
          buffer[at + 5] = (corners[5] + corners[7] - corners[1] - corners[3]) / 4;
          if (glyphed) {
            // Glyphs scramble in flight and settle on one character once docked.
            glyphs[counts[5]] = Math.floor(hash(block, settled ? 3 : scene.tick) * PARTICLE_GLYPH_COUNT);
          } else if (morphing) {
            glyphs[counts[5]] = morphStage(poses[o + 12], block, scene.tick);
          }
          counts[5] += 1;
          if (echo) {
            const back = 6 * region + counts[6] * 8;
            buffer[back] = (corners[8] + corners[10] + corners[12] + corners[14]) / 4;
            buffer[back + 1] = (corners[9] + corners[11] + corners[13] + corners[15]) / 4;
            buffer[back + 2] = (corners[10] + corners[14] - corners[8] - corners[12]) / 4;
            buffer[back + 3] = (corners[11] + corners[15] - corners[9] - corners[13]) / 4;
            buffer[back + 4] = (corners[12] + corners[14] - corners[8] - corners[10]) / 4;
            buffer[back + 5] = (corners[13] + corners[15] - corners[9] - corners[11]) / 4;
            counts[6] += 1;
          }
          continue;
        }
        // A flat block shows its front from either side; a deep one shows its back from behind.
        const cap = frontFacing || depth <= 0 ? FACES[0] : backFacing ? FACES[1] : null;
        if (cap) {
          push(
            4,
            corners[cap[0] * 2],
            corners[cap[0] * 2 + 1],
            corners[cap[1] * 2],
            corners[cap[1] * 2 + 1],
            corners[cap[2] * 2],
            corners[cap[2] * 2 + 1],
            corners[cap[3] * 2],
            corners[cap[3] * 2 + 1],
          );
        }
        if (depth <= 0) continue;
        for (let side = 0; side < 4; side += 1) {
          const facing =
            side === 0 ? lcx < lx - half : side === 1 ? lcx > lx + half : side === 2 ? lcy < ly - half : lcy > ly + half;
          if (!facing) continue;
          const next = neighbours[block * 4 + side];
          if (next >= 0) {
            const other = partOf[next];
            // Covered by a neighbour of the same part, or of a part docked beside it.
            if (other === part || (settled && docked(other))) continue;
          }
          const face = FACES[side + 2];
          push(
            side,
            corners[face[0] * 2],
            corners[face[0] * 2 + 1],
            corners[face[1] * 2],
            corners[face[1] * 2 + 1],
            corners[face[2] * 2],
            corners[face[2] * 2 + 1],
            corners[face[3] * 2],
            corners[face[3] * 2 + 1],
          );
        }
      }
      context.fillStyle = color;
      if (solid) {
        for (let side = 0; side < 4; side += 1) fillQuads(side, alpha * sideAlpha[side]);
        fillQuads(4, alpha * capAlpha);
      } else {
        if (echo) fillShapes(6, alpha * 0.4);
        fillShapes(5, alpha);
      }
    }
  };

  for (const part of depthOrder(poses, parts.count, view)) {
    const alpha = alphaOf(part);
    if (alpha > 0) drawPart(part, alpha);
  }
}

/**
 * Speed streaks behind parts in flight: a line from a sample of each part's
 * blocks back to where they were a moment ago (`trail`, a pose array). With
 * `trailView`, the moment-ago end is seen through that camera instead, so a
 * whipping camera smears every launched part, docked ones included.
 */
export function drawPartStreaks(
  context: Paint2D,
  scene: VoxelScene,
  trail: Float64Array,
  strength: number,
  trailView: LogoView | null = null,
): void {
  if (strength <= 0) return;
  const { art, box, parts, poses } = scene;
  const ends = new Float64Array(6);
  // Bound to the pose arrays and views here, so the loop below hands them numbers only.
  const projectFrom = (pose: Float64Array, view: LogoView, at: number) => (o: number, lx: number, ly: number) => {
    const x = pose[o] * lx + pose[o + 1] * ly + pose[o + 9] - view.x;
    const y = pose[o + 3] * lx + pose[o + 4] * ly + pose[o + 10] - view.y;
    const z = pose[o + 6] * lx + pose[o + 7] * ly + pose[o + 11] - view.z;
    const depth = x * view.wx + y * view.wy + z * view.wz;
    ends[at + 2] = depth;
    if (depth < view.near) return;
    ends[at] = view.ox + ((x * view.rx + y * view.ry + z * view.rz) * view.focal) / depth;
    ends[at + 1] = view.oy + ((x * view.ux + y * view.uy + z * view.uz) * view.focal) / depth;
  };
  const near = scene.view.near;
  const now = projectFrom(poses, scene.view, 0);
  const before = projectFrom(trail, trailView ?? scene.view, 3);
  const docked = trailView !== null;
  context.strokeStyle = scene.ink;
  context.lineWidth = Math.max(1, box.cell * 0.14);
  context.globalAlpha = Math.min(1, 0.5 * strength);
  context.beginPath();
  for (let part = 0; part < parts.count; part += 1) {
    const o = part * POSE_STRIDE;
    const flight = poses[o + 12];
    if (flight <= 0 || (flight >= 1 && !docked)) continue;
    const pivotX = parts.centres[part * 4] * box.cell - box.width / 2;
    const pivotY = parts.centres[part * 4 + 1] * box.cell - box.height / 2;
    for (let cursor = parts.partStart[part]; cursor < parts.partStart[part + 1]; cursor += 7) {
      const block = parts.order[cursor];
      const lx = (art.blocks[block * 5] + 0.5) * box.cell - box.width / 2 - pivotX;
      const ly = (art.blocks[block * 5 + 1] + 0.5) * box.cell - box.height / 2 - pivotY;
      now(o, lx, ly);
      before(o, lx, ly);
      if (ends[2] < near || ends[5] < near) continue;
      context.moveTo(ends[0], ends[1]);
      context.lineTo(ends[3], ends[4]);
    }
  }
  context.stroke();
}
