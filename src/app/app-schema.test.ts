import { describe, expect, it } from "vitest";

import {
  appAcceptance,
  validateProductAcceptanceCoverage,
} from "./app-acceptance";
import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";
import { engineTargets } from "./engine/engine-settings";

const productSectionIds = () =>
  (appSchema.panels.controls?.sections ?? [])
    .map((section) => section.id)
    .filter((id) => !id.startsWith("runtime."));

describe("appSchema", () => {
  it("publishes the product shell this halftone tool assembles from", () => {
    expect(appSchema.canvas.draggable).toBe(true);
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(true);
    expect(appSchema.panels.controls?.sections[1]?.title).toBe("Settings");
    expect(
      appSchema.panels.controls?.sections[0]?.controls.settingsTransfer,
    ).toMatchObject({
      target: "runtime.settingsTransfer",
      type: "settingsTransfer",
    });
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.toolbar).toEqual({
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    });
    expect(appSchema.assembly.components).toEqual(
      expect.arrayContaining([
        "canvas",
        "controlsPanel",
        "timelinePanel",
        "toolbar",
      ]),
    );
  });

  it("orders the product sections from source material to motion", () => {
    expect(productSectionIds()).toEqual([
      "source",
      "guides",
      "grid",
      "unit",
      "field",
      "tone",
      "tone.response",
      "palette",
      "burst",
      "swirl",
      "caption",
      "camera",
      "glitch",
      "motion",
    ]);
  });

  it("enables the keyframe timeline that MP4 delivery and property animation need", () => {
    expect(appSchema.panels.timeline).toBeDefined();
    expect(appSchema.assembly.capabilities).toContain("timeline.keyframes");
    expect(
      appSchema.modulePlan.capabilities.some(({ capabilityId }) =>
        capabilityId.startsWith("artifact."),
      ),
    ).toBe(true);
    expect(appSchema.modulePlan.modules.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "image-export",
        "media-source",
        "timeline",
        "video-export",
      ]),
    );
  });

  it("declares the cell pitch as the one workload dimension", () => {
    const dimensionIds = appPerformance.workloadEnvelope.dimensions.map(
      ({ id }) => id,
    );
    expect(dimensionIds).toEqual(
      expect.arrayContaining(["export-output-pixels", "grid-cell-pitch"]),
    );
    const pitch = appPerformance.workloadEnvelope.dimensions.find(
      ({ id }) => id === "grid-cell-pitch",
    );
    // Smaller cells mean more units, so the heaviest workload is the minimum.
    expect(pitch?.source).toMatchObject({
      target: engineTargets.cell,
      workloadBoundary: "minimum",
    });
  });

  it("declares production reload coverage for the product schema", () => {
    expect(appSchema.persistence.storage).toBe("localStorage");
    if (appSchema.persistence.storage !== "localStorage") {
      throw new Error("The product must persist its workspace in localStorage.");
    }
    expect(appSchema.persistence.include).toContain("canvas");
    expect(appSchema.persistence.include).toContain("media");
    expect(
      appAcceptance.find((entry) => entry.id === "persistence.reload"),
    ).toMatchObject({
      automated: true,
      browser: {
        budget: "extended-io",
        file: "e2e/app-persistence.spec.ts",
      },
      evidence: "persistence-state",
      kind: "runtime",
      persistenceCoverage: "reload",
      persistenceSlices: appSchema.persistence.include,
      target: engineTargets.cell,
    });
    expect(validateProductAcceptanceCoverage()).toEqual([]);
  });
});
