/**
 * One scenario per canonical path. Path ids are derived from the declared
 * pipeline rather than authored, so a pipeline change cannot silently orphan
 * its coverage.
 */

import {
  deriveToolcraftPerformancePaths,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import { appSchema } from "../app-schema";
import { syntaxErrorRendererPipeline } from "./engine-pipeline";

type ScenarioCopy = {
  expectedObservable: string;
  fixture: string;
  id: string;
  uiSelector?: string;
};

const outputSelector = "[data-testid='syntax-error-output']";

const copyByInteraction: Readonly<Record<string, ScenarioCopy>> = {
  "control-change": {
    expectedObservable:
      "Committing a tone or source change reshapes the ink field and redraws every unit.",
    fixture: "wordmark source at default settings",
    id: "syntax-error.control-change",
    uiSelector: outputSelector,
  },
  "control-drag": {
    expectedObservable:
      "Dragging a unit or grid slider redraws the sheet continuously; the sampled grid is reused rather than resampled.",
    fixture: "wordmark source with the grid and unit sliders reachable",
    id: "syntax-error.control-drag",
    uiSelector: outputSelector,
  },
  export: {
    expectedObservable:
      "Exporting renders the same halftone composition at the selected resolution and downloads it.",
    fixture: "wordmark source at default settings",
    id: "syntax-error.export",
    uiSelector: outputSelector,
  },
  "initial-render": {
    expectedObservable:
      "First paint samples the source onto the grid, shapes its ink and draws every unit.",
    fixture: "wordmark source at default settings",
    id: "syntax-error.initial-render",
    uiSelector: outputSelector,
  },
  "media-import": {
    expectedObservable:
      "Importing a source decodes it, resamples the grid from its luminance and redraws the sheet.",
    fixture: "one uploaded source image in Image mode",
    id: "syntax-error.media-import",
    uiSelector: outputSelector,
  },
  "timeline-playback": {
    expectedObservable:
      "Playback redraws the unit field per frame while the sampled grid stays cached.",
    fixture: "wordmark source with pulse motion",
    id: "syntax-error.timeline-playback",
    uiSelector: outputSelector,
  },
  "timeline-scrub": {
    expectedObservable:
      "Scrubbing redraws the unit field at the new playhead without resampling the source.",
    fixture: "wordmark source with pulse motion",
    id: "syntax-error.timeline-scrub",
    uiSelector: outputSelector,
  },
};

const fallbackCopy: ScenarioCopy = {
  expectedObservable: "The halftone sheet updates for this interaction.",
  fixture: "wordmark source at default settings",
  id: "syntax-error.path",
  uiSelector: outputSelector,
};

export function buildSyntaxErrorPerformanceScenarios(): readonly ToolcraftPerformanceScenario[] {
  const paths = deriveToolcraftPerformancePaths(appSchema, {
    rendererPipeline: syntaxErrorRendererPipeline,
    rendererStrategy: "canvas-2d",
    scenarios: [],
    usesCustomRenderer: true,
    workloadEnvelope: { dimensions: [] },
  } satisfies ToolcraftEnvelopePerformanceConfig);

  return paths.map((path): ToolcraftPerformanceScenario => {
    const copy = copyByInteraction[path.interaction] ?? fallbackCopy;
    // One interaction can own several canonical paths, so the deepest
    // invalidated stage disambiguates their ids and test names.
    const stage = path.invalidates.includes("source-sample")
      ? "sample"
      : path.invalidates.includes("unit-build")
        ? "ink"
        : path.invalidates.includes("unit-draw")
          ? "draw"
          : "artifact";
    const shared = {
      automated: true,
      automatedTestName: `declares the ${path.interaction} ${stage} performance path`,
      browser: true,
      browserTestName: `browser perf: ${path.interaction} ${stage} keeps the halftone sheet responsive`,
      coversTargets: path.targets,
      expectedObservable: copy.expectedObservable,
      fixture: copy.fixture,
      id: `${copy.id}.${stage}`,
      pathId: path.id,
      uiSelector: copy.uiSelector,
    };

    if (path.interaction === "export") {
      return {
        ...shared,
        actionValue: "export.png",
        completionEvidence: "download",
        controlLabel: "Export PNG",
        interaction: "export",
      };
    }

    return { ...shared, interaction: path.interaction };
  });
}
