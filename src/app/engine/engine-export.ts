/**
 * Runtime-owned artifact export. The product supplies only scene bounds and a
 * deterministic transparent foreground frame; runtime owns background, sizing,
 * encoding, download, and progress for both PNG and MP4.
 */

import {
  getToolcraftFiniteArtboardRect,
  type ToolcraftProductExportRenderer,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftSceneRect,
} from "@/toolcraft/runtime";

import { waitForFont } from "./engine-fonts";
import { findSourceAsset, resolveSourceRaster } from "./engine-grid";
import { renderSyntaxErrorFrame, resolveGridShape } from "./engine-render";
import {
  readEngineSettings,
  sourceTargetFor,
  type EngineSettings,
} from "./engine-settings";
import { gridFromRaster } from "./engine-source";

/** How long an export waits for a freshly chosen caption typeface. */
const EXPORT_FONT_WAIT_MS = 3000;

type StateLike = Readonly<{
  canvas: Readonly<{ size: { height: number; width: number } }>;
  mediaAssets: readonly {
    assetKind: string;
    id: string;
    lifecycle?: string;
    sourceTarget?: string;
  }[];
  values: Readonly<Record<string, unknown>>;
}>;

/**
 * The composition always fills exactly one artboard, so Infinity exports the
 * same sheet as finite mode.
 */
export const syntaxErrorSceneBounds: ToolcraftProductSceneBoundsProvider = ({
  state,
}) => {
  const rect: ToolcraftSceneRect = getToolcraftFiniteArtboardRect(
    state.canvas.size,
  );
  return [rect];
};

function resolveAssetId(
  state: StateLike,
  settings: EngineSettings,
): string | null {
  const target = sourceTargetFor(settings.sourceKind);
  return findSourceAsset(state.mediaAssets, target)?.id ?? null;
}

export const syntaxErrorExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "syntax-error",
  renderFrame: async ({ context, frame, signal, state, timeSeconds }) => {
    signal.throwIfAborted();
    const stateLike = state as unknown as StateLike;
    const settings = readEngineSettings(stateLike.values);
    const raster = await resolveSourceRaster({
      assetId: resolveAssetId(stateLike, settings),
      frameHeight: frame.height,
      frameWidth: frame.width,
      settings,
      timeSeconds,
    });
    signal.throwIfAborted();
    const shape = resolveGridShape(settings, frame.width, frame.height);
    const grid = raster ? gridFromRaster(raster, shape.cols, shape.rows) : null;
    // Backdrop, burst, swirl and caption still draw without a sampled source.
    if (settings.caption.enabled && settings.caption.text.trim().length > 0) {
      await waitForFont(settings.caption.type, EXPORT_FONT_WAIT_MS);
      signal.throwIfAborted();
    }

    renderSyntaxErrorFrame({
      context,
      frame: {
        height: frame.height,
        width: frame.width,
        x: frame.x,
        y: frame.y,
      },
      grid,
      progress: readLoopProgress(state),
      settings,
    });
  },
};

/** Forward loop progress for the evaluated export frame. */
function readLoopProgress(state: unknown): number {
  const timeline = (
    state as { timeline?: { currentTimeSeconds?: number; durationSeconds?: number } }
  ).timeline;
  const duration = timeline?.durationSeconds ?? 0;
  const current = timeline?.currentTimeSeconds ?? 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const wrapped = ((current % duration) + duration) % duration;
  return wrapped / duration;
}
