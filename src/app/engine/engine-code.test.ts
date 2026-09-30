import { describe, expect, it } from "vitest";

import { breakOrder, type BreakPose, poseBroken } from "./engine-code-break";
import {
  codeSchedule,
  codeTakesOver,
  endTextProgress,
  sequenceTime,
} from "./engine-code";
import {
  CODE_BREAK_STYLES,
  readCodeRoll,
  readEndText,
} from "./engine-settings";

const rolling = {
  "code.breakTime": 1.5,
  "code.enabled": true,
  "code.hold": 0.5,
  "code.rollTime": 3,
  "endText.enabled": true,
  "endText.hold": 2,
};

function schedule(values: Record<string, unknown>) {
  return codeSchedule(readCodeRoll(values), readEndText(values));
}

const character = {
  kickX: 0.01,
  kickY: -0.02,
  patch: 0.4,
  px: 0.3,
  py: 0.6,
  rand: 0.5,
  seed: 42,
  spin: 1.5,
};

describe("code roll schedule", () => {
  it("runs roll, pause, break and end text back to back", () => {
    const plan = schedule(rolling);
    expect(plan.breakStart).toBeCloseTo(3.5);
    expect(plan.codeEnd).toBeCloseTo(5);
    expect(plan.endStart).toBeCloseTo(5);
    expect(plan.total).toBeCloseTo(7);
  });

  it("gives each slider its own length, so one edit moves only what follows it", () => {
    const longer = schedule({ ...rolling, "code.hold": 1.5 });
    expect(longer.breakStart - schedule(rolling).breakStart).toBeCloseTo(1);
    expect(longer.codeEnd - longer.breakStart).toBeCloseTo(1.5);
    expect(longer.total - longer.endStart).toBeCloseTo(2);
  });

  it("starts the end text at the loop start when the roll is off", () => {
    const plan = schedule({ ...rolling, "code.enabled": false });
    expect(plan.endStart).toBe(0);
    expect(plan.total).toBeCloseTo(2);
  });

  it("plays in real seconds when the loop fits, and faster only when it does not", () => {
    expect(sequenceTime(0.5, 8, 7)).toBeCloseTo(4);
    expect(sequenceTime(0.5, 3.5, 7)).toBeCloseTo(3.5);
    expect(sequenceTime(1, 3.5, 7)).toBeCloseTo(7);
  });

  it("hides the sheet while the code is on screen, and after it unless asked back", () => {
    const code = readCodeRoll(rolling);
    const plan = schedule(rolling);
    expect(codeTakesOver(code, plan, 1)).toBe(true);
    expect(codeTakesOver(code, plan, 6)).toBe(true);
    const back = readCodeRoll({ ...rolling, "code.sheetAtEnd": true });
    expect(codeTakesOver(back, plan, 1)).toBe(true);
    expect(codeTakesOver(back, plan, 6)).toBe(false);
  });
});

describe("end text pacing", () => {
  it("reveals, holds for most of the window, then exits before it closes", () => {
    const hold = 3;
    const typed = endTextProgress(0.5, hold, 12);
    expect(typed).toBeGreaterThan(0);
    expect(typed).toBeLessThan(0.55);
    expect(endTextProgress(1.5, hold, 12)).toBeGreaterThanOrEqual(0.55);
    expect(endTextProgress(1.5, hold, 12)).toBeLessThan(0.9);
    expect(endTextProgress(2.9, hold, 12)).toBeGreaterThanOrEqual(0.9);
    expect(endTextProgress(2.9, hold, 12)).toBeLessThan(1);
  });

  it("keeps the reveal pace when the hold grows", () => {
    // A longer hold means longer on screen, not a slower typewriter.
    expect(endTextProgress(0.4, 3, 12)).toBeCloseTo(endTextProgress(0.4, 10, 12));
  });
});

describe("break styles", () => {
  it("orders every style inside the release window", () => {
    for (const style of CODE_BREAK_STYLES) {
      for (const px of [0, 0.5, 1]) {
        for (const py of [0, 0.5, 1]) {
          const share = breakOrder(style, { ...character, px, py });
          expect(share).toBeGreaterThanOrEqual(0);
          expect(share).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("sweeps wind left to right and bursts from the centre out", () => {
    expect(breakOrder("wind", { ...character, px: 0.1 })).toBeLessThan(
      breakOrder("wind", { ...character, px: 0.9 }),
    );
    expect(breakOrder("burst", { ...character, px: 0.5, py: 0.5 })).toBeLessThan(
      breakOrder("burst", { ...character, px: 0, py: 0 }),
    );
  });

  it("starts every style at the character's home and moves it away", () => {
    for (const style of CODE_BREAK_STYLES) {
      const pose: BreakPose = { alpha: 1, angle: 0, glyph: null, scale: 1, u: 0, v: 0 };
      poseBroken(style, pose, character, { cu: 0.5, cv: 0.5 }, 0.2, 0.3, 0, 1, 4);
      if (style !== "glitch") {
        expect(pose.u).toBeCloseTo(0.2, 5);
        expect(pose.v).toBeCloseTo(0.3, 5);
      }
      poseBroken(style, pose, character, { cu: 0.5, cv: 0.5 }, 0.2, 0.3, 0.8, 1, 4);
      expect(Number.isFinite(pose.u) && Number.isFinite(pose.v)).toBe(true);
      if (style !== "glitch") {
        expect(Math.hypot(pose.u - 0.2, pose.v - 0.3)).toBeGreaterThan(0.02);
      }
    }
  });

  it("is deterministic, so scrubbing and export draw the same frame", () => {
    const first: BreakPose = { alpha: 1, angle: 0, glyph: null, scale: 1, u: 0, v: 0 };
    const second: BreakPose = { ...first };
    poseBroken("swirl", first, character, { cu: 0.5, cv: 0.5 }, 0.2, 0.3, 0.6, 1.2, 4.1);
    poseBroken("swirl", second, character, { cu: 0.5, cv: 0.5 }, 0.2, 0.3, 0.6, 1.2, 4.1);
    expect(second).toEqual(first);
  });
});
