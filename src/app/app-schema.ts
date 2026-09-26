import {
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
  burstSection,
  captionSection,
  swirlSection,
} from "./schema/schema-sections-effects";
import { fieldSection } from "./schema/schema-sections-field";
import { guidesSection } from "./schema/schema-sections-guides";
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
    persistence: { storage: "localStorage" },
    settingsTransfer: { enabled: "auto" },
    panels: {
      controls: {
        sections: [
          backgroundSection,
          sourceSection,
          guidesSection,
          gridSection,
          unitSection,
          fieldSection,
          toneSection,
          toneResponseSection,
          paletteSection,
          burstSection,
          swirlSection,
          captionSection,
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
    mediaSourceModule(),
    timelineModule({ defaultDurationSeconds: LOOP_SECONDS, mode: "keyframes" }),
    imageExportModule(),
    videoExportModule(),
  ],
});
