import { describe, expect, it } from "vitest";

import { MOTION_STYLE_OPTIONS, type MotionStyle } from "./engine-constants";
import {
  createMotionField,
  sampleMotion,
  type MotionSettings,
} from "./engine-motion";

const COLS = 24;
const ROWS = 16;

function settings(style: MotionStyle, overrides: Partial<MotionSettings> = {}): MotionSettings {
  return {
    amount: 70,
    cycles: 1,
    direction: 30,
    stagger: 45,
    style,
    ...overrides,
  };
}

const cells: readonly (readonly [number, number])[] = [
  [0, 0],
  [5, 3],
  [12, 8],
  [23, 15],
  [17, 2],
];

const animated = MOTION_STYLE_OPTIONS.map((option) => option.value).filter(
  (style) => style !== "still",
);

describe("motion styles", () => {
  it("offers sixteen animated styles beside Still", () => {
    expect(animated).toHaveLength(16);
  });

  it("holds every cell still for the Still style and at zero amount", () => {
    const field = createMotionField(settings("still"), COLS, ROWS);
    for (const style of [...animated, "still" as const]) {
      const motion =
        style === "still" ? settings("still") : settings(style, { amount: 0 });
      const sample = sampleMotion(motion, field, 0.37, 4, 4);
      expect(sample).toEqual({
        dx: 0,
        dy: 0,
        glyphShift: 0,
        markShift: 0,
        rotation: 0,
        scale: 1,
      });
    }
  });

  for (const style of animated) {
    it(`${style} returns to its first frame at the end of the loop`, () => {
      for (const cycles of [1, 3]) {
        const motion = settings(style, { cycles });
        const field = createMotionField(motion, COLS, ROWS);
        for (const [column, row] of cells) {
          const first = sampleMotion(motion, field, 0, column, row);
          const last = sampleMotion(motion, field, 1, column, row);
          expect(last.scale).toBeCloseTo(first.scale, 9);
          expect(last.dx).toBeCloseTo(first.dx, 9);
          expect(last.dy).toBeCloseTo(first.dy, 9);
          // Rotation may land a whole turn later, which draws identically.
          const turn = Math.PI * 2;
          const rotationDelta = (last.rotation - first.rotation) / turn;
          expect(Math.abs(rotationDelta - Math.round(rotationDelta))).toBeLessThan(1e-9);
          expect(last.glyphShift).toBe(first.glyphShift);
          expect(last.markShift).toBe(first.markShift);
        }
      }
    });

    it(`${style} actually moves something during the loop`, () => {
      const motion = settings(style);
      const field = createMotionField(motion, COLS, ROWS);
      let changed = false;
      for (const progress of [0.1, 0.3, 0.55, 0.8]) {
        for (const [column, row] of cells) {
          const a = sampleMotion(motion, field, 0, column, row);
          const b = sampleMotion(motion, field, progress, column, row);
          if (
            Math.abs(a.scale - b.scale) > 1e-6 ||
            Math.abs(a.dx - b.dx) > 1e-6 ||
            Math.abs(a.dy - b.dy) > 1e-6 ||
            Math.abs(a.rotation - b.rotation) > 1e-6 ||
            a.glyphShift !== b.glyphShift ||
            a.markShift !== b.markShift
          ) {
            changed = true;
          }
        }
      }
      expect(changed).toBe(true);
    });
  }
});
