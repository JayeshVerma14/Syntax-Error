/** Section grouping decisions for the code roll, end text, CRT and audio sections. */

import type { ToolcraftControlSectionInventoryEntry } from "../acceptance/types";
import { audioTargets } from "../engine/engine-audio";
import { crtTargets } from "../engine/engine-crt";
import { engineTargets } from "../engine/engine-settings";

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
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];

export const crtInventory = [
  {
    entity: "CRT",
    entityId: "crt",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason:
          "The CRT effect switch decides whether the CRT settings are usable; all four are explicit applicability dependents.",
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
      "One entity: the monitor pass over the finished frame, its scanlines and its rolling band of light. These reset together.",
    id: "crt",
    targets: [
      crtTargets.enabled,
      crtTargets.strength,
      crtTargets.spacing,
      crtTargets.band,
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
          "The Audio reactive switch decides whether the audio settings are usable; all eight are explicit applicability dependents.",
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
      audioTargets.burstOnBeat,
      audioTargets.glitchOnBeat,
    ],
    title: "Audio",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
