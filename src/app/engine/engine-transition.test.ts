import { describe, expect, it } from "vitest";

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import { codeSchedule, sequenceTime } from "./engine-code";
import { logoSchedule, readLogo } from "./engine-logo";
import { readCodeRoll, readEndText } from "./engine-settings";
import {
  drawTransition,
  readTransition,
  TRANSITION_STYLES,
  transitionAt,
  transitionClock,
  transitionCuts,
  type TransitionSettings,
} from "./engine-transition";
import { BEAT_ATTACK_SECONDS, beatFiller, driveOf, STILL_DRIVE } from "./engine-transition-audio";
import { bloomAt } from "./engine-transition-glow";
import { stageOf } from "./engine-transition-kit";
import { tearAmount } from "./engine-transition-signal";
import type { Paint2D } from "./engine-units";

const on = (overrides: Record<string, unknown> = {}): TransitionSettings =>
  readTransition({ "transition.enabled": true, ...overrides });

/** A 2D context stand-in that records every call and property write; `exact` keeps full precision. */
function recorder(width: number, height: number, exact = false): { context: Paint2D; log: string[] } {
  const log: string[] = [];
  const round = (value: unknown) =>
    typeof value === "number" && !exact ? Math.round(value * 100) / 100 : value;
  const gradient = { addColorStop: (...args: unknown[]) => log.push(`stop ${args.map(round).join(",")}`) };
  const target: Record<string | symbol, unknown> = {
    canvas: { height, width },
    createLinearGradient: (...args: unknown[]) => (log.push(`linear ${args.map(round).join(",")}`), gradient),
    createRadialGradient: (...args: unknown[]) => (log.push(`radial ${args.map(round).join(",")}`), gradient),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  const context = new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      return (...args: unknown[]) => log.push(`${String(key)} ${args.map(round).join(",")}`);
    },
    set(object, key, value) {
      log.push(`${String(key)}=${String(round(value))}`);
      object[key] = value;
      return true;
    },
  });
  return { context: context as unknown as Paint2D, log };
}

/** A context that fails the test if anything touches it. */
const untouchable = new Proxy(
  {},
  {
    get() {
      throw new Error("the context was touched");
    },
    set() {
      throw new Error("the context was touched");
    },
  },
) as unknown as Paint2D;

describe("transition settings", () => {
  it("is off until asked for and looks right out of the box", () => {
    const settings = readTransition({});
    expect(settings.enabled).toBe(false);
    expect(settings.style).toBe("glow");
    expect(settings.placement).toBe("both");
    expect(settings.direction).toBe("up");
    expect(settings.color).toBe("#FFFFFF");
    expect(settings.threshold).toBe(80);
  });

  it("clamps stored values into the ranges the panel offers", () => {
    const settings = readTransition({
      "transition.blocks": 99.6,
      "transition.color": "not a colour",
      "transition.cover": -3,
      "transition.direction": "sideways",
      "transition.duration": 40,
      "transition.hold": 500,
      "transition.intensity": 101,
      "transition.style": "wipe",
      "transition.threshold": 140,
    });
    expect(settings.blocks).toBe(24);
    expect(settings.color).toBe("#FFFFFF");
    expect(settings.cover).toBe(0);
    expect(settings.direction).toBe("up");
    expect(settings.duration).toBe(2);
    expect(settings.hold).toBe(60);
    expect(settings.intensity).toBe(100);
    expect(settings.style).toBe("glow");
    expect(settings.threshold).toBe(100);
    expect(readTransition({ "transition.placement": "beats" }).placement).toBe("beats");
    expect(readTransition({ "transition.blocks": 1, "transition.duration": 0 }).blocks).toBe(4);
    expect(readTransition({ "transition.duration": 0 }).duration).toBe(0.3);
  });
});

describe("scene cuts", () => {
  const code = readCodeRoll({ "code.enabled": true });
  const end = readEndText({ "endText.enabled": true });

  it("puts a cut between code roll and end text, and before a logo that follows", () => {
    const schedule = codeSchedule(code, end);
    const logo = logoSchedule(readLogo({ "logo.delay": 0.2, "logo.enabled": true }), schedule.total);
    const cuts = transitionCuts(schedule, logo?.start ?? null);
    expect(cuts).toHaveLength(2);
    expect(cuts[0]).toBeCloseTo(schedule.codeEnd);
    // The gap before the logo is short, so the cut sits in its middle.
    expect(cuts[1]).toBeCloseTo(schedule.total + 0.1);
  });

  it("lands a cut just before a scene that follows a long gap", () => {
    const schedule = codeSchedule(code, end);
    const cuts = transitionCuts(schedule, schedule.total + 3);
    expect(cuts[1]).toBeCloseTo(schedule.total + 3 - 0.3);
  });

  it("has no cut for a single scene or a logo lying over the code roll", () => {
    const codeOnly = codeSchedule(code, readEndText({}));
    expect(transitionCuts(codeOnly, null)).toEqual([]);
    expect(transitionCuts(codeOnly, 0.2)).toEqual([]);
    const nothing = codeSchedule(readCodeRoll({}), readEndText({}));
    expect(transitionCuts(nothing, null)).toEqual([]);
    expect(transitionCuts(nothing, 0.2)).toEqual([]);
  });

  it("cuts from the code roll straight to a logo when there is no end text", () => {
    const schedule = codeSchedule(code, readEndText({}));
    expect(transitionCuts(schedule, schedule.codeEnd + 0.2)).toEqual([schedule.codeEnd + 0.1]);
  });

  it("cuts where the code roll hands over to the sheet", () => {
    const schedule = codeSchedule(code, readEndText({}));
    expect(transitionCuts(schedule, null)).toEqual([]);
    expect(transitionCuts(schedule, null, { sheetAtEnd: true })).toEqual([schedule.codeEnd]);
    // With end text the cut is already there, once.
    const both = codeSchedule(code, end);
    expect(transitionCuts(both, null, { sheetAtEnd: true })).toEqual([both.codeEnd]);
  });

  it("treats the data text as a scene", () => {
    const schedule = codeSchedule(code, end);
    // After the end text: a cut lands just before the data text.
    expect(transitionCuts(schedule, null, { dataText: { end: schedule.total + 4, start: schedule.total + 0.2 } })).toEqual([
      schedule.codeEnd,
      expect.closeTo(schedule.total + 0.1),
    ]);
    // Over the code roll from the loop start: no cut.
    expect(transitionCuts(schedule, null, { dataText: { end: 3, start: 0.2 } })).toEqual([schedule.codeEnd]);
    // A logo that holds keeps the data text after it from being a cut too early.
    const logoStart = schedule.total + 0.2;
    const cuts = transitionCuts(schedule, logoStart, {
      dataText: { end: logoStart + 9, start: logoStart + 5.2 },
      logoEnd: logoStart + 5,
    });
    expect(cuts).toHaveLength(3);
    expect(cuts[2]).toBeCloseTo(logoStart + 5.1);
  });

  it("cuts out of the last scene when the loop runs on long after it", () => {
    const schedule = codeSchedule(code, end);
    expect(transitionCuts(schedule, null, { duration: 0.8, loop: schedule.total + 3 })).toEqual([
      schedule.codeEnd,
      schedule.total,
    ]);
    // Close to the seam, the seam filler covers it.
    expect(transitionCuts(schedule, null, { duration: 0.8, loop: schedule.total + 1 })).toEqual([schedule.codeEnd]);
    // A logo that stays to the end leaves nothing to cut to.
    expect(
      transitionCuts(schedule, schedule.total + 0.2, { duration: 0.8, logoEnd: Infinity, loop: schedule.total + 9 }),
    ).toHaveLength(2);
  });
});

describe("transition clock and placement", () => {
  it("runs on the same sequence seconds as the code roll", () => {
    for (const [duration, total] of [[6, 4], [4, 9], [5, 5]]) {
      for (const progress of [0, 0.25, 0.5, 0.999]) {
        expect(transitionClock(progress, duration, total).time).toBeCloseTo(sequenceTime(progress, duration, total));
      }
    }
    expect(transitionClock(0.5, 4, 9).loop).toBe(9);
  });

  it("straddles the loop seam so the loop closes seamlessly", () => {
    const settings = on({ "transition.duration": 0.8, "transition.placement": "loop" });
    const before = transitionAt(settings, 6 - 0.1, 6, []);
    const after = transitionAt(settings, 0.1, 6, []);
    expect(before?.u).toBeCloseTo(0.375);
    expect(after?.u).toBeCloseTo(0.625);
    // The last frame of the loop and the first agree on where the filler is.
    expect(transitionAt(settings, 6 - 1e-6, 6, [])?.u).toBeCloseTo(transitionAt(settings, 0, 6, [])?.u ?? -1, 4);
    expect(before?.seed).toBe(after?.seed);
    expect(transitionAt(settings, 3, 6, [])).toBeNull();
  });

  it("places fillers on cuts, on the seam, or both", () => {
    const cuts = [2.5];
    expect(transitionAt(on({ "transition.placement": "cuts" }), 0, 6, cuts)).toBeNull();
    expect(transitionAt(on({ "transition.placement": "cuts" }), 2.5, 6, cuts)?.u).toBeCloseTo(0.5);
    expect(transitionAt(on({ "transition.placement": "loop" }), 2.5, 6, cuts)).toBeNull();
    const both = on({ "transition.placement": "both" });
    expect(transitionAt(both, 0.1, 6, cuts)?.centre).toBe(0);
    expect(transitionAt(both, 2.6, 6, cuts)?.centre).toBe(2.5);
    expect(transitionAt(both, 1.2, 6, cuts)).toBeNull();
  });

  it("gives each cut its own seed and stays off while disabled", () => {
    const settings = on({ "transition.placement": "cuts" });
    expect(transitionAt(settings, 1, 6, [1])?.seed).not.toBe(transitionAt(settings, 4, 6, [4])?.seed);
    expect(transitionAt(readTransition({ "transition.enabled": false }), 1, 6, [1])).toBeNull();
    expect(transitionAt(settings, Number.NaN, 6, [1])).toBeNull();
  });

  it("never covers more than half a short loop", () => {
    const settings = on({ "transition.duration": 2, "transition.placement": "loop" });
    // A 1 s loop gets a 0.5 s seam filler, so the picture shows for the other half.
    expect(transitionAt(settings, 0.2, 1, [])?.u).toBeCloseTo(0.9);
    expect(transitionAt(settings, 0.25, 1, [])).toBeNull();
    expect(transitionAt(settings, 0.5, 1, [])).toBeNull();
    expect(transitionAt(settings, 0.75, 1, [])?.u).toBeCloseTo(0);
    // Every frame of a busy loop still answers deterministically, and some show the picture.
    const busy = on({ "transition.duration": 0.8, "transition.placement": "both" });
    const open = Array.from({ length: 60 }, (_, step) => transitionAt(busy, step * 0.025, 1.5, [0.5, 1])).filter((m) => !m);
    expect(open.length).toBeGreaterThan(5);
  });
});

describe("transition phases", () => {
  it("covers, holds around the cut, then uncovers", () => {
    expect(stageOf(0, 0.2)).toEqual({ enter: 0, leave: 0 });
    expect(stageOf(0.5, 0.2)).toEqual({ enter: 1, leave: 0 });
    expect(stageOf(1, 0.2)).toEqual({ enter: 1, leave: 1 });
    expect(stageOf(0.2, 0.2).enter).toBeCloseTo(0.5);
    expect(stageOf(0.8, 0.2).leave).toBeCloseTo(0.5);
  });

  it("lights the bloom brightest at the edge and lets it trail further behind", () => {
    expect(bloomAt(0)).toBeGreaterThan(bloomAt(-1));
    expect(bloomAt(0)).toBeGreaterThan(bloomAt(1));
    expect(bloomAt(2)).toBeGreaterThan(bloomAt(-2));
    expect(bloomAt(2, 1.6)).toBeLessThan(bloomAt(2));
  });

  it("tears the picture only while it is visible", () => {
    expect(tearAmount(0, 0.2)).toBe(0);
    expect(tearAmount(0.5, 0.2)).toBe(0);
    expect(tearAmount(1, 0.2)).toBe(0);
    expect(tearAmount(0.35, 0.2)).toBeGreaterThan(0.5);
  });
});

describe("drawing a transition", () => {
  const frame = { height: 720, width: 1280 };

  it("is free between fillers", () => {
    expect(() => drawTransition(untouchable, frame, on({ "transition.placement": "cuts" }), 3, 6, [1])).not.toThrow();
    expect(() => drawTransition(untouchable, frame, readTransition({ "transition.enabled": false }), 0, 6, [])).not.toThrow();
  });

  it("is a pure function of its inputs in every style and direction", () => {
    for (const style of TRANSITION_STYLES) {
      for (const direction of ["up", "down", "left", "right"]) {
        const settings = on({ "transition.direction": direction, "transition.style": style });
        for (const time of [5.75, 5.9, 0.05, 0.2, 0.35]) {
          const first = recorder(frame.width, frame.height);
          const second = recorder(frame.width, frame.height);
          drawTransition(first.context, frame, settings, time, 6, [2]);
          drawTransition(second.context, frame, settings, time, 6, [2]);
          expect(first.log.length).toBeGreaterThan(3);
          expect(second.log).toEqual(first.log);
        }
      }
    }
  });

  it("draws the same frame on both sides of the loop seam", () => {
    for (const style of TRANSITION_STYLES) {
      const settings = on({ "transition.placement": "loop", "transition.style": style });
      const end = recorder(frame.width, frame.height);
      const start = recorder(frame.width, frame.height);
      drawTransition(end.context, frame, settings, 6 + 0.1, 6, []);
      drawTransition(start.context, frame, settings, 0.1, 6, []);
      expect(start.log.length).toBeGreaterThan(3);
      expect(end.log).toEqual(start.log);
    }
  });

  it("merges cuts closer than one filler, so it never jumps back to dark", () => {
    const settings = on({ "transition.duration": 0.8, "transition.placement": "cuts" });
    let previous = -1;
    let seed = -1;
    for (let time = 3.5; time < 4.75; time += 1 / 60) {
      const moment = transitionAt(settings, time, 10, [4, 4.3]);
      if (!moment) continue;
      expect(moment.u, `t ${time}`).toBeGreaterThan(previous);
      if (seed >= 0) expect(moment.seed).toBe(seed);
      previous = moment.u;
      seed = moment.seed;
    }
    // It covers at the first cut, holds dark through the second and uncovers after it.
    expect(transitionAt(settings, 3.61, 10, [4, 4.3])).not.toBeNull();
    expect(transitionAt(settings, 4.69, 10, [4, 4.3])).not.toBeNull();
    expect(transitionAt(settings, 4.71, 10, [4, 4.3])).toBeNull();
    const held = transitionAt(settings, 4.15, 10, [4, 4.3]);
    expect(held && stageOf(held.u, held.hold)).toEqual({ enter: 1, leave: 0 });
    // Fillers far enough apart stay separate.
    expect(transitionAt(settings, 4, 10, [4, 5])?.u).toBeCloseTo(0.5);
    expect(transitionAt(settings, 5, 10, [4, 5])?.u).toBeCloseTo(0.5);
  });

  it("merges a cut beside the loop seam with the seam filler, across the seam", () => {
    const settings = on({ "transition.duration": 0.8, "transition.placement": "both" });
    let previous = -1;
    // The seam at 0 (and 6) and a cut at 0.3: one filler from 5.6 to 0.7.
    for (const time of [5.65, 5.8, 5.95, 0.05, 0.2, 0.35, 0.5, 0.65]) {
      const moment = transitionAt(settings, time, 6, [0.3]);
      expect(moment, `t ${time}`).not.toBeNull();
      expect(moment?.u ?? -1).toBeGreaterThan(previous);
      previous = moment?.u ?? -1;
    }
    expect(transitionAt(settings, 0.75, 6, [0.3])).toBeNull();
    expect(transitionAt(settings, 5.55, 6, [0.3])).toBeNull();
  });

  it("keeps a filler's real length when the sequence is squeezed into a shorter loop", () => {
    const settings = on({ "transition.duration": 0.8, "transition.placement": "cuts" });
    // A 12 s sequence played in a 6 s timeline runs at double speed.
    const squeezed = { real: 6, sequence: 12 };
    expect(transitionAt(settings, 4 + 0.7, squeezed, [4])).not.toBeNull();
    expect(transitionAt(settings, 4 + 0.7, 12, [4])).toBeNull();
    // Flicker runs on real seconds.
    expect(transitionAt(settings, 4.4, squeezed, [4])?.seconds).toBeCloseTo(0.2);
    expect(transitionClock(0.5, 6, 12)).toEqual({ loop: 12, real: 6, time: 6 });
  });

  it("draws with fillRect and drawImage only, never many-rect paths or clip", () => {
    for (const style of TRANSITION_STYLES) {
      const settings = on({ "transition.blocks": 24, "transition.style": style });
      for (const time of [1.7, 1.8, 1.9, 2, 2.1, 2.2, 2.3]) {
        const { context, log } = recorder(frame.width, frame.height);
        drawTransition(context, frame, settings, time, 6, [2], loud(0.02));
        const paths = log.filter((line) => /^(rect|clip|fill |beginPath|moveTo|lineTo)/.test(line));
        expect(paths, `${style} ${time}`).toEqual([]);
      }
    }
  });

  it("never washes the whole frame in the glow colour", () => {
    for (let time = 1.6; time < 2.4; time += 0.01) {
      const { context, log } = recorder(frame.width, frame.height);
      drawTransition(context, frame, on({ "transition.style": "scan" }), time, 6, [2], loud(0));
      const fills = log.filter((line) => line.startsWith(`fillRect 0,0,${frame.width},${frame.height}`));
      // The only full-frame fills are the cover (its own colour) and the grain.
      for (let index = 0; index < log.length; index += 1) {
        if (!log[index].startsWith(`fillRect 0,0,${frame.width},${frame.height}`)) continue;
        const style = [...log.slice(0, index)].reverse().find((line) => line.startsWith("fillStyle="));
        expect(style === "fillStyle=#050406" || !style?.startsWith("fillStyle=rgba(255"), `${time}`).toBe(true);
      }
      expect(fills.length).toBeLessThan(3);
    }
  });

  it("covers the whole frame at the cut", () => {
    for (const style of TRANSITION_STYLES) {
      const { context, log } = recorder(frame.width, frame.height);
      drawTransition(context, frame, on({ "transition.style": style }), 2, 6, [2]);
      const covered =
        log.includes(`fillRect 0,0,${frame.width},${frame.height}`) ||
        log.some((line) => line.startsWith("rect")) ||
        log.includes(`fillRect 0,0,${frame.height},${frame.width}`);
      expect(covered, style).toBe(true);
    }
  });
});

/** A beat `age` seconds old, with the band levels a loud passage has. */
const loud = (age: number, strength = 1, index = 12): AudioPulse => ({
  bass: 0.8,
  beat: strength * Math.exp(-age / 0.14),
  beatAge: age,
  beatIndex: index,
  beatStrength: strength,
  high: 0.7,
  mid: 0.6,
});

describe("answering the music", () => {
  const frame = { height: 720, width: 1280 };

  it("reads silence as no drive at all", () => {
    expect(driveOf(SILENT_PULSE)).toEqual(STILL_DRIVE);
    const drive = driveOf({ ...loud(0), bass: 3, beat: 2, high: -1 });
    expect(drive.bass).toBe(1);
    expect(drive.beat).toBe(1);
    expect(drive.high).toBe(0);
  });

  it("draws exactly the same frame with the silent pulse as with none", () => {
    for (const style of TRANSITION_STYLES) {
      for (const placement of ["cuts", "both", "beats"]) {
        const settings = on({ "transition.placement": placement, "transition.style": style });
        for (const time of [1.7, 1.85, 1.95, 2, 2.05, 2.2, 2.35, 5.9, 0.1]) {
          const plain = recorder(frame.width, frame.height, true);
          const silent = recorder(frame.width, frame.height, true);
          drawTransition(plain.context, frame, settings, time, 6, [2]);
          drawTransition(silent.context, frame, settings, time, 6, [2], SILENT_PULSE);
          expect(silent.log, `${style} ${placement} ${time}`).toEqual(plain.log);
        }
      }
    }
  });

  it("hits every style harder on a strong beat", () => {
    for (const style of TRANSITION_STYLES) {
      const settings = on({ "transition.style": style });
      // Mid-cover and held at the cut.
      for (const time of [1.85, 2]) {
        const plain = recorder(frame.width, frame.height);
        const hit = recorder(frame.width, frame.height);
        drawTransition(plain.context, frame, settings, time, 6, [2]);
        drawTransition(hit.context, frame, settings, time, 6, [2], loud(0.02));
        expect(hit.log, `${style} ${time}`).not.toEqual(plain.log);
      }
    }
  });

  it("stays a pure function of its inputs with music", () => {
    for (const style of TRANSITION_STYLES) {
      const settings = on({ "transition.style": style });
      const first = recorder(frame.width, frame.height);
      const second = recorder(frame.width, frame.height);
      drawTransition(first.context, frame, settings, 1.9, 6, [2], loud(0.05));
      drawTransition(second.context, frame, settings, 1.9, 6, [2], loud(0.05));
      expect(second.log).toEqual(first.log);
    }
  });
});

describe("fillers on beats", () => {
  const beats = on({ "transition.duration": 0.8, "transition.placement": "beats" });

  it("flares in on a strong beat, then uncovers within half the duration", () => {
    // The hit starts half-way through the covering pass and closes in about two frames.
    expect(transitionAt(beats, 3, 6, [], loud(0))?.u).toBeCloseTo(0.2);
    expect(transitionAt(beats, 3, 6, [], loud(BEAT_ATTACK_SECONDS / 2))?.u).toBeGreaterThan(0.4);
    expect(transitionAt(beats, 3, 6, [], loud(BEAT_ATTACK_SECONDS))?.u).toBeCloseTo(0.5);
    const early = transitionAt(beats, 3, 6, [], loud(0.1))?.u ?? 0;
    const late = transitionAt(beats, 3, 6, [], loud(0.3))?.u ?? 0;
    expect(early).toBeGreaterThan(0.5);
    expect(late).toBeGreaterThan(early);
    // Quick at first, settling: most of the reveal is over by mid-way.
    expect(transitionAt(beats, 3, 6, [], loud(BEAT_ATTACK_SECONDS + 0.2))?.u).toBeGreaterThan(0.85);
    expect(transitionAt(beats, 3, 6, [], loud(BEAT_ATTACK_SECONDS + 0.4))).toBeNull();
  });

  it("dips the shot rather than blacking it out, deeper for stronger beats", () => {
    const weak = transitionAt(beats, 3, 6, [], loud(0.03, 0.8));
    const strong = transitionAt(beats, 3, 6, [], loud(0.03, 1));
    expect(weak?.cover).toBeCloseTo(0.5);
    expect(strong?.cover).toBeCloseTo(0.8);
    // Cut fillers cover fully.
    expect(transitionAt(on({ "transition.placement": "cuts" }), 3, 6, [3], loud(0.03))?.cover).toBe(1);
  });

  it("ignores weak beats, silence, the cuts and the loop seam", () => {
    const lenient = on({ "transition.placement": "beats", "transition.threshold": 40 });
    expect(transitionAt(beats, 3, 6, [], loud(0.05, 0.5))).toBeNull();
    expect(transitionAt(lenient, 3, 6, [], loud(0.05, 0.5))).not.toBeNull();
    expect(transitionAt(beats, 3, 6, [3])).toBeNull();
    expect(transitionAt(beats, 0, 6, [], SILENT_PULSE)).toBeNull();
    expect(beatFiller({ ...loud(0.05), beatIndex: -1 }, 0.8, 0.5, 0.2)).toBeNull();
    // Cut and seam fillers keep their own timing with music.
    expect(transitionAt(on({ "transition.placement": "cuts" }), 3, 6, [3], loud(0.3))?.u).toBeCloseTo(0.5);
  });

  it("gives every beat a fresh pattern", () => {
    const first = transitionAt(beats, 3, 6, [], loud(0.05, 1, 12));
    const next = transitionAt(beats, 3, 6, [], loud(0.05, 1, 13));
    expect(first?.seed).not.toBe(next?.seed);
    expect(first?.seconds).toBeCloseTo(0.05);
  });

  it("draws on a strong beat and is free without one", () => {
    const frame = { height: 720, width: 1280 };
    for (const style of TRANSITION_STYLES) {
      const settings = on({ "transition.placement": "beats", "transition.style": style });
      const { context, log } = recorder(frame.width, frame.height);
      drawTransition(context, frame, settings, 3, 6, [3], loud(0.08));
      expect(log.length, style).toBeGreaterThan(3);
      expect(() => drawTransition(untouchable, frame, settings, 3, 6, [3], SILENT_PULSE)).not.toThrow();
      expect(() => drawTransition(untouchable, frame, settings, 3, 6, [3], loud(0.5))).not.toThrow();
    }
  });
});
