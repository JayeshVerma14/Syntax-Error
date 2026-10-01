import { describe, expect, it } from "vitest";

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import { drawLogo, LOGO_STYLES, logoSchedule, readLogo, type LogoSettings } from "./engine-logo";
import type { LogoArt } from "./engine-logo-art";
import {
  cutTimesFor,
  LOGO_CAMERAS,
  lockDistance,
  logoBoxOf,
  projectPoint,
  shotAt,
  viewFor,
} from "./engine-logo-camera";
import { dockShare, planParts } from "./engine-logo-cinema";
import { LOCK_SETTLE_SECONDS, SCAN_SECONDS } from "./engine-logo-cinema-plan";
import { cutLogoParts, logoPartsFor } from "./engine-logo-parts";
import { LOGO_PARTICLES, morphStage } from "./engine-logo-particles";
import { POSE_STRIDE } from "./engine-logo-voxels";
import type { Paint2D } from "./engine-units";

const FRAME = { height: 1080, width: 1080 };

/** A logo of three separate shapes: a tall bar, a wide slab and a small square. */
function testArt(): LogoArt {
  const cells: number[] = [];
  const add = (column: number, row: number, r = 255, g = 255, b = 255) => cells.push(column, row, r, g, b);
  for (let row = 0; row < 12; row += 1) for (let column = 0; column < 3; column += 1) add(column, row);
  for (let row = 2; row < 8; row += 1) for (let column = 6; column < 22; column += 1) add(column, row, 255, 80, 30);
  for (let row = 9; row < 12; row += 1) for (let column = 26; column < 29; column += 1) add(column, row, 40, 160, 255);
  const blocks = Float32Array.from(cells);
  const colors: string[] = [];
  for (let index = 0; index < blocks.length; index += 5) {
    colors.push(`rgb(${blocks[index + 2]},${blocks[index + 3]},${blocks[index + 4]})`);
  }
  return { aspect: 12 / 30, blocks, colors, cols: 30, count: blocks.length / 5, crisp: null, key: "test", rows: 12 };
}

const CRISP = { height: 560, tag: "crisp", width: 1400 } as unknown as OffscreenCanvas;

const format = (value: unknown): string => {
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(3) : String(value);
  if (typeof value === "string") return value;
  if (value === CRISP) return "[crisp]";
  return typeof value === "object" && value !== null ? "[object]" : String(value);
};

/** A 2D context that records every call and property write, in order. */
function recorder(): { context: Paint2D; log: string[] } {
  const log: string[] = [];
  const state: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, key) {
      const name = String(key);
      if (name in state) return state[name];
      if (name === "measureText") {
        return (text: string) => {
          log.push(`measureText(${text})`);
          return { width: text.length * 10 };
        };
      }
      if (name === "createLinearGradient" || name === "createRadialGradient") {
        return (...args: unknown[]) => {
          log.push(`${name}(${args.map(format).join(",")})`);
          return { addColorStop: (offset: number, colour: string) => log.push(`stop(${format(offset)},${colour})`) };
        };
      }
      return (...args: unknown[]) => {
        log.push(`${name}(${args.map(format).join(",")})`);
      };
    },
    set(_target, key, value) {
      state[String(key)] = value;
      log.push(`${String(key)}=${format(value)}`);
      return true;
    },
  };
  return { context: new Proxy(state, handler) as unknown as Paint2D, log };
}

function draw(logo: LogoSettings, art: LogoArt, time: number, pulse?: AudioPulse): string[] {
  const { context, log } = recorder();
  const plan = logoSchedule(logo, 0);
  if (pulse) drawLogo(context, FRAME, logo, art, CRISP, plan, time, pulse);
  else drawLogo(context, FRAME, logo, art, CRISP, plan, time);
  return log;
}

const logoWith = (values: Readonly<Record<string, unknown>>) =>
  readLogo({ "logo.enabled": true, "logo.timing": "start", ...values });

const BEAT: AudioPulse = { bass: 0.8, beat: 1, beatAge: 0.02, beatIndex: 3, beatStrength: 1, high: 0.7, mid: 0.5 };

/** Build shares and seconds after the lock worth checking: early, mid, docking, just locked, held. */
function momentsOf(logo: LogoSettings): number[] {
  const plan = logoSchedule(logo, 0);
  if (!plan) return [];
  const span = plan.built - plan.start;
  const leaving = logo.exit === "hold" ? [] : [0.03, 0.2, 0.6, 1.1].map((seconds) => plan.exitStart + seconds);
  return [0.02, 0.2, 0.5, 0.8, 0.97]
    .map((u) => plan.start + span * u)
    .concat([plan.built + 0.05, plan.built + 1.2], leaving.filter((time) => time < plan.end));
}

describe("logo settings", () => {
  it("defaults to a fast cinematic build through the cut camera", () => {
    const logo = readLogo({});
    expect(logo.style).toBe("cinematic");
    expect(logo.camera).toBe("cuts");
    expect(logo.particle).toBe("blocks");
    expect(logo.build).toBeGreaterThanOrEqual(2.4);
    expect(logo.build).toBeLessThanOrEqual(3);
    expect(LOGO_STYLES).toContain("dots");
    expect(LOGO_CAMERAS).toEqual(["cuts", "orbit", "fly", "front"]);
    expect(LOGO_PARTICLES).toEqual(["blocks", "dots", "dashes", "glyphs", "plus", "boxed", "mixed"]);
  });

  it("clamps every number and falls back on unknown options", () => {
    const logo = readLogo({
      "logo.camera": "dolly",
      "logo.depth": 9000,
      "logo.impact": -4,
      "logo.particle": "stars",
      "logo.parts": 99,
      "logo.style": "wobble",
      "logo.swing": 400,
    });
    expect(logo.camera).toBe("cuts");
    expect(logo.depth).toBe(6);
    expect(logo.impact).toBe(0);
    expect(logo.particle).toBe("blocks");
    expect(logo.parts).toBe(16);
    expect(logo.style).toBe("cinematic");
    expect(logo.swing).toBe(1.5);
  });

  it("lets a cinematic lock finish its scan, ring and sparks before a departure", () => {
    const plan = logoSchedule(logoWith({ "logo.exit": "shatter", "logo.hold": 0 }), 0);
    expect(LOCK_SETTLE_SECONDS).toBeGreaterThanOrEqual(SCAN_SECONDS);
    expect((plan?.exitStart ?? 0) - (plan?.built ?? 0)).toBeCloseTo(LOCK_SETTLE_SECONDS);
    // A cinematic rewind adds the time it takes to run the scan back up the mark.
    const shatter = logoSchedule(logoWith({ "logo.exit": "shatter" }), 0);
    const rewind = logoSchedule(logoWith({ "logo.exit": "reverse" }), 0);
    const leaving = (value: typeof plan) => (value?.end ?? 0) - (value?.exitStart ?? 0);
    expect(leaving(rewind) - leaving(shatter)).toBeCloseTo(SCAN_SECONDS);
    const flat = logoSchedule(logoWith({ "logo.exit": "shatter", "logo.hold": 0, "logo.style": "fly" }), 0);
    expect(flat?.exitStart).toBeCloseTo(flat?.built ?? -1);
  });
});

describe("logo parts", () => {
  it("cuts connected shapes, slicing the biggest when more parts are wanted", () => {
    const art = testArt();
    expect(cutLogoParts(art, 3).count).toBe(3);
    const parts = cutLogoParts(art, 7);
    expect(parts.count).toBe(7);
    // Every block lands in exactly one part.
    const seen = new Set<number>();
    for (let part = 0; part < parts.count; part += 1) {
      for (let cursor = parts.partStart[part]; cursor < parts.partStart[part + 1]; cursor += 1) {
        expect(parts.partOf[parts.order[cursor]]).toBe(part);
        seen.add(parts.order[cursor]);
      }
    }
    expect(seen.size).toBe(art.count);
  });

  it("merges the smallest shapes when fewer parts are wanted", () => {
    const parts = cutLogoParts(testArt(), 2);
    expect(parts.count).toBe(2);
    // The biggest part docks first as the anchor.
    expect(parts.centres[parts.rankPart[0] * 4 + 2]).toBe(105);
  });

  it("computes the cut once per logo and part count", () => {
    const art = testArt();
    expect(logoPartsFor(art, 5)).toBe(logoPartsFor(art, 5));
    expect(logoPartsFor(art, 6)).not.toBe(logoPartsFor(art, 5));
  });

  it("docks parts in order, the first early, and the last one on the lock", () => {
    for (let rank = 1; rank < 7; rank += 1) expect(dockShare(rank, 7)).toBeGreaterThan(dockShare(rank - 1, 7));
    expect(dockShare(0, 7)).toBeLessThan(0.15);
    expect(dockShare(6, 7)).toBe(1);
  });

  it("overshoots each dock and snaps back onto it", () => {
    const art = testArt();
    const parts = logoPartsFor(art, 3);
    const box = logoBoxOf(FRAME, 45, { x: 0, y: 0 }, art.aspect, art.cols);
    const lock = lockDistance(box.width, box.height);
    const logo = { camera: "cuts" as const, impact: 0.7, swing: 1 };
    const part = parts.rankPart[1];
    const o = part * POSE_STRIDE;
    const dockX = parts.centres[part * 4] * box.cell - box.width / 2;
    const dockY = parts.centres[part * 4 + 1] * box.cell - box.height / 2;
    const at = (u: number) => planParts(parts, box, logo, lock, u, 2.8, 0.7);
    const start = at(0.0001);
    const dock = dockShare(1, parts.count);
    const late = at(dock - 0.004);
    // Late in the flight the part is past its dock, on the far side from where it started.
    const along =
      (late[o + 9] - dockX) * (start[o + 9] - dockX) +
      (late[o + 10] - dockY) * (start[o + 10] - dockY) +
      late[o + 11] * start[o + 11];
    expect(along).toBeLessThan(0);
    const docked = at(dock);
    expect(docked[o + 9]).toBeCloseTo(dockX, 6);
    expect(docked[o + 10]).toBeCloseTo(dockY, 6);
  });

  it("morphs mixed particles from dashes to solid blocks as they land", () => {
    expect(morphStage(0, 5, 0)).toBe(0);
    expect(morphStage(1, 5, 0)).toBe(3);
    const stages = new Set<number>();
    for (let seed = 0; seed < 50; seed += 1) stages.add(morphStage(0.55, seed, 2));
    expect(stages.size).toBeGreaterThan(1);
  });
});

describe("logo camera", () => {
  it("ends every camera mode square on at the lock, where the logo plane lands on the flat box", () => {
    const box = logoBoxOf(FRAME, 45, { x: 0.1, y: -0.2 }, 0.4, 40);
    const lock = lockDistance(box.width, box.height);
    for (const mode of LOGO_CAMERAS) {
      const view = viewFor(shotAt(mode, 1, 1.2), lock, box.width, box.centreX, box.centreY);
      for (const [x, y] of [
        [0, 0],
        [-box.width / 2, -box.height / 2],
        [box.width / 2, box.height / 2],
      ]) {
        const point = projectPoint(view, x, y, 0);
        expect(point?.x).toBeCloseTo(box.centreX + x, 6);
        expect(point?.y).toBeCloseTo(box.centreY + y, 6);
      }
    }
  });

  it("plays a short Cuts build as one shot, and never shows the orbit mirrored", () => {
    expect(cutTimesFor(1)).toEqual([]);
    expect(cutTimesFor(2.8).length).toBe(2);
    expect(shotAt("cuts", 0.2, 1, { x: 0, y: 0 }, 1).index).toBe(shotAt("cuts", 0.9, 1, { x: 0, y: 0 }, 1).index);
    for (let u = 0; u <= 1; u += 0.05) expect(Math.abs(shotAt("orbit", u, 1).yaw)).toBeLessThanOrEqual((70 * Math.PI) / 180);
  });

  it("opens the closing Cuts shot at a readable angle and whips to the front in about a fifth of a second", () => {
    const at = (seconds: number) => shotAt("cuts", 0.64 + seconds / 2.8, 1, { x: 0, y: 0 }, 2.8);
    expect(Math.abs(at(0.001).yaw)).toBeLessThan((50 * Math.PI) / 180);
    expect(Math.abs(at(0.001).yaw)).toBeGreaterThan((30 * Math.PI) / 180);
    expect(Math.abs(at(0.12).yaw)).toBeGreaterThan((8 * Math.PI) / 180);
    expect(Math.abs(at(0.3).yaw)).toBeLessThan((1 * Math.PI) / 180);
  });

  it("turns away from square on while it builds", () => {
    for (const mode of ["cuts", "orbit", "fly"] as const) {
      const shot = shotAt(mode, 0.2, 1);
      expect(Math.abs(shot.yaw) + Math.abs(shot.pitch) + Math.abs(shot.distance - 1)).toBeGreaterThan(0.05);
    }
  });
});

describe("drawing the logo", () => {
  const art = testArt();
  const variants: Readonly<Record<string, unknown>>[] = [
    ...LOGO_STYLES.map((style) => ({ "logo.style": style })),
    ...LOGO_CAMERAS.map((camera) => ({ "logo.camera": camera })),
    ...LOGO_PARTICLES.map((particle) => ({ "logo.particle": particle, "logo.style": "cinematic" })),
    ...LOGO_PARTICLES.map((particle) => ({ "logo.particle": particle, "logo.style": "swarm" })),
    { "logo.exit": "shatter", "logo.hold": 0.5 },
    { "logo.exit": "reverse", "logo.hold": 0.5 },
    { "logo.exit": "glitch", "logo.hold": 0.5, "logo.style": "build", "logo.particle": "mixed" },
    { "logo.exit": "reverse", "logo.hold": 0.5, "logo.style": "dots" },
    { "logo.tint": false, "logo.style": "glitch" },
  ];

  it("is a pure function of its inputs", () => {
    for (const values of variants) {
      const logo = logoWith(values);
      for (const time of momentsOf(logo)) expect(draw(logo, art, time)).toEqual(draw(logo, art, time));
    }
  });

  it("draws exactly the same with the silent pulse as with none", () => {
    for (const values of variants) {
      const logo = logoWith(values);
      for (const time of momentsOf(logo)) expect(draw(logo, art, time, SILENT_PULSE)).toEqual(draw(logo, art, time));
    }
  });

  it("answers a strong beat in every style, building and locked", () => {
    for (const style of LOGO_STYLES) {
      const logo = logoWith({ "logo.style": style });
      const plan = logoSchedule(logo, 0);
      if (!plan) throw new Error("no plan");
      for (const time of [plan.start + (plan.built - plan.start) * 0.5, plan.built + 1]) {
        expect(draw(logo, art, time, BEAT)).not.toEqual(draw(logo, art, time));
        expect(draw(logo, art, time, BEAT)).toEqual(draw(logo, art, time, BEAT));
      }
    }
  });

  it("locks into the crisp logo exactly in the flat box", () => {
    for (const style of LOGO_STYLES) {
      const logo = logoWith({ "logo.style": style });
      const plan = logoSchedule(logo, 0);
      const box = logoBoxOf(FRAME, logo.size, logo.position, art.aspect, art.cols);
      const log = draw(logo, art, (plan?.built ?? 0) + 1.2);
      const expected = `drawImage([crisp],${[box.left, box.top, box.width, box.height].map(format).join(",")})`;
      const centred = `drawImage([crisp],${[-box.width / 2, -box.height / 2, box.width, box.height].map(format).join(",")})`;
      expect(log.includes(expected) || log.includes(centred)).toBe(true);
    }
  });

  it("keeps the HUD text inside the frame's safe area at any size and camera", () => {
    const wide = { height: 1080, width: 1920 };
    for (const values of [{ "logo.size": 100 }, { "logo.size": 70, "logo.camera": "orbit" }, { "logo.style": "fly", "logo.size": 100 }]) {
      const logo = logoWith(values);
      const plan = logoSchedule(logo, 0);
      if (!plan) throw new Error("no plan");
      for (const u of [0.05, 0.3, 0.5, 0.8, 1.2]) {
        const { context, log } = recorder();
        drawLogo(context, wide, logo, testArt(), CRISP, plan, plan.start + (plan.built - plan.start) * u);
        for (const line of log.filter((entry) => entry.startsWith("fillText("))) {
          const [x, y] = line.slice(0, -1).split(",").slice(-2).map(Number);
          expect(x).toBeGreaterThanOrEqual(0.04 * 1080 - 0.01);
          expect(x).toBeLessThanOrEqual(1920 - 0.04 * 1080 + 0.01);
          expect(y).toBeGreaterThan(0.04 * 1080);
          expect(y).toBeLessThan(1080 - 0.04 * 1080);
        }
      }
    }
  });

  it("draws nothing at a time that is not a number", () => {
    const logo = logoWith({});
    expect(draw(logo, testArt(), Number.NaN)).toEqual([]);
    expect(draw(logo, testArt(), Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("draws nothing while off, before its start, or with no logo", () => {
    const logo = logoWith({ "logo.delay": 1 });
    expect(draw(logo, art, 0.5)).toEqual([]);
    expect(draw(readLogo({}), art, 5)).toEqual([]);
    const { context, log } = recorder();
    drawLogo(context, FRAME, logo, null, CRISP, logoSchedule(logo, 0), 3);
    expect(log).toEqual([]);
  });
});
