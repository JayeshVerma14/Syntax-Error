"use client";

import * as React from "react";

import type { ToolcraftMediaAsset, ToolcraftState } from "@/toolcraft/runtime";
import {
  useToolcraftEvaluatedValues,
  useToolcraftMediaPresentationUrls,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
  useToolcraftViewportInteractionActive,
} from "@/toolcraft/runtime/react";

import { isFontReady, waitForFont } from "./engine-fonts";
import { registerFootage, seekFootage } from "./engine-footage";
import { findSourceAsset, peekSourceRaster } from "./engine-grid";
import {
  renderEditorOverlays,
  renderSyntaxErrorFrame,
  resolveGridShape,
} from "./engine-render";
import {
  engineTargets,
  readEngineSettings,
  type TypeSettings,
} from "./engine-settings";
import {
  gridFromRaster,
  loadStillSource,
  releaseSources,
  type SourceGrid,
  type SourceRaster,
} from "./engine-source";
import styles from "./product-canvas.module.css";

type TimelineSlice = Readonly<{
  currentTimeSeconds: number;
  durationSeconds: number;
}>;

/** How long the preview keeps waiting for a chosen typeface to load. */
const FONT_WAIT_MS = 15_000;

function selectMediaAssets(
  state: ToolcraftState,
): readonly ToolcraftMediaAsset[] {
  return state.mediaAssets;
}

function mediaAssetsEqual(
  previous: readonly ToolcraftMediaAsset[],
  next: readonly ToolcraftMediaAsset[],
): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  return previous.every((asset, index) => asset === next[index]);
}

function selectTimeline(state: ToolcraftState): TimelineSlice {
  return {
    currentTimeSeconds: state.timeline.currentTimeSeconds,
    durationSeconds: state.timeline.durationSeconds,
  };
}

function timelineEqual(previous: TimelineSlice, next: TimelineSlice): boolean {
  return (
    previous.currentTimeSeconds === next.currentTimeSeconds &&
    previous.durationSeconds === next.durationSeconds
  );
}

/**
 * Redraws once a picked typeface arrives. A font picker loads its selected
 * font after the first frame has already drawn with the fallback, so the
 * sheet would otherwise keep the fallback until something else changed.
 */
function useFontArrival(
  type: TypeSettings,
  inUse: boolean,
  onArrive: () => void,
): void {
  // The latest callback and face are read through a ref; the effect re-runs
  // only when the requested face itself changes, not on every layout edit.
  const latest = React.useRef({ onArrive, type });
  latest.current = { onArrive, type };
  const faceKey = `${type.fontId}|${type.fontWeight}`;
  React.useEffect(() => {
    const face = latest.current.type;
    if (!inUse || faceKey.length === 0 || isFontReady(face)) return;
    let active = true;
    void waitForFont(face, FONT_WAIT_MS, () => active).then((ready) => {
      if (active && ready) latest.current.onArrive();
    });
    return () => {
      active = false;
    };
  }, [faceKey, inUse]);
}

export function ProductCanvas(): React.JSX.Element {
  const frame = useToolcraftProductSceneFrame();
  const values = useToolcraftEvaluatedValues();
  const mediaAssets = useToolcraftSelector(selectMediaAssets, mediaAssetsEqual);
  const presentationUrls = useToolcraftMediaPresentationUrls(mediaAssets);
  const timeline = useToolcraftSelector(selectTimeline, timelineEqual);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rasterCacheRef = React.useRef<{
    key: string;
    raster: SourceRaster | null;
  } | null>(null);
  const gridCacheRef = React.useRef<{
    cols: number;
    grid: SourceGrid;
    raster: SourceRaster;
    rows: number;
  } | null>(null);
  const [sourceRevision, setSourceRevision] = React.useState(0);
  const [fontRevision, setFontRevision] = React.useState(0);

  const settings = React.useMemo(() => readEngineSettings(values), [values]);
  const sourceTarget = React.useMemo(
    () =>
      settings.sourceKind === "image"
        ? engineTargets.sourceImage
        : settings.sourceKind === "svg"
          ? engineTargets.sourceSvg
          : settings.sourceKind === "video"
            ? engineTargets.sourceVideo
            : null,
    [settings.sourceKind],
  );
  const sourceAsset = React.useMemo(
    () => findSourceAsset(mediaAssets, sourceTarget),
    [mediaAssets, sourceTarget],
  );
  const sourceUrl = sourceAsset ? presentationUrls.get(sourceAsset.id) : undefined;

  const renderScale =
    typeof values["canvas.renderScale"] === "number"
      ? (values["canvas.renderScale"] as number)
      : 1;

  React.useEffect(() => {
    releaseSources(mediaAssets.map((asset) => asset.id));
  }, [mediaAssets]);

  // Decoding is a retained source-scope pass; a settled decode triggers one redraw.
  React.useEffect(() => {
    if (!sourceAsset || !sourceUrl) return;
    let active = true;

    if (settings.sourceKind === "video") {
      registerFootage(sourceAsset.id, sourceUrl);
      void seekFootage(sourceAsset.id, 0).then(() => {
        if (active) setSourceRevision((revision) => revision + 1);
      });
    } else {
      void loadStillSource(sourceAsset.id, sourceUrl).then(() => {
        if (active) setSourceRevision((revision) => revision + 1);
      });
    }

    return () => {
      active = false;
    };
  }, [settings.sourceKind, sourceAsset, sourceUrl]);

  // The wordmark re-rasterizes when its face lands; the caption only redraws.
  useFontArrival(settings.type, settings.sourceKind === "text", () =>
    setSourceRevision((revision) => revision + 1),
  );
  useFontArrival(
    settings.caption.type,
    settings.caption.enabled && settings.caption.text.trim().length > 0,
    () => setFontRevision((revision) => revision + 1),
  );

  const liveProgress =
    timeline.durationSeconds > 0
      ? (((timeline.currentTimeSeconds % timeline.durationSeconds) +
          timeline.durationSeconds) %
          timeline.durationSeconds) /
        timeline.durationSeconds
      : 0;

  // Pan, zoom and pinch hold the current frame instead of redrawing the loop
  // under the gesture; playback state itself is untouched and resumes after.
  const viewportActive = useToolcraftViewportInteractionActive();
  const heldProgressRef = React.useRef(liveProgress);
  if (!viewportActive) heldProgressRef.current = liveProgress;
  const loopProgress = viewportActive ? heldProgressRef.current : liveProgress;

  // Footage follows the playhead so preview and exported frames agree.
  React.useEffect(() => {
    if (settings.sourceKind !== "video" || !sourceAsset) return;
    let active = true;
    void seekFootage(
      sourceAsset.id,
      loopProgress * Math.max(timeline.durationSeconds, 0),
    ).then(() => {
      if (active) setSourceRevision((revision) => revision + 1);
    });
    return () => {
      active = false;
    };
  }, [loopProgress, settings.sourceKind, sourceAsset, timeline.durationSeconds]);

  const rect = frame.kind === "ready" ? frame.rect : null;
  const width = rect?.width ?? 0;
  const height = rect?.height ?? 0;

  // Decode only when the source or its frame changes. Cell size is not part of
  // this key: every grid density is averaged out of the same raster.
  const samplingKey = `${settings.sourceKind}|${sourceAsset?.id ?? ""}|${Math.round(width)}x${Math.round(height)}|${settings.text}|${JSON.stringify(settings.type)}|${sourceRevision}`;

  /** The decoded raster, re-read only when `samplingKey` changes. */
  const currentRaster = (): SourceRaster | null => {
    if (width < 1 || height < 1) return null;
    const cached = rasterCacheRef.current;
    if (cached && cached.key === samplingKey) return cached.raster;
    const raster = peekSourceRaster({
      assetId: sourceAsset?.id ?? null,
      frameHeight: height,
      frameWidth: width,
      settings,
      timeSeconds: 0,
    });
    rasterCacheRef.current = { key: samplingKey, raster };
    return raster;
  };

  /** The grid for the current cell size, rebuilt only when either changes. */
  const currentGrid = (): SourceGrid | null => {
    const raster = currentRaster();
    if (!raster) return null;
    const shape = resolveGridShape(settings, width, height);
    const cached = gridCacheRef.current;
    if (
      cached &&
      cached.raster === raster &&
      cached.cols === shape.cols &&
      cached.rows === shape.rows
    ) {
      return cached.grid;
    }
    const grid = gridFromRaster(raster, shape.cols, shape.rows);
    gridCacheRef.current = { cols: shape.cols, grid, raster, rows: shape.rows };
    return grid;
  };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 1 || height < 1) return;

    const ratio = (globalThis.devicePixelRatio || 1) * Math.max(1, renderScale);
    const backingWidth = Math.max(1, Math.round(width * ratio));
    const backingHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(backingWidth / width, backingHeight / height);

    renderSyntaxErrorFrame({
      context,
      frame: { height, width, x: 0, y: 0 },
      grid: currentGrid(),
      progress: loopProgress,
      settings,
    });
    renderEditorOverlays({
      context,
      frame: { height, width, x: 0, y: 0 },
      settings,
    });
  }, [
    fontRevision,
    height,
    loopProgress,
    renderScale,
    samplingKey,
    settings,
    width,
  ]);

  if (!rect) return <></>;

  return (
    <canvas
      className={styles.surface}
      data-toolcraft-product-output=""
      data-testid="syntax-error-output"
      ref={canvasRef}
    />
  );
}
