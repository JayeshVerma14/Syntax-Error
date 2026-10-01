/**
 * The flat logo styles, and every style's lock, hold and non-rewinding
 * departures. The flat styles are other ways a machine might put a mark
 * together: blocks flying in, dropping into place like a printer, a
 * scanline resolving glyph noise, glitching chunks, rows streaking in like
 * sorted pixels, barcode data strips resolving into the mark, or a swarm
 * spiralling in. Once built, the blocks resolve into the crisp logo with a
 * frame of light, and a faint scanline keeps passing over it while it holds.
 *
 * Every shape joins a batch keyed by layer, colour and opacity, and each
 * batch fills once, so thousands of turning particles cost a handful of
 * fills. Every frame is a pure function of the sequence time.
 */

import { SILENT_PULSE, type AudioPulse } from "./engine-audio-pulse";
import type { LogoArt } from "./engine-logo-art";
import { drawBassBed, drawBeatEcho, drawHighGlints } from "./engine-logo-audio";
import type { LogoBox } from "./engine-logo-camera";
import { drawBlockHud } from "./engine-logo-hud";
import { logoPartsFor } from "./engine-logo-parts";
import { morphStage, particleShaper, PARTICLE_GLYPH_COUNT, type LogoParticle } from "./engine-logo-particles";
import type { TypeSettings } from "./engine-settings";
import type { Paint2D } from "./engine-units";

/** The flat assembly styles; the cinematic and dot-matrix builds lock through Fly in. */
export type FlatStyle = "barcode" | "build" | "fly" | "glitch" | "scan" | "sort" | "swarm";

export type FlatSettings = Readonly<{
  exit: "collapse" | "glitch" | "hold" | "reverse" | "shatter";
  hud: boolean;
  ink: string;
  particle: LogoParticle;
  parts: number;
  /** Resolves the lock in a ring out from the centre (the dot-matrix lock) instead of a scanline. */
  ring?: boolean;
  tint: boolean;
  /** The HUD's typeface. */
  type: TypeSettings;
}>;

export type FlatSchedule = Readonly<{ built: number; end: number; exitStart: number; start: number }>;

/** Share of the build each block spends travelling; the rest is the stagger. */
const TRAVEL = 0.4;
const RESOLVE_SECONDS = 0.32;
const FLASH_SECONDS = 0.35;
/** Seconds the crisp logo takes to give way to blocks when they shatter or glitch out. */
const HANDOFF_SECONDS = 0.07;
const GLITCH_RED = "#FF2A55";
const GLITCH_CYAN = "#2AF5FF";
/** Opacity steps a batch is split into. */
const LEVELS = 24;

function hash(value: number, salt: number): number {
  let h = Math.imul(value + 307, 2_654_435_761) ^ Math.imul(salt + 11, 1_597_334_677);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  return ((h ^ (h >>> 13)) >>> 0) / 4_294_967_295;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const easeOutBounce = (t: number) => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t - 1.5 / 2.75) ** 2 + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t - 2.25 / 2.75) ** 2 + 0.9375;
  return 7.5625 * (t - 2.625 / 2.75) ** 2 + 0.984375;
};

/** When a block starts moving, as a share of the build, for each style. */
export function orderOf(style: FlatStyle, column: number, row: number, cols: number, rows: number): number {
  const rand = hash(column * 7919 + row, 1);
  const dx = (column + 0.5) / cols - 0.5;
  const dy = (row + 0.5) / rows - 0.5;
  switch (style) {
    case "build":
      return 0.85 * ((rows - 1 - row) / Math.max(1, rows - 1)) + 0.15 * rand;
    case "scan":
      return 0.92 * (row / Math.max(1, rows - 1)) + 0.08 * rand;
    case "glitch":
      return hash(Math.floor(column / 5) * 131 + Math.floor(row / 3), 2);
    case "sort":
      return 0.9 * hash(row, 3) + 0.1 * rand;
    case "barcode":
      return 0.92 * (column / Math.max(1, cols - 1)) + 0.08 * hash(column, 4);
    case "swarm":
      return 0.75 * ((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) + 0.25 * rand;
    default:
      return 0.55 * rand + 0.45 * Math.min(1, Math.hypot(dx, dy) * 1.6);
  }
}

/** Shape kinds in a batch: the chosen particle, a scramble glyph, a plain bar. */
const KIND_PARTICLE = 0;
const KIND_GLYPH = 1;
const KIND_BAR = 2;

/**
 * Shapes grouped by layer, colour and opacity. `add` takes a centre and two
 * half-axes (numbers only, so it is cheap inside long loops); `flush` fills
 * each group once, lower layers first.
 */
function shapeBatch(context: Paint2D, particle: LogoParticle, colours: readonly string[]) {
  const shapers = [particleShaper(context, particle), particleShaper(context, "glyphs"), particleShaper(context, "blocks")];
  const groups = new Map<number, number[]>();
  const add = (
    layer: number,
    colour: number,
    opacity: number,
    kind: number,
    cx: number,
    cy: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    glyph: number,
  ) => {
    const level = Math.round(clamp01(opacity) * LEVELS);
    if (level <= 0) return;
    const key = (layer * colours.length + colour) * (LEVELS + 1) + level;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(kind, cx, cy, ax, ay, bx, by, glyph);
  };
  const flush = () => {
    for (const key of [...groups.keys()].sort((a, b) => a - b)) {
      const group = groups.get(key) ?? [];
      context.fillStyle = colours[Math.floor(key / (LEVELS + 1)) % colours.length];
      context.globalAlpha = (key % (LEVELS + 1)) / LEVELS;
      context.beginPath();
      for (let at = 0; at < group.length; at += 8) {
        shapers[group[at]](group[at + 1], group[at + 2], group[at + 3], group[at + 4], group[at + 5], group[at + 6], group[at + 7]);
      }
      context.fill();
    }
    groups.clear();
  };
  return { add, flush };
}

type FlatPhase = Readonly<{
  build: number;
  exiting: boolean;
  leave: number;
  locked: boolean;
  resolve: number;
  tick: number;
  time: number;
}>;

function phaseOf(logo: FlatSettings, schedule: FlatSchedule, time: number): FlatPhase {
  const exiting = logo.exit !== "hold" && time >= schedule.exitStart;
  return {
    build: clamp01((time - schedule.start) / Math.max(1e-3, schedule.built - schedule.start)),
    exiting,
    leave: exiting ? clamp01((time - schedule.exitStart) / Math.max(1e-3, schedule.end - schedule.exitStart)) : 0,
    locked: time >= schedule.built && !exiting,
    resolve: exiting ? 0 : clamp01((time - schedule.built) / RESOLVE_SECONDS),
    tick: Math.floor(time * 24),
    time,
  };
}

/** The blocks of every flat style, in flight, locking, or leaving. */
function drawFlatBlocks(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  box: LogoBox,
  logo: FlatSettings,
  style: FlatStyle,
  art: LogoArt,
  phase: FlatPhase,
): void {
  const { cell, centreX, centreY, height, left, top, width } = box;
  const solid = cell * 0.88;
  const diagonal = Math.hypot(frame.width, frame.height);
  const { build, exiting, leave, locked, tick } = phase;
  const parts = logoPartsFor(art, logo.parts);
  const ink = parts.palette.length;
  const colours = [...parts.palette, logo.ink, GLITCH_RED, GLITCH_CYAN];
  const batch = shapeBatch(context, logo.particle, colours);
  const tone = parts.tone;
  const blocks = art.blocks;
  const morphing = logo.particle === "mixed";
  // A turned block as the chosen particle (or another kind); glyphs scramble until they settle (progress 1).
  const put = (
    layer: number,
    colour: number,
    opacity: number,
    kind: number,
    x: number,
    y: number,
    w: number,
    h: number,
    angle: number,
    seed: number,
    progress: number,
  ) => {
    const cos = angle === 0 ? 1 : Math.cos(angle);
    const sin = angle === 0 ? 0 : Math.sin(angle);
    const glyph =
      morphing && kind === KIND_PARTICLE
        ? morphStage(progress, seed, tick)
        : Math.floor(hash(seed, progress >= 1 ? 3 : tick) * PARTICLE_GLYPH_COUNT);
    batch.add(layer, colour, opacity, kind, x, y, (cos * w) / 2, (sin * w) / 2, (-sin * h) / 2, (cos * h) / 2, glyph);
  };

  if (style === "barcode" && !exiting && build < 1) {
    // Ikeda-style data strips stand in for columns that have not locked yet.
    for (let column = 0; column < art.cols; column += 1) {
      const lockAt = orderOf("barcode", column, 0, art.cols, art.rows) * (1 - TRAVEL) + TRAVEL;
      if (build >= lockAt || hash(column, tick) > 0.55) continue;
      const strip = cell * (0.2 + 0.8 * hash(column, tick + 3));
      batch.add(0, ink, 0.9, KIND_BAR, left + column * cell + strip / 2, top + height / 2, strip / 2, 0, 0, height / 2, 0);
    }
  }
  const buildShown = exiting && logo.exit === "reverse" ? 1 - leave : build;
  for (let index = 0; index < art.count; index += 1) {
    const column = blocks[index * 5];
    const row = blocks[index * 5 + 1];
    const targetX = left + (column + 0.5) * cell;
    const targetY = top + (row + 0.5) * cell;
    const seed = column * 7919 + row;
    const colour = logo.tint ? ink : tone[index];

    if (exiting && logo.exit === "shatter") {
      const heading = Math.atan2(targetY - centreY, targetX - centreX) + (hash(seed, 5) - 0.5) * 1.2;
      const distance = easeOutCubic(leave) * diagonal * (0.2 + 0.4 * hash(seed, 6));
      const x = targetX + Math.cos(heading) * distance;
      const y = targetY + Math.sin(heading) * distance + leave * leave * height * 0.8;
      put(1, colour, 1 - leave, KIND_PARTICLE, x, y, solid, solid, (hash(seed, 7) - 0.5) * 8 * leave, seed, 1);
      continue;
    }
    if (exiting && logo.exit === "glitch") {
      const chunk = Math.floor(column / 5) * 131 + Math.floor(row / 3);
      const gone = hash(chunk, 8) * 0.9;
      if (leave >= gone) continue;
      const near = clamp01((leave - gone + 0.25) / 0.25);
      if (near > 0 && hash(chunk, tick + 1) < 0.4) continue;
      const jitter = (hash(chunk, tick) - 0.5) * cell * 10 * near;
      put(1, colour, 1, KIND_PARTICLE, targetX + jitter, targetY, solid, solid, 0, seed, 1);
      continue;
    }
    if (locked) {
      put(1, colour, 1, KIND_PARTICLE, targetX, targetY, solid, solid, 0, seed, 1);
      continue;
    }

    const order = orderOf(style, column, row, art.cols, art.rows);
    const p = clamp01((buildShown - order * (1 - TRAVEL)) / TRAVEL);
    if (p <= 0) continue;
    let x = targetX;
    let y = targetY;
    let w = solid;
    let h = solid;
    let angle = 0;
    let alpha = 1;
    switch (style) {
      case "build":
        y = targetY - (1 - easeOutBounce(p)) * (height * 0.7 + cell * 4);
        break;
      case "scan":
      case "barcode":
        if (p < 1) {
          // Not yet resolved: scan shows the cell as flickering glyph noise, barcode as its strip.
          if (style === "scan") put(1, colour, 0.85, KIND_GLYPH, targetX, targetY, solid, solid, 0, seed, 0);
          continue;
        }
        break;
      case "glitch":
        if (p < 1) {
          const chunk = Math.floor(column / 5) * 131 + Math.floor(row / 3);
          if (hash(chunk, tick + 9) < 0.35) continue;
          const jitter = (hash(chunk, tick) - 0.5) * cell * 8 * (1 - p);
          const split = cell * 2 * (1 - p);
          put(0, ink + 1, 0.55, KIND_PARTICLE, targetX + jitter - split, targetY, w, h, 0, seed, p);
          put(0, ink + 2, 0.55, KIND_PARTICLE, targetX + jitter + split, targetY, w, h, 0, seed, p);
          x = targetX + jitter;
        }
        break;
      case "sort": {
        const fromX = row % 2 === 0 ? -width : frame.width + width;
        const eased = easeOutExpo(p);
        x = fromX + (targetX - fromX) * eased;
        w = solid * (1 + 6 * (1 - eased));
        break;
      }
      case "swarm": {
        const eased = easeOutCubic(p);
        const turn = Math.atan2(targetY - centreY, targetX - centreX) + (1 - eased) * Math.PI * 3;
        const reach = Math.hypot(targetX - centreX, targetY - centreY) + (1 - eased) * diagonal * 0.35;
        x = centreX + Math.cos(turn) * reach;
        y = centreY + Math.sin(turn) * reach;
        angle = (1 - eased) * 4;
        w = h = solid * (0.4 + 0.6 * eased);
        break;
      }
      default: {
        // Fly in: from a scattered point, overshooting slightly into place.
        const heading = hash(seed, 2) * Math.PI * 2;
        const distance = (0.3 + 0.6 * hash(seed, 3)) * diagonal;
        const eased = easeOutBack(p);
        x = targetX + Math.cos(heading) * distance * (1 - eased);
        y = targetY + Math.sin(heading) * distance * (1 - eased);
        angle = (hash(seed, 4) - 0.5) * Math.PI * 2 * (1 - p);
        w = h = solid * (0.4 + 0.6 * Math.min(1, eased));
        alpha = Math.min(1, p * 3);
      }
    }
    put(1, colour, alpha, KIND_PARTICLE, x, y, w, h, angle, seed, p);
  }
  batch.flush();
}

/** The crisp logo drawn about the box centre, squashed for the switch-off departure. */
function drawCrisp(context: Paint2D, box: LogoBox, crisp: OffscreenCanvas | null, alpha: number, sx: number, sy: number) {
  if (!crisp || alpha <= 0) return;
  context.save();
  context.globalAlpha = alpha;
  context.translate(box.centreX, box.centreY);
  context.scale(sx, sy);
  context.drawImage(crisp, -box.width / 2, -box.height / 2, box.width, box.height);
  context.restore();
}

/** Where the lock wipe's edge is at a resolve share: a scanline's y, or the ring's radius. */
function wipeEdge(box: LogoBox, ring: boolean, resolve: number): number {
  const eased = resolve < 0.5 ? 2 * resolve * resolve : 1 - (-2 * resolve + 2) ** 2 / 2;
  const pad = box.cell * 2;
  if (ring) return eased * (Math.hypot(box.width, box.height) / 2 + pad);
  return box.top - pad + (box.height + pad * 2) * eased;
}

/** Clips to the resolved side of the wipe (above the line, inside the ring) or the side still in blocks. */
function clipWipe(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  box: LogoBox,
  ring: boolean,
  edge: number,
  resolved: boolean,
): void {
  context.beginPath();
  if (ring) {
    if (!resolved) context.rect(-frame.width, -frame.height, frame.width * 3, frame.height * 3);
    context.moveTo(box.centreX + Math.max(0.01, edge), box.centreY);
    context.arc(box.centreX, box.centreY, Math.max(0.01, edge), 0, Math.PI * 2);
    context.clip(resolved ? "nonzero" : "evenodd");
    return;
  }
  if (resolved) context.rect(-frame.width, -frame.height, frame.width * 3, edge + frame.height);
  else context.rect(-frame.width, edge, frame.width * 3, frame.height * 3);
  context.clip();
}

/** The hard bright edge of the lock wipe. */
function drawWipeEdge(context: Paint2D, box: LogoBox, ink: string, ring: boolean, edge: number): void {
  context.globalAlpha = 1;
  if (ring) {
    context.strokeStyle = ink;
    context.lineWidth = Math.max(1.5, box.cell * 0.3);
    context.beginPath();
    context.arc(box.centreX, box.centreY, Math.max(0.01, edge), 0, Math.PI * 2);
    context.stroke();
    return;
  }
  const pad = box.cell * 2;
  context.fillStyle = ink;
  context.fillRect(box.left - pad * 2, edge - box.cell * 0.22, box.width + pad * 4, box.cell * 0.44);
}

/**
 * The lock: a wipe crosses the mark (a scanline, or a ring for dot matrix)
 * with the crisp logo on its resolved side and the blocks, still fully
 * opaque, on the other, so the mark never dips; then a frame of light snaps
 * out and a scanline passes while it holds.
 */
function drawLockedLogo(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  box: LogoBox,
  logo: FlatSettings,
  art: LogoArt,
  crisp: OffscreenCanvas | null,
  since: number,
  phase: FlatPhase,
  pulse: AudioPulse,
): void {
  if (phase.resolve < 1) {
    const ring = logo.ring === true;
    const edge = wipeEdge(box, ring, phase.resolve);
    context.save();
    clipWipe(context, frame, box, ring, edge, true);
    drawCrisp(context, box, crisp, 1, 1, 1);
    context.restore();
    drawWipeEdge(context, box, logo.ink, ring, edge);
  } else {
    drawCrisp(context, box, crisp, 1, 1, 1);
  }
  drawBeatEcho(context, box, crisp, pulse, phase.resolve);
  const flash = clamp01(since / FLASH_SECONDS);
  if (flash < 1) {
    const grow = 1 + 0.12 * easeOutCubic(flash);
    context.globalAlpha = 1 - flash;
    context.strokeStyle = logo.ink;
    context.lineWidth = Math.max(2, box.cell * 0.35);
    context.strokeRect(box.centreX - (box.width * grow) / 2, box.centreY - (box.height * grow) / 2, box.width * grow, box.height * grow);
  }
  const sweep = ((since / 2.5) % 1 + 1) % 1;
  context.globalAlpha = 0.14;
  context.fillStyle = logo.ink;
  context.fillRect(box.left, box.top + sweep * box.height, box.width, Math.max(1, box.cell * 0.5));
  drawHighGlints(context, box, art, logo.ink, pulse, phase.time, 1);
}

export function drawFlatLogo(
  context: Paint2D,
  frame: Readonly<{ height: number; width: number }>,
  box: LogoBox,
  logo: FlatSettings,
  style: FlatStyle,
  art: LogoArt,
  crisp: OffscreenCanvas | null,
  schedule: FlatSchedule,
  time: number,
  pulse: AudioPulse = SILENT_PULSE,
): void {
  const phase = phaseOf(logo, schedule, time);
  context.save();
  drawBassBed(context, box, logo.ink, pulse, 1 - phase.leave);
  if (logo.exit === "collapse" && phase.exiting) {
    // A tube switching off: the mark squashes to a line, then to a point.
    const leave = phase.leave;
    const squash = leave < 0.6 ? 1 - 0.97 * easeOutCubic(leave / 0.6) : 0.03;
    const narrow = leave < 0.6 ? 1 : 1 - easeOutCubic((leave - 0.6) / 0.4);
    drawCrisp(context, box, crisp, 1, narrow, squash);
  } else if (phase.locked && phase.resolve < 1) {
    // Blocks only on the side of the wipe the crisp logo has not reached.
    context.save();
    clipWipe(context, frame, box, logo.ring === true, wipeEdge(box, logo.ring === true, phase.resolve), false);
    drawFlatBlocks(context, frame, box, logo, style, art, phase);
    context.restore();
  } else if (!phase.locked) {
    drawFlatBlocks(context, frame, box, logo, style, art, phase);
  }
  if (phase.locked) drawLockedLogo(context, frame, box, logo, art, crisp, time - schedule.built, phase, pulse);
  const handoff = time - schedule.exitStart;
  if (phase.exiting && (logo.exit === "shatter" || logo.exit === "glitch") && handoff < HANDOFF_SECONDS) {
    // The crisp logo gives way to its blocks over a couple of frames, so the departure never pops.
    drawCrisp(context, box, crisp, 1 - handoff / HANDOFF_SECONDS, 1, 1);
  }
  if (logo.hud) {
    drawBlockHud(
      context,
      {
        build: phase.build,
        cell: box.cell,
        fade: phase.exiting ? 1 - phase.leave : 1,
        frameHeight: frame.height,
        frameWidth: frame.width,
        height: box.height,
        ink: logo.ink,
        left: box.left,
        locked: time >= schedule.built,
        time,
        top: box.top,
        type: logo.type,
        width: box.width,
      },
      pulse,
    );
  }
  context.restore();
}
