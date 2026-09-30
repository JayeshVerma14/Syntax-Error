import { describe, expect, it } from "vitest";

import { createFieldSampler, FIELD_MOTIONS } from "./engine-field";
import { backdropGlyph, backdropShown } from "./engine-glyphs";

const COLS = 40;
const ROWS = 24;
const DENSITY = 0.8;

type Sampler = ReturnType<typeof createFieldSampler>;

function sampler(motion: (typeof FIELD_MOTIONS)[number], speed: number, loop: number, progress: number): Sampler {
  return createFieldSampler(motion, speed, loop, COLS, ROWS, DENSITY, progress);
}

/** The whole field as one string, so two frames compare in one assertion. */
function snapshot(sample: Sampler): string {
  let text = "";
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      const pick = sample(column, row);
      text += pick ? `${pick.glyph}${pick.scale.toFixed(2)}` : " ";
    }
    text += "\n";
  }
  return text;
}

describe("idle field motion", () => {
  it("closes every motion's loop without a jump, at any speed and loop length", () => {
    for (const motion of FIELD_MOTIONS) {
      for (const speed of [1, 7, 20, 63, 100]) {
        for (const loop of [4, 6.5, 8]) {
          const start = snapshot(sampler(motion, speed, loop, 0));
          const end = snapshot(sampler(motion, speed, loop, 1));
          expect(end).toBe(start);
        }
      }
    }
  });

  it("leaves the field exactly as before when still", () => {
    const sample = sampler("still", 20, 4, 0.37);
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLS; column += 1) {
        const pick = sample(column, row);
        expect(pick !== null).toBe(backdropShown(column, row, DENSITY));
        if (pick) expect(pick.glyph).toBe(backdropGlyph(column, row));
      }
    }
  });

  it("moves under every other motion", () => {
    for (const motion of FIELD_MOTIONS.filter((item) => item !== "still")) {
      const start = snapshot(sampler(motion, 20, 8, 0));
      const later = snapshot(sampler(motion, 20, 8, 0.3));
      expect(later).not.toBe(start);
    }
  });

  it("changes less at the lowest speed than at the default", () => {
    const changed = (speed: number) => {
      const before = snapshot(sampler("shimmer", speed, 8, 0.2));
      const after = snapshot(sampler("shimmer", speed, 8, 0.3));
      let count = 0;
      for (let index = 0; index < before.length; index += 1) {
        if (before[index] !== after[index]) count += 1;
      }
      return count;
    };
    expect(changed(1)).toBeLessThan(changed(20));
  });

  it("drifts the pattern right", () => {
    // Around mid-cycle nearly every cell shows one copy, so a one-cell step
    // there is a pure shift.
    const loop = 6;
    const speed = 100;
    const cellsPerSecond = 0.3 + speed * 0.15;
    const midCycle = 1.5 / loop;
    const oneCell = 1 / cellsPerSecond / loop;
    const before = sampler("drift", speed, loop, midCycle - oneCell / 2);
    const after = sampler("drift", speed, loop, midCycle + oneCell / 2);
    let matches = 0;
    let total = 0;
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 1; column < COLS; column += 1) {
        const was = before(column - 1, row);
        const wasGlyph = was ? was.glyph : null;
        const now = after(column, row);
        total += 1;
        if ((now ? now.glyph : null) === wasGlyph) matches += 1;
      }
    }
    expect(matches / total).toBeGreaterThan(0.9);
  });
});
