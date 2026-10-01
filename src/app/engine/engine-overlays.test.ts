import { describe, expect, it } from "vitest";

import { barLines, DEFAULT_BAR_ITEMS, readBars } from "./engine-bars";
import { logoSchedule, readLogo } from "./engine-logo";
import { readEngineSettings } from "./engine-settings";

describe("logo reveal timing", () => {
  it("starts after the code roll and end text by default", () => {
    const logo = readLogo({ "logo.build": 2, "logo.delay": 0.5, "logo.enabled": true, "logo.hold": 1 });
    const plan = logoSchedule(logo, 6);
    expect(plan).not.toBeNull();
    expect(plan?.start).toBeCloseTo(6.5);
    expect(plan?.built).toBeCloseTo(8.5);
    expect(plan?.exitStart).toBeCloseTo(9.5);
    // Stay holds to the loop end, so nothing follows the hold.
    expect(plan?.end).toBeCloseTo(9.5);
  });

  it("can start at the loop start and adds its departure to the length", () => {
    const logo = readLogo({
      "logo.build": 2,
      "logo.delay": 0,
      "logo.enabled": true,
      "logo.exit": "shatter",
      "logo.hold": 1,
      "logo.timing": "start",
    });
    const plan = logoSchedule(logo, 6);
    expect(plan?.start).toBe(0);
    expect(plan?.end).toBeGreaterThan(plan?.exitStart ?? 0);
  });

  it("has no schedule while off", () => {
    expect(logoSchedule(readLogo({}), 3)).toBeNull();
  });
});

describe("text bars", () => {
  it("reads one bar per non-empty line with sane bounds", () => {
    const settings = readEngineSettings({ "bars.enabled": true, "bars.hold": 400, "bars.time": 0.01 });
    expect(settings.bars.hold).toBe(90);
    expect(settings.bars.time).toBe(0.5);
  });

  it("keeps the caption typography it is given", () => {
    const type = readEngineSettings({}).bars.type;
    expect(readBars({}, type).type.fontSize).toBe(26);
  });

  it("gives each bar its own motion and skips malformed or empty entries", () => {
    const type = readEngineSettings({}).bars.type;
    const bars = readBars(
      {
        "bars.enabled": true,
        "bars.items": [
          { enter: "bulletLeft", exit: "bulletRight", text: "ONE" },
          null,
          "stray",
          { enter: "nowhere", exit: "glitch", text: "TWO" },
          { enter: "decode", exit: "spin", text: "   " },
        ],
      },
      type,
    );
    expect(bars.items).toHaveLength(3);
    expect(bars.items[1]).toEqual({ enter: "left", exit: "glitch", text: "TWO" });
    expect(barLines(bars).map((item) => item.text)).toEqual(["ONE", "TWO"]);
  });

  it("starts from the default bars when none are stored", () => {
    const bars = readEngineSettings({ "bars.enabled": true }).bars;
    expect(bars.items).toEqual(DEFAULT_BAR_ITEMS);
    expect(new Set(bars.items.map((item) => item.exit)).size).toBeGreaterThan(2);
  });
});
