import {
  defineToolcraftPerformance,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";

import { MIN_CELL_PX } from "./engine/engine-constants";
import { buildSyntaxErrorPerformanceScenarios } from "./engine/engine-performance-scenarios";
import { syntaxErrorRendererPipeline } from "./engine/engine-pipeline";
import { engineTargets } from "./engine/engine-settings";

/**
 * Cell size is the one control that changes how many units are drawn. It is an
 * inverse dimension: the smallest pitch is the heaviest workload, so the
 * envelope boundary is the schema minimum rather than its maximum.
 */
export const appPerformance: ToolcraftEnvelopePerformanceConfig =
  defineToolcraftPerformance({
    fixtureAdapters: {
      dimensions: {
        "export-output-pixels": {
          apply: (value: number) =>
            value >= 8192 ? "8k" : value >= 4096 ? "4k" : "2k",
          dimensionId: "export-output-pixels",
          domain: {
            kind: "schema-options",
            optionValues: ["2k", "4k", "8k"],
            target: "export.image.resolution",
          },
          entries: [
            { appliedValue: "2k", value: 2048 },
            { appliedValue: "4k", value: 4096 },
            { appliedValue: "8k", value: 8192 },
          ],
          kind: "exhaustive-discrete",
          observe: (value: string) =>
            value === "8k" ? 8192 : value === "4k" ? 4096 : 2048,
        },
        "grid-cell-pitch": {
          apply: (value: number) => value,
          dimensionId: "grid-cell-pitch",
          observe: (value: number) => value,
        },
      },
    },
    rendererPipeline: syntaxErrorRendererPipeline,
    rendererStrategy: "canvas-2d",
    rendererTechnique: {
      exportRenderer: "canvas-2d",
      fidelityRisks: [
        "A glyph unit is rasterized through the system font stack, so a symbol absent from the available fonts falls back rather than failing loudly.",
        "At the smallest cell pitch a unit covers a couple of device pixels, where antialiasing carries more of the tone than the unit's own area.",
      ],
      layers: [
        {
          content: ["dense-pattern"],
          exportMode: "included",
          id: "unit-field",
          kind: "product-foreground",
          primitiveCount: "high",
          renderer: "canvas-2d",
          uiSelector: "[data-testid='syntax-error-output']",
        },
      ],
      performanceRisks: [
        "Cell pitch drives the unit count quadratically, so the smallest pitch on the largest artboard is the heaviest interactive frame.",
        "Footage sources decode one frame per evaluated timeline time, so export latency follows decode speed rather than draw cost.",
      ],
      previewRenderer: "canvas-2d",
      productRepresentation: "pixel",
      rendererStrategy: "canvas-2d",
      sourceRepresentation: "mixed",
      whyNotAlternativeStrategies: [
        "SVG would emit one node per drawn unit, and a dense grid produces tens of thousands of units per sheet.",
        "WebGL adds context and shader lifetime cost without removing the per-cell sampling sweep that dominates.",
        "DOM cannot express this many independently coloured marks at frame rate.",
      ],
    },
    scenarios: buildSyntaxErrorPerformanceScenarios(),
    usesCustomRenderer: true,
    workloadEnvelope: {
      dimensions: [
        {
          batchMax: MIN_CELL_PX,
          defaultValue: 24,
          id: "grid-cell-pitch",
          interactiveMax: MIN_CELL_PX,
          mapping: "area",
          source: {
            kind: "schema-target",
            target: engineTargets.cell,
            workloadBoundary: "minimum",
          },
          unit: "px",
        },
        {
          batchMax: 8192,
          defaultValue: 4096,
          id: "export-output-pixels",
          mapping: "area",
          source: {
            kind: "schema-target",
            target: "export.image.resolution",
          },
          unit: "px",
        },
      ],
    },
  });
