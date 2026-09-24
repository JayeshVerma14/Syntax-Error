import {
  canvasEditingModule,
  defineToolcraft,
  imageExportModule,
  mediaSourceModule,
  timelineModule,
  videoExportModule,
} from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { appIdentity } from "./app-identity";
import { LOOP_SECONDS } from "./engine/engine-constants";
import {
  brushSection,
  guidesSection,
  patternSection,
} from "./schema/schema-sections-editing";
import {
  backgroundSection,
  gridSection,
  sourceSection,
  unitSection,
} from "./schema/schema-sections-sampling";
import {
  paletteSection,
  toneResponseSection,
  toneSection,
} from "./schema/schema-sections-tone";
import {
  cameraSection,
  glitchSection,
  motionSection,
} from "./schema/schema-sections-view";

export const appSchema = defineToolcraft({
  defaults: appDefaults,
  base: {
    canvas: {
      enabled: true,
      renderScale: true,
      size: { height: 1080, unit: "px", width: 1080 },
      sizing: { mode: "editable-output" },
      upload: true,
    },
    identity: appIdentity,
    // The painted layer is product-owned state rather than a control value, so
    // it opts into persistence and settings transfer explicitly.
    persistence: {
      additionalValueTargets: ["edit.cells"],
      storage: "localStorage",
    },
    settingsTransfer: { additionalValueTargets: ["edit.cells"], enabled: "auto" },
    panels: {
      controls: {
        sections: [
          backgroundSection,
          sourceSection,
          brushSection,
          guidesSection,
          patternSection,
          gridSection,
          unitSection,
          toneSection,
          toneResponseSection,
          paletteSection,
          cameraSection,
          glitchSection,
          motionSection,
        ],
        title: "Controls",
      },
    },
    toolbar: {
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    },
  },
  modules: [
    canvasEditingModule(),
    mediaSourceModule(),
    timelineModule({ defaultDurationSeconds: LOOP_SECONDS, mode: "keyframes" }),
    imageExportModule(),
    videoExportModule(),
  ],
});
