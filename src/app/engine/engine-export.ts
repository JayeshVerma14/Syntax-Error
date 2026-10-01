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

import {
  audioTargets,
  sampleAudio,
  segmentFileSuffix,
  songSecondsAt,
  type AudioFrame,
} from "./engine-audio";
import { awaitSong, sliceSong } from "./engine-audio-io";
import { barLines } from "./engine-bars";
import { LOOP_SECONDS } from "./engine-constants";
import { logoTargets } from "./engine-logo";
import { prepareLogoFrame } from "./engine-logo-art";
import { waitForFont } from "./engine-fonts";
import { findSourceAsset, resolveSourceRaster } from "./engine-grid";
import { renderSyntaxErrorFrame, resolveGridShape, type LogoFrame } from "./engine-render";
import {
  readEngineSettings,
  sourceTargetFor,
  type EngineSettings,
} from "./engine-settings";
import { awaitStillSource, gridFromRaster } from "./engine-source";

/** How long an export waits for a freshly chosen caption typeface. */
const EXPORT_FONT_WAIT_MS = 3000;

/**
 * The export canvas already holds the runtime's background when the frame
 * renderer runs, so marks cut out of their boxes (knockout, seal, the caption
 * highlight) would cut through it and encode as holes. The sheet is drawn on
 * its own transparent layer first, exactly as the preview draws above the
 * background, and that layer is then laid over the artifact frame. The layer
 * is kept across the frames of one export and released once exports go idle.
 */
const LAYER_IDLE_MS = 4000;
let exportLayer: OffscreenCanvasRenderingContext2D | null = null;
let layerRelease: ReturnType<typeof setTimeout> | null = null;

function exportLayerFor(
  width: number,
  height: number,
): OffscreenCanvasRenderingContext2D | null {
  if (layerRelease !== null) clearTimeout(layerRelease);
  layerRelease = setTimeout(() => {
    exportLayer = null;
    layerRelease = null;
  }, LAYER_IDLE_MS);
  if (
    exportLayer &&
    exportLayer.canvas.width === width &&
    exportLayer.canvas.height === height
  ) {
    return exportLayer;
  }
  exportLayer = new OffscreenCanvas(width, height).getContext("2d");
  return exportLayer;
}

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

/** The uploaded song's resource, while Audio reactive is on. */
function resolveSongId(state: StateLike, settings: EngineSettings): string | null {
  if (!settings.audio.enabled) return null;
  return findSourceAsset(state.mediaAssets, audioTargets.file)?.id ?? null;
}

/** The uploaded logo prepared for an exported frame, while the logo is on. */
function logoAt(
  state: StateLike,
  settings: EngineSettings,
  frameWidth: number,
  frameHeight: number,
): Promise<LogoFrame | undefined> {
  const id = settings.logo.enabled
    ? findSourceAsset(state.mediaAssets, logoTargets.file)?.id
    : undefined;
  if (!id) return Promise.resolve(undefined);
  return awaitStillSource(id).then((image) =>
    image ? (prepareLogoFrame(id, image, settings.logo, frameWidth, frameHeight) ?? undefined) : undefined,
  );
}

/** The music at an exported frame's song moment. */
async function soundAt(
  state: StateLike,
  settings: EngineSettings,
  timeSeconds: number,
): Promise<AudioFrame | undefined> {
  const songId = resolveSongId(state, settings);
  const song = songId ? await awaitSong(songId) : null;
  if (!song) return undefined;
  return sampleAudio(
    song.analysis,
    songSecondsAt(settings.audio, timeSeconds),
    settings.audio.sensitivity,
  );
}

const BASE_FILE_NAME = "syntax-error";

export const syntaxErrorExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: BASE_FILE_NAME,
  // The song segment a clip covers rides along in its video, so clips cut
  // from one track line up again against it in an editor.
  renderAudio: ({ durationSeconds, signal, state }) => {
    const stateLike = state as unknown as StateLike;
    const settings = readEngineSettings(stateLike.values);
    const songId = resolveSongId(stateLike, settings);
    const start = settings.audio.start;
    const volume = settings.audio.volume / 100;
    return (songId ? awaitSong(songId) : Promise.resolve(null)).then((song) => {
      signal.throwIfAborted();
      return song ? sliceSong(song, start, durationSeconds, volume) : null;
    });
  },
  // A reactive clip is named after its song segment, so clips sort into order.
  resolveFileName: (state) => {
    const stateLike = state as unknown as StateLike;
    const settings = readEngineSettings(stateLike.values);
    if (!resolveSongId(stateLike, settings)) return BASE_FILE_NAME;
    return `${BASE_FILE_NAME}${segmentFileSuffix(settings.audio, readLoopSeconds(state))}`;
  },
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
    const sound = await soundAt(stateLike, settings, timeSeconds);
    const logo = await logoAt(stateLike, settings, frame.width, frame.height);
    signal.throwIfAborted();
    // Backdrop, burst, swirl, caption and the code roll still draw without a
    // sampled source; each text layer waits for its chosen face.
    for (const block of textLayers(settings)) {
      if (block.enabled && block.text.trim().length > 0) {
        await waitForFont(block.type, EXPORT_FONT_WAIT_MS);
        signal.throwIfAborted();
      }
    }

    const target = context.canvas;
    const layer = exportLayerFor(target.width, target.height);
    if (layer) {
      const matrix = context.getTransform();
      layer.setTransform(1, 0, 0, 1, 0, 0);
      layer.clearRect(0, 0, target.width, target.height);
      layer.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    }
    renderSyntaxErrorFrame({
      // Without a layer (allocation refused) the sheet draws straight on.
      context: layer ?? context,
      frame: {
        height: frame.height,
        width: frame.width,
        x: frame.x,
        y: frame.y,
      },
      durationSeconds: readLoopSeconds(state),
      grid,
      logo,
      progress: readLoopProgress(state),
      settings,
      sound,
    });
    if (layer) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(layer.canvas, 0, 0);
      context.restore();
    }
  },
};

/** Every text layer, as its switch, its words and its face. */
function textLayers(
  settings: EngineSettings,
): readonly Readonly<{ enabled: boolean; text: string; type: EngineSettings["caption"]["type"] }>[] {
  return [
    settings.caption,
    settings.code,
    settings.endText,
    {
      enabled: settings.bars.enabled,
      text: barLines(settings.bars).map((item) => item.text).join(" "),
      type: settings.bars.type,
    },
    {
      enabled: settings.dataText.enabled,
      text: settings.dataText.items.map((item) => item.text).join(" "),
      type: settings.dataText.type,
    },
    settings.wall,
  ];
}

/** Timeline loop length for the export, so code-roll phases keep their seconds. */
function readLoopSeconds(state: unknown): number {
  const duration = (state as { timeline?: { durationSeconds?: number } }).timeline
    ?.durationSeconds;
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0
    ? duration
    : LOOP_SECONDS;
}

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
