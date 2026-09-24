import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import {
  syntaxErrorExportRenderer,
  syntaxErrorSceneBounds,
} from "./engine/engine-export";
import { handleSyntaxErrorPanelAction } from "./engine/engine-actions";
import { syntaxErrorRendererPipeline } from "./engine/engine-pipeline";
import { ProductCanvas } from "./engine/product-canvas";

export const appComposition = composeToolcraftApp(appSchema, {
  actions: { onPanelAction: handleSyntaxErrorPanelAction },
  renderer: { pipelineRegistration: syntaxErrorRendererPipeline },
  scene: {
    canvasContent: <ProductCanvas />,
    rasterFrameRenderer: syntaxErrorExportRenderer,
    // The product replaces generic image preview: the source is processed into
    // units rather than shown underneath them.
    renderDefaultCanvasMedia: false,
    sceneBoundsProvider: syntaxErrorSceneBounds,
  },
});
