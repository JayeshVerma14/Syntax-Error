/**
 * The timed layers that play over the sheet on one clock: the code roll and
 * its end text, the data text, the text bars, the logo reveal, and the glitch
 * fillers that hide the cuts between them. The code roll, end text, data
 * text and logo run on sequence seconds, so After starts a layer once the code
 * roll and end text finish and the timeline length follows the whole
 * sequence; the bars take turns in slots of the loop.
 */

import type { AudioPulse } from "./engine-audio-pulse";
import { drawBars } from "./engine-bars";
import {
  codeSchedule,
  codeTakesOver,
  drawCodeRoll,
  drawEndText,
  sequenceTime,
  type CodeSchedule,
} from "./engine-code";
import { dataTextAfter, dataTextLength, drawDataText } from "./engine-datatext";
import { planDataText } from "./engine-datatext-timing";
import { drawLogo, logoSchedule, type LogoSchedule } from "./engine-logo";
import type { LogoArt } from "./engine-logo-art";
import type { EngineSettings } from "./engine-settings";
import { drawTransition, transitionCuts } from "./engine-transition";
import type { Paint2D } from "./engine-units";
import type { BurstEvent } from "./engine-burst";
import { drawWall, wallBurstEvent, wallCovers, wallSchedule, type WallSchedule } from "./engine-wall";

export type LogoFrame = Readonly<{ art: LogoArt; crisp: OffscreenCanvas | null }>;

export type SequencePlan = Readonly<{
  /** Sequence seconds of the cuts between scenes, for the glitch fillers. */
  cuts: readonly number[];
  logo: LogoSchedule | null;
  /** The loop's length in sequence seconds. */
  loop: number;
  /** Where the data text's After or With logo start falls. */
  dataAfter: number;
  /** The loop's length in real seconds. */
  real: number;
  schedule: CodeSchedule;
  /** Sequence seconds at this frame. */
  time: number;
  /** Whether the code roll hides the sheet at this frame. */
  takesOver: boolean;
  /** Length of everything on the sequence clock. */
  total: number;
  wall: WallSchedule | null;
  /** The Burst explosion the word wall fires at this frame, if any. */
  wallBurst: BurstEvent | null;
}>;

/** Where an After word wall starts: once the code roll, end text and logo are done. */
function wallAfter(codeEnd: number, logo: LogoSchedule | null): number {
  return Math.max(codeEnd, logo?.end ?? 0);
}

/** How long the sequence lasts: the code roll, end text, data text and logo. */
export function sequenceTotal(settings: EngineSettings): number {
  const schedule = codeSchedule(settings.code, settings.endText);
  const logo = logoSchedule(settings.logo, schedule.total);
  const dataAfter = dataTextAfter(settings.dataText, schedule.total, logo);
  const wall = wallSchedule(settings.wall, wallAfter(schedule.total, logo));
  return Math.max(schedule.total, logo?.end ?? 0, dataTextLength(settings.dataText, dataAfter), wall?.end ?? 0);
}

/** Where the sequence stands at a loop position. */
export function planSequence(
  settings: EngineSettings,
  progress: number,
  durationSeconds: number,
): SequencePlan {
  const schedule = codeSchedule(settings.code, settings.endText);
  // The logo and the data text can follow the code roll and end text on the same clock.
  const logo = logoSchedule(settings.logo, schedule.total);
  const total = sequenceTotal(settings);
  const time = sequenceTime(progress, durationSeconds, total);
  const loop = Math.max(durationSeconds > 0 ? durationSeconds : 0, total);
  // Fillers last real seconds, so a compressed sequence stretches them to match.
  const rate = durationSeconds > 0 && loop > durationSeconds ? loop / durationSeconds : 1;
  const dataAfter = dataTextAfter(settings.dataText, schedule.total, logo);
  const wall = wallSchedule(settings.wall, wallAfter(schedule.total, logo));
  const data = settings.dataText.enabled ? planDataText(settings.dataText, loop, dataAfter) : null;
  return {
    cuts: transitionCuts(schedule, logo?.start ?? null, {
      dataText: data && data.end > data.first ? { end: data.end, start: data.first } : null,
      duration: settings.transition.duration * rate,
      logoEnd: logo ? (settings.logo.exit === "hold" ? Number.POSITIVE_INFINITY : logo.end) : undefined,
      loop,
      sheetAtEnd: settings.code.enabled && settings.code.sheetAtEnd,
    }),
    dataAfter,
    logo,
    loop,
    real: durationSeconds > 0 ? durationSeconds : loop,
    schedule,
    takesOver: codeTakesOver(settings.code, schedule, time) || wallCovers(settings.wall, wall, time),
    time,
    total,
    wall,
    wallBurst: wallBurstEvent(settings.wall, wall, time),
  };
}

/**
 * Draws the timed layers in order. `swell` scales them about the frame
 * centre, which is how a beat pulses the text.
 */
export function paintSequence(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  settings: EngineSettings,
  plan: SequencePlan,
  logo: LogoFrame | undefined,
  timing: Readonly<{ durationSeconds: number; progress: number; pulse: AudioPulse; swell: number }>,
): void {
  const { swell } = timing;
  if (swell !== 1) {
    context.save();
    context.translate(frame.width / 2, frame.height / 2);
    context.scale(swell, swell);
    context.translate(-frame.width / 2, -frame.height / 2);
  }
  drawCodeRoll(context, frame, settings.code, plan.schedule, plan.time);
  drawEndText(context, frame, settings.endText, plan.schedule, plan.time);
  drawDataText(context, frame, settings.dataText, plan.time, plan.loop, plan.dataAfter, timing.pulse);
  drawBars(context, frame, settings.bars, timing.durationSeconds, timing.progress, timing.pulse.beat);
  drawLogo(context, frame, settings.logo, logo?.art ?? null, logo?.crisp ?? null, plan.logo, plan.time, timing.pulse);
  drawWall(context, frame, settings.wall, plan.wall, plan.time);
  if (swell !== 1) context.restore();
}

/**
 * The glitch filler over the finished frame, outside any beat zoom or shake
 * so it covers the whole screen; the flash and CRT pass lie over it.
 */
export function paintTransition(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  settings: EngineSettings,
  plan: SequencePlan,
  pulse: AudioPulse,
): void {
  drawTransition(context, frame, settings.transition, plan.time, { real: plan.real, sequence: plan.loop }, plan.cuts, pulse);
}
