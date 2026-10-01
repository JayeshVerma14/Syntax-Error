import { describe, expect, it } from "vitest";

import {
  createParticlePicker,
  readLayerParticle,
  readParticles,
  strokeHeading,
} from "./engine-particles";

describe("field particles", () => {
  it("follows the unit shape when matching marks", () => {
    expect(createParticlePicker("match", true)(3, 4, -1).mark).toBe("glyph");
    const dot = createParticlePicker("match", false)(3, 4, -1);
    expect(dot.mark).toBe("circle");
    expect(dot.size).toBeCloseTo(0.16);
  });

  it("frames each crosshair lattice cell with brackets opening inwards", () => {
    const pick = createParticlePicker("crosshair", true);
    const corners = [
      [0, 0, 0],
      [2, 0, 1],
      [2, 2, 2],
      [0, 2, 3],
    ] as const;
    for (const [column, row, quarter] of corners) {
      const mark = pick(column, row, -1);
      expect(mark.mark).toBe("bracket");
      expect(mark.quarter).toBe(quarter);
    }
    expect(pick(1, 1, -1).mark).toBe("plus");
    expect(pick(1, 1, -1).size).toBeGreaterThan(pick(1, 0, -1).size);
  });

  it("morphs through a sequence that starts from the chosen particle", () => {
    const pick = createParticlePicker("boxes", false);
    expect(pick(0, 0, 0).mark).toBe("boxdot");
    const stages = new Set([0, 1, 2, 3].map((stage) => pick(0, 0, stage).mark));
    expect(stages.size).toBe(4);
  });

  it("mixes particles per cell, the same way every frame", () => {
    const pick = createParticlePicker("mix", false);
    const first = Array.from({ length: 40 }, (_, index) => pick(index, 7, -1).mark);
    const again = Array.from({ length: 40 }, (_, index) => pick(index, 7, -1).mark);
    expect(again).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(2);
  });

  it("reads particle settings with sane bounds", () => {
    expect(readParticles({ "field.particle": "nope", "field.size": 9000 })).toEqual({
      kind: "match",
      size: 250,
    });
    expect(readLayerParticle({ "swirl.particle": "dashes" }, "swirl.particle")).toBe("dashes");
    expect(readLayerParticle({}, "burst.particle")).toBe("glyphs");
  });

  it("lays dashes along a burst stroke", () => {
    expect(strokeHeading("|")).toBeCloseTo(Math.PI / 2);
    expect(strokeHeading("-")).toBe(0);
  });
});
