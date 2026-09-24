import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { editingAcceptance } from "./acceptance-data/acceptance-rows-editing";
import { samplingAcceptance } from "./acceptance-data/acceptance-rows-sampling";
import { viewAcceptance } from "./acceptance-data/acceptance-rows-view";

/**
 * The answer that established MP4 delivery. Export formats were offered
 * explicitly and the user's reply is preserved verbatim.
 */
const videoRequestEvidence = {
  messageRef:
    "C--Users-jayes-Downloads-Syntax-Error-is-here/15d2e632-6542-4117-aa9c-548fcfce5d56.jsonl#line=203;uuid=38f31401-ece3-4240-b923-438ed10721fa",
  messageText:
    'The user answered: "Which export formats should the tool ship with?"="png and mp4", "What should be accepted as source material?"="Image upload (PNG/JPG),SVG upload,Video upload as source,Text / glyph source"',
  quote: "png and mp4",
  source: "user-message",
} as const;

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence:
        "No loop length was requested. Four seconds is 120 frames at the runtime's fixed 30 FPS schedule, long enough for a staggered cycle to cross the full grid and return to its first frame without the cell field visibly repeating mid-loop.",
      seconds: 4,
      source: "product-derived",
    },
    mode: "timeline-keyframes",
  },
  mode: "new-toolcraft-app",
  referenceInputs: [],
};

export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: { evidence: videoRequestEvidence, mode: "user-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "A panel copy would ask the user to type cell coordinates for a gesture whose whole value is landing marks by eye.",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail:
          "The inspected tool paints cells by pressing and dragging on the artwork, with a Shift-click straight-line shortcut.",
        source: "reference",
      },
      id: "cell-paint",
      reason:
        "Painting is a spatial gesture over the output; the canvas preserves correspondence between where the pointer is and which cell changes.",
      surface: "canvas",
      target: "controls.setValue",
    },
    {
      alternative: {
        reason:
          "Canvas chrome for ink, brush mode and size would sit permanently over the artwork being judged.",
        surface: "canvas",
      },
      capability: "property-edit",
      evidence: {
        detail:
          "The inspected tool keeps drawing colour, brush type and brush size in its side panel while the canvas stays pure output.",
        source: "reference",
      },
      id: "brush-properties",
      reason:
        "The brush settings are values to configure, not positions to point at, so the panel keeps them readable and out of the artwork.",
      selectionScope: { mode: "global" },
      surface: "panel",
      target: "tool.color",
    },
  ],
  mode: "product",
  productName: "Syntax Error",
  productSummary:
    "Turns an image, vector, footage frame, or wordmark into a grid of repeated units - discs, bars, rings, or any typed glyph - quantized to a brand ink list, for building halftone branding assets.",
  requestedBehavior:
    "A branding halftone tool with four source kinds, a selectable unit shape that also accepts arbitrary symbols and glyphs as the repeated unit, dither engines, a column layout, a glyph tone ramp, editable brand ink lists, and PNG plus MP4 delivery.",
  viewInteraction: {
    authority: {
      kind: "explicit-user-request",
      requestQuote: "there are some camera angle properties too",
    },
    mode: "fixed-camera",
  },
};

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  ...samplingAcceptance,
  ...editingAcceptance,
  ...viewAcceptance,
];

export { appControlSectionInventory } from "./acceptance-data/section-inventory";
