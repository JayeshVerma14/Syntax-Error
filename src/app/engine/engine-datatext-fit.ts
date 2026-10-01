/**
 * Data text fit: how far each item may grow, or must shrink, so the layout
 * holds together at any type size. Every item keeps its place; when the font
 * picker's size grows the type, an item may only grow into part of the empty
 * space between it and each neighbour, so neighbours never run into each
 * other, and nothing may run past the frame's edge. A big wordmark placed
 * near an edge shrinks to fit instead of being cut off.
 *
 * Two items are neighbours along the axis on which they stand furthest
 * apart, and each may take part of that gap from its own side, so no pair can
 * meet whatever the others do. Items the user has already overlapped are
 * left to overlap.
 */

import type { Bounds } from "./engine-datatext-layout";

/** An item at its own size: where it is anchored and what it covers. */
export type Reach = Readonly<{ bounds: Bounds; x: number; y: number }>;

/** Share of the gap between two neighbours that each may grow into. */
const GAP_SHARE = 0.4;
/** Smallest scale the fit gives an item, so it never vanishes. */
const MIN_SCALE = 0.2;

type Limits = { bottom: number; left: number; right: number; top: number };

/** Narrows two neighbours' limits so each keeps to its share of the gap between them. */
function separate(a: Bounds, b: Bounds, limitsA: Limits, limitsB: Limits): void {
  const gapX = Math.max(b.left - a.right, a.left - b.right);
  const gapY = Math.max(b.top - a.bottom, a.top - b.bottom);
  // Already overlapping: the user's own choice, left as it is.
  if (!(gapX > 0) && !(gapY > 0)) return;
  if (gapX >= gapY) {
    const share = gapX * GAP_SHARE;
    const [leftLimits, rightLimits, left, right] = b.left >= a.right ? [limitsA, limitsB, a, b] : [limitsB, limitsA, b, a];
    leftLimits.right = Math.min(leftLimits.right, left.right + share);
    rightLimits.left = Math.max(rightLimits.left, right.left - share);
    return;
  }
  const share = gapY * GAP_SHARE;
  const [upperLimits, lowerLimits, upper, lower] = b.top >= a.bottom ? [limitsA, limitsB, a, b] : [limitsB, limitsA, b, a];
  upperLimits.bottom = Math.min(upperLimits.bottom, upper.bottom + share);
  lowerLimits.top = Math.max(lowerLimits.top, lower.top - share);
}

/** The largest scale about its anchor at which an item stays inside its limits. */
function scaleWithin(reach: Reach, limits: Limits, wanted: number): number {
  const { bounds, x, y } = reach;
  let scale = wanted;
  const side = (room: number, extent: number) => {
    if (extent > 1e-6) scale = Math.min(scale, room / extent);
  };
  side(limits.right - x, bounds.right - x);
  side(x - limits.left, x - bounds.left);
  side(limits.bottom - y, bounds.bottom - y);
  side(y - limits.top, y - bounds.top);
  return Math.max(MIN_SCALE, scale);
}

/**
 * Each item's scale about its anchor: `wanted` (the type size asked for) where
 * there is room, less where a neighbour or the edge of `area` is in the way.
 * Null entries (items without text) take no room and scale by 1.
 */
export function fitScales(reaches: readonly (Reach | null)[], area: Bounds, wanted: number): number[] {
  const limits: (Limits | null)[] = reaches.map((reach) => (reach ? { ...area } : null));
  for (let i = 0; i < reaches.length; i += 1) {
    const a = reaches[i];
    const limitsA = limits[i];
    if (!a || !limitsA) continue;
    for (let j = i + 1; j < reaches.length; j += 1) {
      const b = reaches[j];
      const limitsB = limits[j];
      if (b && limitsB) separate(a.bounds, b.bounds, limitsA, limitsB);
    }
  }
  return reaches.map((reach, index) => {
    const own = limits[index];
    return reach && own ? scaleWithin(reach, own, wanted) : 1;
  });
}
