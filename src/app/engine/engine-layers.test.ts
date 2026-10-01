import { describe, expect, it } from "vitest";

import { dilateMask } from "./engine-backdrop";
import { collectBurst, strokeGlyph, type BurstGrid } from "./engine-burst";
import { decodedCharacter, typedCount } from "./engine-caption";
import { MAX_SWIRL_PARTICLES, SCRAMBLE_GLYPHS } from "./engine-constants";
import { pickGlyph, type GlyphPick } from "./engine-glyphs";
import type { BurstSettings, SwirlSettings } from "./engine-settings";
import { collectSwirl } from "./engine-swirl";

const RAMP = [".", "-", "+", "#"] as const;

function pick(overrides: Partial<GlyphPick>): string | null {
  return pickGlyph({
    cols: 10,
    column: 0,
    fixed: true,
    glyphs: RAMP,
    level: 0.5,
    phrase: "",
    row: 0,
    shift: 0,
    useRamp: true,
    ...overrides,
  });
}

describe("glyph choice", () => {
  it("leaves the faintest band of a fixed-size ramp empty", () => {
    const step = 1 / (RAMP.length + 1);
    expect(pick({ level: step * 0.5 })).toBeNull();
    expect(pick({ level: step * 1.01 })).toBe(".");
    expect(pick({ level: 0.9999 })).toBe("#");
  });

  it("keeps a character in every lit cell when size carries the tone", () => {
    expect(pick({ fixed: false, level: 0.01 })).toBe(".");
    expect(pick({ fixed: false, level: 0 })).toBeNull();
  });

  it("spells a phrase in reading order across the whole grid", () => {
    const phrase = "systemupdated";
    const spelled = Array.from({ length: 26 }, (_, index) =>
      pick({ column: index % 10, phrase, row: Math.floor(index / 10) }),
    ).join("");
    expect(spelled).toBe(phrase + phrase);
  });

  it("leaves a phrase's spaces as empty cells and scrambles on a motion shift", () => {
    expect(pick({ column: 1, phrase: "a b" })).toBeNull();
    expect(SCRAMBLE_GLYPHS).toContain(pick({ phrase: "code", shift: 3 }));
  });
});

describe("field clearance", () => {
  it("returns the mask unchanged at zero clearance", () => {
    const mask = new Uint8Array([0, 1, 0, 0]);
    expect(dilateMask(mask, 2, 2, 0)).toBe(mask);
  });

  it("grows every occupied cell by a square neighbourhood, clipped at the edges", () => {
    const cols = 13;
    const rows = 9;
    const mask = new Uint8Array(cols * rows).map((_, index) =>
      (Math.imul(index + 7, 2_654_435_761) >>> 0) / 4_294_967_296 < 0.06 ? 1 : 0,
    );
    expect(mask.some((cell) => cell === 1)).toBe(true);
    for (const radius of [1, 2, 3]) {
      const grown = dilateMask(mask, cols, rows, radius);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < cols; column += 1) {
          let near = 0;
          for (let y = Math.max(0, row - radius); y <= Math.min(rows - 1, row + radius); y += 1) {
            for (let x = Math.max(0, column - radius); x <= Math.min(cols - 1, column + radius); x += 1) {
              near |= mask[y * cols + x];
            }
          }
          expect(grown[row * cols + column]).toBe(near);
        }
      }
    }
  });
});

describe("burst", () => {
  const grid: BurstGrid = { cellHeight: 20, cellWidth: 12, cols: 90, height: 1080, rows: 54, width: 1080 };
  const burst: BurstSettings = {
    count: 2,
    enabled: true,
    origin: { x: 0, y: 0 },
    particle: "glyphs",
    rays: 14,
    reach: 90,
    speed: 100,
    thickness: 1.2,
  };
  const burstGlyphs = ["-", "\\", "|", "/", "*", "+", "o", ":", ".", "'", "`", ",", "@", "#", "%"];
  const reach = (Math.hypot(grid.width, grid.height) * burst.reach) / 100;
  const distanceFromOrigin = (cell: { column: number; row: number }) =>
    Math.hypot((cell.column + 0.5) * grid.cellWidth - 540, (cell.row + 0.5) * grid.cellHeight - 540);

  it("draws each streak in the character whose stroke follows it", () => {
    const quarter = Math.PI / 4;
    expect([0, quarter, 2 * quarter, 3 * quarter, 4 * quarter, -quarter].map(strokeGlyph)).toEqual([
      "-",
      "\\",
      "|",
      "/",
      "-",
      "/",
    ]);
  });

  it("starts every burst empty and returns to its first frame at the loop point at any speed", () => {
    for (const progress of [0, 0.5, 1]) {
      expect(collectBurst(burst, grid, progress, null)).toEqual([]);
    }
    for (const speed of [25, 60, 100, 250, 400]) {
      const settings = { ...burst, speed };
      expect(collectBurst(settings, grid, 1, null)).toEqual(collectBurst(settings, grid, 0, null));
    }
  });

  it("explodes out of the origin: the streaks leave the centre almost at once", () => {
    // Progress 0.2 over two bursts is 40% into the first one.
    const cells = collectBurst(burst, grid, 0.2, null);
    expect(cells.length).toBeGreaterThan(50);
    for (const cell of cells) expect(burstGlyphs).toContain(cell.glyph);
    // Only dust settles near the origin; every streak has flown clear of it.
    const streaks = cells.filter((cell) => ["-", "\\", "|", "/"].includes(cell.glyph));
    expect(streaks.length).toBeGreaterThan(10);
    expect(Math.min(...streaks.map(distanceFromOrigin))).toBeGreaterThan(reach * 0.1);
    // Just after firing, the flash fills the centre.
    const flash = collectBurst(burst, grid, 0.03, null);
    expect(flash.some((cell) => distanceFromOrigin(cell) < reach * 0.05)).toBe(true);
  });

  it("keeps off occupied cells and draws nothing when off", () => {
    const cells = collectBurst(burst, grid, 0.2, null);
    const occupied = new Uint8Array(grid.cols * grid.rows);
    for (const cell of cells) occupied[cell.row * grid.cols + cell.column] = 1;
    expect(collectBurst(burst, grid, 0.2, occupied)).toEqual([]);
    expect(collectBurst({ ...burst, enabled: false }, grid, 0.2, null)).toEqual([]);
  });

  it("finishes fast bursts early in their slot and overlaps slow ones", () => {
    const fast = { ...burst, count: 1, speed: 400 };
    expect(collectBurst(fast, grid, 0.05, null).length).toBeGreaterThan(20);
    expect(collectBurst(fast, grid, 0.3, null)).toEqual([]);
    // At a quarter speed the three previous bursts are still flying at the loop start.
    const slow = { ...burst, count: 1, speed: 25 };
    expect(collectBurst(slow, grid, 0, null).length).toBeGreaterThan(20);
  });
});

describe("swirl", () => {
  const swirl: SwirlSettings = {
    band: 50,
    center: { x: 0.1, y: -0.2 },
    count: 240,
    enabled: true,
    particle: "glyphs",
    radius: 42,
    turns: 2,
  };

  it("returns every particle to its first place at the loop point", () => {
    const first = collectSwirl(swirl, 1080, 1080, 0);
    const last = collectSwirl(swirl, 1080, 1080, 1);
    expect(last).toHaveLength(first.length);
    last.forEach((particle, index) => {
      expect(particle.glyph).toBe(first[index].glyph);
      expect(particle.x).toBeCloseTo(first[index].x, 6);
      expect(particle.y).toBeCloseTo(first[index].y, 6);
    });
  });

  it("moves mid-loop, caps the particle count and draws nothing when off", () => {
    const first = collectSwirl(swirl, 1080, 1080, 0);
    const mid = collectSwirl(swirl, 1080, 1080, 0.3);
    expect(mid.some((particle, index) => Math.abs(particle.x - first[index].x) > 5)).toBe(true);
    expect(collectSwirl({ ...swirl, count: 5000 }, 1080, 1080, 0.3)).toHaveLength(MAX_SWIRL_PARTICLES);
    expect(collectSwirl({ ...swirl, enabled: false }, 1080, 1080, 0.3)).toEqual([]);
  });
});

describe("caption reveals", () => {
  it("types on, holds the full line, then backspaces to empty before the loop closes", () => {
    const total = 16;
    expect(typedCount(total, 0)).toBe(0);
    expect(typedCount(total, 0.6)).toBe(total);
    expect(typedCount(total, 0.89)).toBe(total);
    expect(typedCount(total, 0.9999)).toBe(0);
    let previous = 0;
    for (let step = 0; step <= 90; step += 1) {
      const count = typedCount(total, step / 100);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    for (let step = 90; step < 100; step += 1) {
      const count = typedCount(total, step / 100);
      expect(count).toBeLessThanOrEqual(previous);
      previous = count;
    }
  });

  it("decodes every character by the middle of the loop and scrambles at the seam", () => {
    const text = "System > Updated";
    const at = (progress: number) =>
      [...text].map((character, index) => decodedCharacter(character, index, text.length, progress));
    expect(at(0.7).join("")).toBe(text);
    for (const progress of [0, 0.995]) {
      at(progress).forEach((character, index) => {
        if (text[index] === " ") expect(character).toBe(" ");
        else expect(SCRAMBLE_GLYPHS).toContain(character);
      });
    }
  });
});
