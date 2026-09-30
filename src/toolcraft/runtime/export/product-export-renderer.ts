import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ReadonlyToolcraftState } from "../state/readonly-state";
import type { ToolcraftExportFrame } from "./export-frame";
import type { ToolcraftProductExportBoundsProvider } from "./product-export-bounds";

export type ToolcraftProductExportFrameContext = Readonly<{
  context: CanvasRenderingContext2D;
  frame: ToolcraftExportFrame;
  pixelRatio: number;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  signal: AbortSignal;
  state: ReadonlyToolcraftState;
  timeSeconds: number;
  timelineProgress: number;
}>;

export type ToolcraftProductExportFrameRenderer = (
  context: ToolcraftProductExportFrameContext,
) => PromiseLike<void> | void;

/**
 * Syntax Error override — soundtrack for video exports. Returns the audio that
 * accompanies the exported timeline, already cut to its length, or null for a
 * silent export.
 */
export type ToolcraftProductExportAudioRenderer = (
  context: Readonly<{
    durationSeconds: number;
    signal: AbortSignal;
    state: ReadonlyToolcraftState;
  }>,
) => Promise<AudioBuffer | null>;

export type ToolcraftProductExportRenderer = Readonly<{
  baseFileName: string;
  getContentBounds?: ToolcraftProductExportBoundsProvider;
  /** Syntax Error override: optional soundtrack for video exports. */
  renderAudio?: ToolcraftProductExportAudioRenderer;
  renderFrame: ToolcraftProductExportFrameRenderer;
  /** Syntax Error override: a file name for this export's state, e.g. its song segment. */
  resolveFileName?: (state: ReadonlyToolcraftState) => string;
}>;
