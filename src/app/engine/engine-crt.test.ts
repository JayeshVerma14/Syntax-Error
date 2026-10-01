import { describe, expect, it } from "vitest";

import { crtPhase, MAX_CRT_PASSES, readCrt } from "./engine-crt";

describe("CRT pass", () => {
  it("closes the loop seamlessly at every pass count", () => {
    for (let passes = 1; passes <= MAX_CRT_PASSES; passes += 1) {
      const start = crtPhase(0, passes);
      const end = crtPhase(1, passes);
      expect(end.bandTop).toBeCloseTo(start.bandTop, 6);
      expect(end.crawl).toBeCloseTo(start.crawl, 6);
      expect(end.shimmer).toBeCloseTo(start.shimmer, 6);
    }
  });

  it("rolls the band from above the frame to below it once per pass", () => {
    expect(crtPhase(0, 1).bandTop).toBeLessThan(0);
    expect(crtPhase(0.999, 1).bandTop).toBeGreaterThan(0.99);
    expect(crtPhase(0.25, 2).bandTop).toBeCloseTo(crtPhase(0.75, 2).bandTop, 6);
  });

  it("keeps the shimmer subtle", () => {
    for (let step = 0; step <= 100; step += 1) {
      const { shimmer } = crtPhase(step / 100, 3);
      expect(shimmer).toBeGreaterThan(0.9);
      expect(shimmer).toBeLessThan(1.1);
    }
  });

  it("clamps stored values into the ranges the panel offers", () => {
    const crt = readCrt({
      "crt.band": 400,
      "crt.enabled": true,
      "crt.passes": 9.4,
      "crt.spacing": 0,
      "crt.strength": -5,
    });
    expect(crt).toEqual({ band: 100, enabled: true, grain: 0, passes: 4, spacing: 2, strength: 0 });
  });
});
