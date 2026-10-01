/** Section grouping decisions for the code roll, end text, text bars, data text, logo, transition, CRT and audio sections. */

import type { ToolcraftControlSectionInventoryEntry } from "../acceptance/types";
import { audioTargets } from "../engine/engine-audio";
import { barTargets } from "../engine/engine-bars";
import { crtTargets } from "../engine/engine-crt";
import { dataTextTargets } from "../engine/engine-datatext";
import { logoTargets } from "../engine/engine-logo";
import { engineTargets } from "../engine/engine-settings";
import { transitionTargets } from "../engine/engine-transition";
import { wallTargets } from "../engine/engine-wall";
import { formTargets } from "../engine/engine-form";

export const codeInventory = [
  {
    entity: "Code roll",
    entityId: "code",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Roll code switch decides whether the code roll settings are usable; all nine are explicit applicability dependents.",
        role: "branch",
        target: engineTargets.codeOn,
      },
      {
        reason: "Scroll changes how the code travels without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.codeMotion,
      },
      {
        reason: "Reveal changes how each line arrives without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.codeReveal,
      },
      {
        reason: "Break style changes how the text comes apart without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.codeBreakStyle,
      },
      {
        reason: "Sheet at end changes what follows the break without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.codeSheetAtEnd,
      },
    ],
    groupingReason:
      "One entity: the terminal text that takes over the canvas, its typography, how it arrives and travels, and how and when it breaks apart. These reset together.",
    id: "code",
    targets: [
      engineTargets.codeOn,
      engineTargets.codeText,
      engineTargets.codeMotion,
      engineTargets.codeReveal,
      engineTargets.codeType,
      engineTargets.codeRollTime,
      engineTargets.codeHold,
      engineTargets.codeBreakStyle,
      engineTargets.codeBreakTime,
      engineTargets.codeSheetAtEnd,
    ],
    title: "Code roll",
  },
  {
    entity: "End text",
    entityId: "end-text",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Show end text switch decides whether the end text settings are usable; all eight are explicit applicability dependents.",
        role: "branch",
        target: engineTargets.endOn,
      },
      {
        reason: "Reveal changes how the end text appears without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.endReveal,
      },
      {
        reason: "Blink changes its own flashing without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.endBlink,
      },
      {
        reason: "The cursor draws its own character without changing which other controls apply.",
        role: "parameter",
        target: engineTargets.endCursor,
      },
    ],
    groupingReason:
      "One entity: the caption-style text that closes the code roll, its typography, placement, reveal, hold and highlight. These reset together.",
    id: "end-text",
    targets: [
      engineTargets.endOn,
      engineTargets.endText,
      engineTargets.endReveal,
      engineTargets.endHold,
      engineTargets.endType,
      engineTargets.endPosition,
      engineTargets.endHighlight,
      engineTargets.endBlink,
      engineTargets.endCursor,
    ],
    title: "End text",
  },
  {
    entity: "Text bars",
    entityId: "bars",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Show bars switch decides whether the bar settings are usable; all seven are explicit applicability dependents.",
        role: "branch",
        target: barTargets.enabled,
      },
      {
        reason: "Style changes the bar's shape without changing which other controls apply.",
        role: "parameter",
        target: barTargets.style,
      },
    ],
    groupingReason:
      "One entity: the boxed labels that take turns through the frame, each with its own text and motion, their look and pacing. These reset together.",
    id: "bars",
    targets: [
      barTargets.enabled,
      barTargets.items,
      barTargets.style,
      barTargets.type,
      barTargets.position,
      barTargets.scatter,
      barTargets.time,
      barTargets.hold,
    ],
    title: "Text bars",
  },
  {
    entity: "Data text",
    entityId: "data",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Show data text switch decides whether the data text settings are usable; all twelve are explicit applicability dependents.",
        role: "branch",
        target: dataTextTargets.enabled,
      },
      {
        reason: "Reveal changes how items come on without changing which other controls apply.",
        role: "parameter",
        target: dataTextTargets.reveal,
      },
      {
        reason: "Departure changes how items leave without changing which other controls apply.",
        role: "parameter",
        target: dataTextTargets.exit,
      },
      {
        reason: "Starts moves the data text in time without changing which other controls apply.",
        role: "parameter",
        target: dataTextTargets.timing,
      },
      {
        reason: "Tile block repeats the same labels without changing which other controls apply.",
        role: "parameter",
        target: dataTextTargets.repeat,
      },
      {
        reason: "Markers draws its own squares without changing which other controls apply.",
        role: "parameter",
        target: dataTextTargets.markers,
      },
      {
        reason: "Rules draws its own bars without changing which other controls apply.",
        role: "parameter",
        target: dataTextTargets.rules,
      },
    ],
    groupingReason:
      "One entity: the data labels placed around the frame, their typography, how they reveal and leave, their timing, and the markers and rules that frame them. These reset together.",
    id: "data",
    targets: [
      dataTextTargets.enabled,
      dataTextTargets.items,
      dataTextTargets.type,
      dataTextTargets.reveal,
      dataTextTargets.exit,
      dataTextTargets.timing,
      dataTextTargets.start,
      dataTextTargets.stagger,
      dataTextTargets.hold,
      dataTextTargets.repeat,
      dataTextTargets.box,
      dataTextTargets.markers,
      dataTextTargets.rules,
    ],
    title: "Data text",
  },
  {
    entity: "Word wall",
    entityId: "wall",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Show word wall switch decides whether the word wall settings are usable; all fifteen are explicit applicability dependents.",
        role: "branch",
        target: wallTargets.enabled,
      },
      {
        reason: "Starts moves the wall in time without changing which other controls apply.",
        role: "parameter",
        target: wallTargets.timing,
      },
      {
        reason: "Arrival changes how words land without changing which other controls apply.",
        role: "parameter",
        target: wallTargets.entry,
      },
      {
        reason: "Clear sheet hides the halftone without changing which other controls apply.",
        role: "parameter",
        target: wallTargets.cover,
      },
      {
        reason: "Sheet blast fires the burst without changing which other controls apply.",
        role: "parameter",
        target: wallTargets.blast,
      },
    ],
    groupingReason:
      "One entity: the repeated word that fills the screen around a boxed centre copy, its typography and grid spacing, its phase timing and its burst. These reset together.",
    id: "wall",
    targets: [
      wallTargets.enabled,
      wallTargets.text,
      wallTargets.type,
      wallTargets.timing,
      wallTargets.entry,
      wallTargets.duration,
      wallTargets.hero,
      wallTargets.land,
      wallTargets.hold,
      wallTargets.burst,
      wallTargets.force,
      wallTargets.spin,
      wallTargets.colGap,
      wallTargets.rowGap,
      wallTargets.cover,
      wallTargets.blast,
    ],
    title: "Word wall",
  },
  {
    entity: "Image form",
    entityId: "form",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Form image switch decides whether the image form settings are usable; all thirteen are explicit applicability dependents.",
        role: "branch",
        target: formTargets.enabled,
      },
      {
        affectedTargets: [],
        reason: "Style decides whether the particle Effect and Intensity or the glyph Ink and Invert apply.",
        role: "branch",
        target: formTargets.style,
      },
      {
        affectedTargets: [],
        reason: "Effect decides whether Intensity applies; only Mosaic uses it.",
        role: "branch",
        target: formTargets.effect,
      },
      {
        reason: "Order changes which cells lock first without changing which other controls apply.",
        role: "parameter",
        target: formTargets.order,
      },
      {
        reason: "Starts moves the layer in time without changing which other controls apply.",
        role: "parameter",
        target: formTargets.timing,
      },
      {
        reason: "Invert flips which tones form without changing which other controls apply.",
        role: "parameter",
        target: formTargets.invert,
      },
      {
        reason: "Clear sheet hides the halftone without changing which other controls apply.",
        role: "parameter",
        target: formTargets.cover,
      },
    ],
    groupingReason:
      "One entity: the uploaded picture that forms out of glyphs, its order, timing, glyph grid, size and ink. These reset together.",
    id: "form",
    targets: [
      formTargets.enabled,
      formTargets.file,
      formTargets.style,
      formTargets.effect,
      formTargets.intensity,
      formTargets.order,
      formTargets.timing,
      formTargets.duration,
      formTargets.hold,
      formTargets.cell,
      formTargets.size,
      formTargets.ink,
      formTargets.invert,
      formTargets.cover,
    ],
    title: "Image form",
  },
  {
    entity: "Logo reveal",
    entityId: "logo",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Reveal logo switch decides whether the logo settings are usable; all twelve are explicit applicability dependents.",
        role: "branch",
        target: logoTargets.enabled,
      },
      {
        reason: "Departure changes how the logo leaves without changing which other controls apply.",
        role: "parameter",
        target: logoTargets.exit,
      },
      {
        reason: "Starts moves the reveal in time without changing which other controls apply.",
        role: "parameter",
        target: logoTargets.timing,
      },
      {
        affectedTargets: [],
        reason: "Tint decides whether Ink is usable; it is an explicit applicability dependent.",
        role: "branch",
        target: logoTargets.tint,
      },
      {
        reason: "The HUD draws its own frame without changing which other controls apply.",
        role: "parameter",
        target: logoTargets.hud,
      },
    ],
    groupingReason:
      "One entity: the uploaded logo, how it assembles and leaves, its timing, size, grain, colour and HUD. These reset together.",
    id: "logo",
    targets: [
      logoTargets.enabled,
      logoTargets.file,
      logoTargets.exit,
      logoTargets.timing,
      logoTargets.delay,
      logoTargets.build,
      logoTargets.hold,
      logoTargets.size,
      logoTargets.position,
      logoTargets.block,
      logoTargets.tint,
      logoTargets.ink,
      logoTargets.hud,
    ],
    title: "Logo reveal",
  },
  {
    entity: "Logo build",
    entityId: "logo-build",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "Assembly decides which build settings are usable; the cinematic and dot matrix settings are explicit applicability dependents.",
        role: "branch",
        target: logoTargets.style,
      },
      { reason: "Camera changes the shot list without changing which other controls apply.", role: "parameter", target: logoTargets.camera },
      { reason: "Pieces changes how the logo is cut up without changing which other controls apply.", role: "parameter", target: logoTargets.parts },
      { reason: "Particles changes what the build is made of without changing which other controls apply.", role: "parameter", target: logoTargets.particle },
      { reason: "Floor grid draws its own floor without changing which other controls apply.", role: "parameter", target: logoTargets.floor },
      { reason: "Debris draws its own streaks without changing which other controls apply.", role: "parameter", target: logoTargets.streaks },
    ],
    groupingReason:
      "One entity: how the logo assembles, its 3D camera, depth, impacts, pieces, particles, floor and debris. These reset together.",
    id: "logo-build",
    targets: [
      logoTargets.style,
      logoTargets.camera,
      logoTargets.swing,
      logoTargets.depth,
      logoTargets.impact,
      logoTargets.parts,
      logoTargets.particle,
      logoTargets.floor,
      logoTargets.streaks,
    ],
    title: "Logo build",
  },
  {
    entity: "Transition",
    entityId: "transition",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Glitch filler switch decides whether the filler settings are usable; all eleven are explicit applicability dependents.",
        role: "branch",
        target: transitionTargets.enabled,
      },
      {
        reason: "Style changes how the filler looks without changing which other controls apply.",
        role: "parameter",
        target: transitionTargets.style,
      },
      {
        affectedTargets: [],
        reason: "Placement decides whether Beat threshold is usable; it is an explicit applicability dependent.",
        role: "branch",
        target: transitionTargets.placement,
      },
      {
        reason: "Direction turns the filler without changing which other controls apply.",
        role: "parameter",
        target: transitionTargets.direction,
      },
      {
        reason: "Blocks sets the filler's pixel size without changing which other controls apply.",
        role: "parameter",
        target: transitionTargets.blocks,
      },
    ],
    groupingReason:
      "One entity: the glitch filler that hides cuts, where it plays, how it looks, moves and holds, and its colours. These reset together.",
    id: "transition",
    targets: [
      transitionTargets.enabled,
      transitionTargets.style,
      transitionTargets.placement,
      transitionTargets.threshold,
      transitionTargets.direction,
      transitionTargets.duration,
      transitionTargets.hold,
      transitionTargets.intensity,
      transitionTargets.blocks,
      transitionTargets.color,
      transitionTargets.fill,
      transitionTargets.cover,
    ],
    title: "Transition",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];

export const crtInventory = [
  {
    entity: "CRT",
    entityId: "crt",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The CRT effect switch decides whether the CRT settings are usable; all five are explicit applicability dependents.",
        role: "branch",
        target: crtTargets.enabled,
      },
      {
        reason: "Passes changes its own roll speed without changing which other controls apply.",
        role: "parameter",
        target: crtTargets.passes,
      },
    ],
    groupingReason:
      "One entity: the monitor pass over the finished frame, its scanlines, its rolling band of light and its grain. These reset together.",
    id: "crt",
    targets: [
      crtTargets.enabled,
      crtTargets.strength,
      crtTargets.spacing,
      crtTargets.band,
      crtTargets.grain,
      crtTargets.passes,
    ],
    title: "CRT",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];

export const audioInventory = [
  {
    entity: "Audio",
    entityId: "audio",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The Audio reactive switch decides whether the audio settings are usable; all eleven are explicit applicability dependents.",
        role: "branch",
        target: audioTargets.enabled,
      },
      {
        reason: "Beat burst changes when bursts fire without changing which other controls apply.",
        role: "parameter",
        target: audioTargets.burstOnBeat,
      },
      {
        reason: "Beat glitch changes when the glitch tears without changing which other controls apply.",
        role: "parameter",
        target: audioTargets.glitchOnBeat,
      },
      {
        reason: "Beat flash changes what a hard beat does without changing which other controls apply.",
        role: "parameter",
        target: audioTargets.flashOnBeat,
      },
      {
        reason: "Beat shake changes what a hard beat does without changing which other controls apply.",
        role: "parameter",
        target: audioTargets.shakeOnBeat,
      },
    ],
    groupingReason:
      "One entity: the song that drives the picture, the segment a clip covers, how strongly it reacts and which effects its beats fire. These reset together.",
    id: "audio",
    targets: [
      audioTargets.enabled,
      audioTargets.file,
      audioTargets.start,
      audioTargets.volume,
      audioTargets.sensitivity,
      audioTargets.pulse,
      audioTargets.levels,
      audioTargets.zoom,
      audioTargets.burstOnBeat,
      audioTargets.glitchOnBeat,
      audioTargets.flashOnBeat,
      audioTargets.shakeOnBeat,
    ],
    title: "Audio",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
