import { beforeAll, describe, expect, it, vi } from "vitest";

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import {
  DATA_TEXT_TYPE,
  DEFAULT_DATA_ITEMS,
  MAX_DATA_ITEMS,
  dataTextAfter,
  dataTextLength,
  dataTextTargets,
  drawDataText,
  readDataItems,
  readDataText,
} from "./engine-datatext";
import { beatScramble, markerMusic, readMusic, targetsUnlocked } from "./engine-datatext-audio";
import { markerCentres, tileBlock } from "./engine-datatext-marks";
import { layoutDataText, type Bounds, type DataLayout } from "./engine-datatext-layout";
import {
  decodeInGlyph,
  decodeOutGlyph,
  exitSeconds,
  itemLines,
  planDataText,
  revealSeconds,
  scrambleGlyph,
} from "./engine-datatext-timing";
import type { Paint2D } from "./engine-units";

const on = (values: Record<string, unknown> = {}) =>
  readDataText({ [dataTextTargets.enabled]: true, ...values }, DATA_TEXT_TYPE);

describe("data text settings", () => {
  it("is off by default and starts from the reference-style layout", () => {
    const settings = readDataText({}, DATA_TEXT_TYPE);
    expect(settings.enabled).toBe(false);
    expect(settings.items).toBe(DEFAULT_DATA_ITEMS);
    expect(settings.items.length).toBe(9);
    expect(new Set(settings.items.map((item) => item.style))).toEqual(
      new Set(["label", "bullet", "wordmark", "boxed"]),
    );
    expect(settings.type.color).toBe("#FF2A2A");
    expect(settings.type.fontId).toBe("ibm-plex-mono");
  });

  it("clamps every number and falls back on unknown choices", () => {
    const settings = on({
      [dataTextTargets.exit]: "explode",
      [dataTextTargets.hold]: -4,
      [dataTextTargets.reveal]: 3,
      [dataTextTargets.stagger]: 99,
      [dataTextTargets.start]: Number.NaN,
      [dataTextTargets.box]: "red",
    });
    expect(settings.exit).toBe("decode");
    expect(settings.reveal).toBe("decode");
    expect(settings.hold).toBe(0);
    expect(settings.stagger).toBe(5);
    expect(settings.start).toBe(0.2);
    expect(settings.box).toBe("#C4DDD4");
  });

  it("reads collection records defensively", () => {
    const items = readDataItems({
      [dataTextTargets.items]: [
        { position: { x: 4, y: -9 }, size: 9000, style: "boxed", text: "OK" },
        { size: 20, style: "label" },
        "not a record",
        null,
        [1, 2],
        { delay: -3, position: "centre", size: "big", style: "neon", text: "FALLBACKS" },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ delay: 0, position: { x: 1, y: -1 }, size: 240, style: "boxed", text: "OK" });
    expect(items[1]).toEqual({ delay: 0, position: { x: 0, y: 0 }, size: 16, style: "label", text: "FALLBACKS" });
  });

  it("keeps a cleared list empty, uses defaults when missing, and caps a runaway list", () => {
    expect(readDataItems({ [dataTextTargets.items]: [] })).toEqual([]);
    expect(readDataItems({ [dataTextTargets.items]: "junk" })).toBe(DEFAULT_DATA_ITEMS);
    const many = Array.from({ length: 200 }, (_, index) => ({ text: `ITEM ${index}` }));
    expect(readDataItems({ [dataTextTargets.items]: many })).toHaveLength(MAX_DATA_ITEMS);
  });
});

describe("data text lines and glyphs", () => {
  it("breaks lines on a bar and applies the text case", () => {
    expect(itemLines(" built for | speed ", "uppercase")).toEqual(["BUILT FOR", "SPEED"]);
    expect(itemLines("|A||B|", "original")).toEqual(["A", "", "B"]);
    expect(itemLines("   ", "original")).toEqual([]);
  });

  it("scrambles a character into one of the same kind", () => {
    for (let tick = 0; tick < 40; tick += 1) {
      expect(scrambleGlyph("7", 3, tick)).toMatch(/^[0-9]$/);
      expect(scrambleGlyph("Q", 3, tick)).toMatch(/^[A-Z]$/);
      expect(scrambleGlyph("q", 3, tick)).toMatch(/^[a-z]$/);
    }
    expect(scrambleGlyph("°", 1, 2)).toBe(scrambleGlyph("°", 1, 2));
  });

  it("decodes from nothing, through noise, to the character", () => {
    expect(decodeInGlyph("A", 5, 10, 0, 1, 0)).toBe("");
    expect(decodeInGlyph("A", 0, 10, 0.01, 1, 0)).toMatch(/^[A-Z]$/);
    expect(decodeInGlyph("A", 5, 10, 5, 1, 0)).toBe("A");
    // Decoding out clears from the line's end first.
    expect(decodeOutGlyph("A", 0, 10, 0.05, 1, 0)).toBe("A");
    expect(decodeOutGlyph("A", 9, 10, 5, 1, 0)).toBe("");
  });

  it("keeps reveals quick and gives styles their own lead", () => {
    const label = revealSeconds("label", "decode", ["SUCCESS IS NOT", "AN ACCIDENT"]);
    expect(label).toBeGreaterThan(0.2);
    expect(label).toBeLessThan(0.7);
    expect(revealSeconds("bullet", "decode", ["24/7"])).toBeGreaterThan(revealSeconds("label", "decode", ["24/7"]));
    expect(revealSeconds("wordmark", "decode", ["SYNTAX ERROR"])).toBeLessThan(1);
    expect(revealSeconds("label", "decode", [])).toBe(0);
    expect(exitSeconds("cut", "label", ["X"])).toBe(0);
    expect(exitSeconds("decode", "boxed", ["X"])).toBeGreaterThan(exitSeconds("decode", "label", ["X"]));
  });
});

describe("data text timing", () => {
  it("staggers items in list order, with each item's own delay on top", () => {
    const items = [
      { delay: 0, position: { x: 0, y: 0 }, size: 16, style: "label" as const, text: "ONE" },
      { delay: 0.5, position: { x: 0, y: 0 }, size: 16, style: "label" as const, text: "TWO" },
    ];
    const plan = planDataText(on({ [dataTextTargets.items]: items, [dataTextTargets.stagger]: 0.1, [dataTextTargets.start]: 1 }), 0);
    expect(plan.items[0].start).toBeCloseTo(1);
    expect(plan.items[1].start).toBeCloseTo(1.6);
    expect(plan.first).toBeCloseTo(1);
    // The block holds once its last item is shown, then leaves in a tight cascade.
    expect(plan.leave - plan.items[1].shown).toBeCloseTo(1.8);
    expect(plan.items[1].exit - plan.items[0].exit).toBeCloseTo(0.03);
  });

  it("leaves the default block in one quick cascade", () => {
    const plan = planDataText(on(), 0);
    const exits = plan.items.map((item) => item.exit);
    const ends = plan.items.map((item) => item.end);
    expect(Math.min(...exits)).toBeCloseTo(plan.leave);
    expect(Math.max(...exits) - plan.leave).toBeLessThanOrEqual(0.21);
    expect(plan.end - plan.leave).toBeLessThanOrEqual(0.45);
    expect(Math.max(...ends)).toBeLessThanOrEqual(plan.end);
  });

  it("ignores items without text and treats a broken start point as zero", () => {
    const blank = [
      { position: { x: 0, y: 0 }, text: "" },
      { position: { x: 0, y: 0 }, text: "   |  " },
    ];
    expect(dataTextLength(on({ [dataTextTargets.items]: blank }))).toBe(0);
    const mixed = planDataText(on({ [dataTextTargets.items]: [...blank, { text: "ONE" }], [dataTextTargets.stagger]: 0.1 }), 0);
    // A blank item keeps its place in the stagger but never shows.
    expect(mixed.first).toBeCloseTo(0.2 + 0.2);
    expect(mixed.items[0].start).toBe(Infinity);
    const broken = planDataText(on(), 4, Number.NaN);
    expect(Number.isFinite(broken.first) && Number.isFinite(broken.end)).toBe(true);
    expect(dataTextLength(on(), Number.NaN)).toBeCloseTo(dataTextLength(on()));
    expect(Number.isFinite(dataTextLength(on(), Number.POSITIVE_INFINITY))).toBe(true);
  });

  it("starts after the logo, with it, or at the loop start", () => {
    const logo = { end: 9, start: 5 };
    expect(dataTextAfter(on(), 4, logo)).toBe(9);
    expect(dataTextAfter(on({ [dataTextTargets.timing]: "logo" }), 4, logo)).toBe(5);
    expect(dataTextAfter(on(), 4, null)).toBe(4);
    expect(dataTextAfter(on(), Number.NaN, null)).toBe(0);
    const atStart = on({ [dataTextTargets.timing]: "start" });
    expect(planDataText(atStart, 0, dataTextAfter(atStart, 4, logo)).first).toBeCloseTo(0.2);
  });

  it("shortens the hold so the loop closes on an empty frame", () => {
    const settings = on({ [dataTextTargets.hold]: 10 });
    const plan = planDataText(settings, 4);
    expect(plan.hold).toBeLessThan(10);
    expect(plan.end).toBeLessThanOrEqual(4);
    // The natural length ignores the loop, so the loop can follow it.
    expect(dataTextLength(settings)).toBeGreaterThan(10);
  });

  it("cuts every item at once, and a stay never ends", () => {
    const cut = planDataText(on({ [dataTextTargets.exit]: "cut" }), 0);
    expect(new Set(cut.items.map((item) => item.end)).size).toBe(1);
    expect(cut.leave).toBe(cut.end);
    const stay = planDataText(on({ [dataTextTargets.exit]: "stay" }), 4);
    expect(stay.end).toBe(Infinity);
    expect(dataTextLength(on({ [dataTextTargets.exit]: "stay" }))).toBeGreaterThan(2);
  });

  it("waits for the code roll and end text unless told to start at once", () => {
    const after = planDataText(on({ [dataTextTargets.start]: 0.5 }), 0, 6);
    expect(after.first).toBeCloseTo(6.5);
    const withLogo = planDataText(on({ [dataTextTargets.start]: 0.5, [dataTextTargets.timing]: "logo" }), 0, 6);
    expect(withLogo.first).toBeCloseTo(6.5);
    const atStart = planDataText(on({ [dataTextTargets.start]: 0.5, [dataTextTargets.timing]: "start" }), 0, 6);
    expect(atStart.first).toBeCloseTo(0.5);
    expect(dataTextLength(on(), 6)).toBeCloseTo(dataTextLength(on()) + 6);
  });

  it("is zero length while off", () => {
    expect(dataTextLength(readDataText({}, DATA_TEXT_TYPE))).toBe(0);
    expect(dataTextLength(on({ [dataTextTargets.items]: [] }))).toBe(0);
  });
});

describe("data text marks", () => {
  const layout = (block: DataLayout["block"]): DataLayout => ({
    block,
    height: 1280,
    items: [],
    marker: 8,
    sheet: { left: 0, size: 720, top: 280 },
    unit: 11,
    width: 720,
  });

  it("puts pairs and singles on two rows at each end of the sheet, or of the frame when repeating", () => {
    const sheetRows = markerCentres(layout(null));
    expect(sheetRows).toHaveLength(24);
    for (const [x, y] of sheetRows) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(720);
      expect(y > 280 && y < 1000).toBe(true);
      expect(y < 400 || y > 880).toBe(true);
    }
    for (const [, y] of markerCentres(layout(null), true)) expect(y < 120 || y > 1160).toBe(true);
  });

  it("stacks copies a block apart, keeps the original, and cuts them at the band", () => {
    const block = layout({ bottom: 700, left: 10, right: 700, top: 500 });
    expect(tileBlock(block, false, true)).toEqual({ band: null, tiles: [{ dy: 0, key: 12 }] });
    const { band, tiles } = tileBlock(block, true, true);
    expect(band).not.toBeNull();
    expect(tiles.some((tile) => tile.dy === 0)).toBe(true);
    expect(tiles.length).toBeGreaterThan(2);
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(tiles.length);
    // A block nearly the band's height still gets partial copies at both edges.
    const tall = tileBlock(layout({ bottom: 1100, left: 10, right: 700, top: 180 }), true, true);
    expect(tall.tiles.length).toBe(3);
  });
});

/** A recording stand-in for a 2D context: enough for layout and drawing. */
function recorder() {
  const calls: string[] = [];
  const target = {
    actualBoundingBoxAscent: 0,
    font: "10px sans-serif",
    globalAlpha: 1,
    letterSpacing: "0px",
    beginPath: () => calls.push("beginPath"),
    clip: () => calls.push("clip"),
    fill: () => calls.push("fill"),
    fillRect: () => calls.push("fillRect"),
    fillText: (text: string) => calls.push(`text:${text}`),
    // A monospace stand-in that scales with the font size, like the real face.
    measureText: (text: string) => {
      const px = Number(/([\d.]+)px/.exec(target.font)?.[1] ?? 10);
      return { actualBoundingBoxAscent: px * 0.7, width: Array.from(text).length * px * 0.62 };
    },
    rect: () => calls.push("rect"),
    restore: () => calls.push("restore"),
    save: () => calls.push("save"),
    scale: () => calls.push("scale"),
    translate: () => calls.push("translate"),
  };
  return { calls, context: target as unknown as Paint2D };
}

describe("data text drawing", () => {
  const frame = { height: 1080, width: 1080 };

  // Node has no OffscreenCanvas; the font-readiness probe only measures text.
  beforeAll(() => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { font: "", measureText: (text: string) => ({ width: text.length * 5 }) };
        }
      },
    );
  });

  it("draws nothing while off, before the start, or once gone", () => {
    const { calls, context } = recorder();
    drawDataText(context, frame, readDataText({}, DATA_TEXT_TYPE), 1, 4);
    drawDataText(context, frame, on({ [dataTextTargets.start]: 2 }), 1, 4);
    drawDataText(context, frame, on(), 3.999, 4);
    expect(calls.filter((call) => call.startsWith("text:"))).toEqual([]);
  });

  it("shows every label whole during the hold, one call per line", () => {
    const { calls, context } = recorder();
    drawDataText(context, frame, on(), 2, 4);
    const texts = calls.filter((call) => call.startsWith("text:"));
    // A wordmark draws word by word, with narrow spaces.
    expect(texts).toContain("text:SYNTAX");
    expect(texts).toContain("text:ERROR");
    expect(texts).toContain("text:PLEASE STANDBY");
    expect(texts).toContain("text:DATA STREAM (01)");
    expect(texts).toContain("text:121° 55' 19\" W");
    expect(texts).toHaveLength(13);
  });

  it("lets a wordmark shed its letters on the way out instead of scrambling", () => {
    const word = { [dataTextTargets.items]: [{ position: { x: -0.8, y: 0 }, size: 80, style: "wordmark", text: "SYNTAX ERROR" }] };
    const timing = planDataText(on(word), 4).items[0];
    let drawn = 0;
    for (let t = timing.exit; t < timing.end; t += 0.01) {
      const { calls, context } = recorder();
      drawDataText(context, frame, on(word), t, 4);
      for (const call of calls.filter((entry) => entry.startsWith("text:"))) {
        drawn += 1;
        expect(["SYNTAX", "ERROR"].some((run) => run.startsWith(call.slice(5)) || run.includes(call.slice(5)))).toBe(true);
      }
    }
    expect(drawn).toBeGreaterThan(10);
  });

  it("is a pure function of time", () => {
    const first = recorder();
    const second = recorder();
    // Warm the layout cache first, so both runs compare drawing alone.
    drawDataText(recorder().context, frame, on(), 0.5, 4);
    drawDataText(first.context, frame, on(), 0.5, 4);
    drawDataText(second.context, frame, on(), 1.7, 4);
    drawDataText(second.context, frame, on(), 0.5, 4);
    const replay = second.calls.slice(second.calls.length - first.calls.length);
    expect(replay).toEqual(first.calls);
  });

  it("repeats every item in each copy of a compact block", () => {
    const items = [{ position: { x: -0.9, y: 0 }, size: 16, style: "label", text: "ROW" }];
    const { calls, context } = recorder();
    drawDataText(context, { height: 1280, width: 720 }, on({ [dataTextTargets.items]: items, [dataTextTargets.repeat]: true }), 2, 4);
    expect(calls.filter((call) => call === "text:ROW").length).toBeGreaterThan(3);
  });
});

/** A stand-in context that records every call with its arguments and the fill it used. */
function tracer() {
  const calls: string[] = [];
  const target = {
    actualBoundingBoxAscent: 0,
    fillStyle: "#000000",
    font: "10px sans-serif",
    globalAlpha: 1,
    letterSpacing: "0px",
    beginPath: () => calls.push("beginPath"),
    clip: () => calls.push("clip"),
    fill: () => calls.push(`fill ${target.fillStyle}`),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`fillRect ${target.fillStyle} ${x},${y},${w},${h}`),
    fillText: (text: string, x: number, y: number) => calls.push(`text ${target.fillStyle} ${text} ${x},${y}`),
    measureText: (text: string) => ({ actualBoundingBoxAscent: 7, width: text.length * 6 }),
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect ${x},${y},${w},${h}`),
    restore: () => calls.push("restore"),
    save: () => calls.push(`save ${target.globalAlpha}`),
    scale: (x: number, y: number) => calls.push(`scale ${x},${y}`),
    translate: (x: number, y: number) => calls.push(`translate ${x},${y}`),
  };
  return { calls, context: target as unknown as Paint2D };
}

const textsOf = (calls: readonly string[]) => calls.filter((call) => call.startsWith("text "));

/** Total area of the path rects: the rules and markers. */
function rectArea(calls: readonly string[]): number {
  return calls
    .filter((call) => call.startsWith("rect "))
    .reduce((sum, call) => {
      const [, , w, h] = call.slice(5).split(",").map(Number);
      return sum + w * h;
    }, 0);
}

/** Centres of the rects filled white in the marker pass. */
function whiteMarkerCentres(calls: readonly string[], side: number): number[] {
  const end = calls.lastIndexOf("fill #FFFFFF");
  if (end < 0) return [];
  const start = calls.lastIndexOf("beginPath", end);
  return calls
    .slice(start + 1, end)
    .filter((call) => call.startsWith("rect "))
    .map((call) => Number(call.slice(5).split(",")[0]) + side / 2);
}

const pulse = (overrides: Partial<AudioPulse>): AudioPulse => ({ ...SILENT_PULSE, ...overrides });

describe("data text music", () => {
  const frame = { height: 1080, width: 1080 };
  const draw = (time: number, music?: AudioPulse, values: Record<string, unknown> = {}) => {
    const run = tracer();
    if (music) drawDataText(run.context, frame, on(values), time, 4, 0, music);
    else drawDataText(run.context, frame, on(values), time, 4);
    return run.calls;
  };

  beforeAll(() => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { font: "", measureText: (text: string) => ({ width: text.length * 5 }) };
        }
      },
    );
  });

  it("reads silence, and a pulse whose strengths are zeroed, as no music", () => {
    expect(readMusic(SILENT_PULSE)).toBeNull();
    expect(readMusic(pulse({ beatAge: 0.01, beatIndex: 3, beatStrength: 1 }))).toBeNull();
    expect(readMusic(pulse({ bass: Number.NaN, beat: Number.NaN }))).toBeNull();
    expect(readMusic(pulse({ beat: 3, beatIndex: 2.7 }))).toMatchObject({ beat: 1, beatIndex: 2 });
    expect(beatScramble(null, 0, "label")).toBe(0);
  });

  it("draws exactly the silent frame, call for call, when the pulse is silent", () => {
    // Beats were found but Beat pulse and Level drive are at zero.
    const muted = pulse({ beatAge: 0.01, beatIndex: 3, beatStrength: 1 });
    // The first draw after another test measures the layout; compare drawing alone.
    draw(0.3);
    for (const time of [0.3, 0.9, 2, 3.2, 3.7]) {
      const plain = draw(time);
      expect(draw(time, SILENT_PULSE)).toEqual(plain);
      expect(draw(time, muted)).toEqual(plain);
    }
    const repeat = { [dataTextTargets.repeat]: true, [dataTextTargets.exit]: "stay" };
    expect(draw(2, SILENT_PULSE, repeat)).toEqual(draw(2, undefined, repeat));
  });

  it("shakes a few held labels on a beat, and they relock as it dies away", () => {
    const plain = textsOf(draw(2));
    let shaken = 0;
    for (let beatIndex = 0; beatIndex < 12; beatIndex += 1) {
      const texts = textsOf(draw(2, pulse({ beat: 1, beatAge: 0, beatIndex, beatStrength: 1 })));
      if (texts.join("|") !== plain.join("|")) shaken += 1;
      // Only a few labels are shaken: most lines still draw whole.
      expect(plain.filter((line) => texts.includes(line)).length).toBeGreaterThanOrEqual(7);
    }
    expect(shaken).toBeGreaterThanOrEqual(6);
    // Below the floor the beat leaves every label alone.
    for (let beatIndex = 0; beatIndex < 12; beatIndex += 1) {
      expect(textsOf(draw(2, pulse({ beat: 0.04, beatAge: 0.4, beatIndex, beatStrength: 1 })))).toEqual(plain);
    }
  });

  it("lights the beat's marker group white, stepping left to right", () => {
    expect(whiteMarkerCentres(draw(2), 16 * 0.72)).toEqual([]);
    const column = (1080 * 0.88) / 12;
    const expected = [0, 4, 8, 12].map((start) => 1080 * 0.06 + start * column);
    for (let beatIndex = 0; beatIndex < 8; beatIndex += 1) {
      const lit = whiteMarkerCentres(draw(2, pulse({ beat: 0.3, beatAge: 0.1, beatIndex, beatStrength: 1 })), 16 * 0.72);
      expect(lit.length).toBeGreaterThan(0);
      // A pair lights both its columns; the group's first column is always among them.
      const first = expected[beatIndex % 4];
      for (const x of lit) expect(x - first).toBeGreaterThanOrEqual(-0.01);
      for (const x of lit) expect(x - first).toBeLessThanOrEqual(column * 0.5 + 0.01);
    }
  });

  it("lifts the stepped bars on a beat and stretches them with the bass", () => {
    const rest = rectArea(draw(2));
    expect(rectArea(draw(2, pulse({ beat: 1, beatAge: 0, beatIndex: 1, beatStrength: 1 })))).toBeGreaterThan(rest);
    expect(rectArea(draw(2, pulse({ bass: 1 })))).toBeGreaterThan(rest);
    expect(rectArea(draw(2, pulse({ bass: 0.3 })))).toBeLessThan(rectArea(draw(2, pulse({ bass: 1 }))));
  });

  it("is a pure function of time and pulse", () => {
    const hit = pulse({ bass: 0.7, beat: 0.8, beatAge: 0.03, beatIndex: 5, beatStrength: 0.9, high: 0.6, mid: 0.5 });
    const first = draw(2.03, hit);
    draw(1.1, pulse({ beat: 1, beatIndex: 9, beatStrength: 1 }));
    expect(draw(2.03, hit)).toEqual(first);
    expect(first).not.toEqual(draw(2.03));
  });

  it("gives the marker groups to the beats in turn", () => {
    const groups = [0, 1, 2, 3, 4, 5].map((beatIndex) => markerMusic(readMusic(pulse({ beat: 0.5, beatIndex })), 0)?.group);
    expect(groups).toEqual([0, 1, 2, 3, 0, 1]);
  });

  it("shows the target squares white only on the first frames of a hit", () => {
    expect(targetsUnlocked(readMusic(pulse({ beat: 1, beatAge: 0.02, beatIndex: 1, beatStrength: 1 })))).toBe(true);
    expect(targetsUnlocked(readMusic(pulse({ beat: 0.6, beatAge: 0.1, beatIndex: 1, beatStrength: 1 })))).toBe(false);
    expect(targetsUnlocked(readMusic(pulse({ beat: 0.1, beatAge: 0.01, beatIndex: 1, beatStrength: 1 })))).toBe(false);
  });

  it("flies the target squares off in the ink colour, not white", () => {
    const timing = planDataText(on(), 4).items[5];
    const square = 16 * 1.7;
    const whiteTargets = (time: number) =>
      draw(time).filter((call) => call.startsWith("fillRect #FFFFFF") && Math.abs(Number(call.split(" ")[2].split(",")[2]) - square) < 0.01);
    expect(whiteTargets(timing.start + 0.05).length).toBeGreaterThan(0);
    for (let t = timing.exit; t < timing.end; t += 0.02) expect(whiteTargets(t)).toEqual([]);
  });
});

/** Whether two boxes overlap. */
const overlaps = (a: Bounds, b: Bounds) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe("data text layout", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { font: "", measureText: (text: string) => ({ width: text.length * 5 }) };
        }
      },
    );
  });

  const lay = (width: number, height: number, values: Record<string, unknown> = {}, fontSize = 16) =>
    layoutDataText(recorder().context, { height, width }, readDataText({ [dataTextTargets.enabled]: true, ...values }, { ...DATA_TEXT_TYPE, fontSize }));

  it("places items in the centred square, so every aspect keeps the composition", () => {
    const square = lay(1080, 1080).items;
    const wide = lay(1920, 1080).items;
    const tall = lay(1080, 1920).items;
    square.forEach((item, index) => {
      expect(wide[index].anchorX - item.anchorX).toBeCloseTo(420);
      expect(wide[index].anchorY).toBeCloseTo(item.anchorY);
      expect(tall[index].anchorY - item.anchorY).toBeCloseTo(420);
      expect(tall[index].size).toBeCloseTo(item.size);
    });
  });

  it("grows the type only into free space, so a larger font size never collides or overflows", () => {
    for (const fontSize of [24, 32, 48]) {
      const { items } = lay(1080, 1080, {}, fontSize);
      items.forEach((item, index) => {
        expect(item.size).toBeGreaterThanOrEqual(DEFAULT_DATA_ITEMS[index].size - 1e-6);
        expect(item.bounds.left).toBeGreaterThanOrEqual(0);
        expect(item.bounds.right).toBeLessThanOrEqual(1080);
        for (let other = index + 1; other < items.length; other += 1) expect(overlaps(item.bounds, items[other].bounds)).toBe(false);
      });
    }
    // A wordmark too big for where it is placed shrinks to fit the frame.
    const big = lay(1080, 1080, { [dataTextTargets.items]: [{ position: { x: -0.9, y: 0 }, size: 200, style: "wordmark", text: "SYNTAX ERROR" }] });
    expect(big.items[0].bounds.right).toBeLessThanOrEqual(1080);
    expect(big.items[0].size).toBeLessThan(200);
  });

  it("repeats the default block at every aspect", () => {
    expect(tileBlock(lay(1080, 1920), true, true).tiles.length).toBeGreaterThanOrEqual(3);
    expect(tileBlock(lay(1080, 1080), true, true).tiles.length).toBeGreaterThan(1);
    expect(tileBlock(lay(1920, 1080), true, true).tiles.length).toBeGreaterThan(1);
  });
});
