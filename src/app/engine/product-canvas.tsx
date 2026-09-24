"use client";

import * as React from "react";

import type { ToolcraftMediaAsset, ToolcraftState } from "@/toolcraft/runtime";
import {
  useToolcraftDispatch,
  useToolcraftEvaluatedValues,
  useToolcraftMediaPresentationUrls,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
  useToolcraftViewportInteractionActive,
} from "@/toolcraft/runtime/react";

import { unprojectPoint } from "./engine-camera";
import { applyStroke, cellLine, type EditLayer } from "./engine-edit";
import { registerFootage, seekFootage } from "./engine-footage";
import { findSourceAsset, peekSourceRaster } from "./engine-grid";
import {
  renderEditorOverlays,
  renderSyntaxErrorFrame,
  resolveGridShape,
} from "./engine-render";
import { engineTargets, readEngineSettings } from "./engine-settings";
import {
  gridFromRaster,
  isWordmarkFontReady,
  loadStillSource,
  releaseSources,
  type SourceGrid,
  type SourceRaster,
  waitForWordmarkFont,
} from "./engine-source";
import styles from "./product-canvas.module.css";

type TimelineSlice = Readonly<{
  currentTimeSeconds: number;
  durationSeconds: number;
}>;

type Cell = readonly [number, number];

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

export function ProductCanvas(): React.JSX.Element {
  const frame = useToolcraftProductSceneFrame();
  const values = useToolcraftEvaluatedValues();
  const dispatch = useToolcraftDispatch();
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
  // Transient stroke state: committed to runtime once, on pointer release.
  const strokeRef = React.useRef<{ layer: EditLayer; points: Cell[] } | null>(null);
  const lastCellRef = React.useRef<Cell | null>(null);
  const [sourceRevision, setSourceRevision] = React.useState(0);
  const [strokeRevision, setStrokeRevision] = React.useState(0);

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

  // A newly chosen typeface finishes loading after the wordmark first
  // rasterizes; redraw once it lands so the sheet never keeps the fallback.
  React.useEffect(() => {
    if (settings.sourceKind !== "text" || isWordmarkFontReady(settings.type)) {
      return;
    }
    let active = true;
    void waitForWordmarkFont(settings.type, FONT_WAIT_MS, () => active).then(
      (ready) => {
        if (active && ready) setSourceRevision((revision) => revision + 1);
      },
    );
    return () => {
      active = false;
    };
  }, [settings.sourceKind, settings.type]);

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

  /** Canvas pixel position → grid cell. */
  const cellAt = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): Cell | null => {
      const canvas = canvasRef.current;
      if (!canvas || width < 1 || height < 1) return null;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return null;
      const shape = resolveGridShape(settings, width, height);
      const frameX = ((event.clientX - bounds.left) / bounds.width) * width;
      const frameY = ((event.clientY - bounds.top) / bounds.height) * height;
      // In 3D view the pointer is cast onto the tilted sheet, so a stroke lands
      // on the cell the user sees rather than the one under the flat grid.
      const plane = unprojectPoint(settings.camera, width, height, frameX, frameY);
      if (!plane) return null;
      const column = Math.floor((plane.x / width) * shape.cols);
      const row = Math.floor((plane.y / height) * shape.rows);
      if (column < 0 || row < 0 || column >= shape.cols || row >= shape.rows) {
        return null;
      }
      return [column, row];
    },
    [height, settings, width],
  );

  const paint = React.useCallback(
    (points: readonly Cell[]) => {
      const shape = resolveGridShape(settings, width, height);
      const current = strokeRef.current;
      if (!current) return;
      current.points.push(...points);
      current.layer = applyStroke({
        color: settings.drawColor,
        cols: shape.cols,
        erase: settings.brush === "erase",
        layer: current.layer,
        points,
        rows: shape.rows,
        size: settings.brushSize,
      });
      setStrokeRevision((revision) => revision + 1);
    },
    [height, settings, width],
  );

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      // Space-drag belongs to canvas panning, and modified presses stay unclaimed.
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const cell = cellAt(event);
      if (!cell) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      strokeRef.current = { layer: settings.edit, points: [] };

      const previous = lastCellRef.current;
      // Shift extends from the last painted cell, matching the reference's
      // straight-line shortcut.
      const points =
        event.shiftKey && previous
          ? cellLine(previous[0], previous[1], cell[0], cell[1])
          : [cell];
      paint(points);
      lastCellRef.current = cell;
    },
    [cellAt, paint, settings.edit],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!strokeRef.current) return;
      const cell = cellAt(event);
      if (!cell) return;
      const previous = lastCellRef.current;
      const points =
        previous && (previous[0] !== cell[0] || previous[1] !== cell[1])
          ? cellLine(previous[0], previous[1], cell[0], cell[1])
          : [cell];
      paint(points);
      lastCellRef.current = cell;
    },
    [cellAt, paint],
  );

  // Recreated per render rather than memoized: it only runs on release, and
  // the runtime dispatch it closes over is stable.
  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || stroke.points.length === 0) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // One stroke is one undoable command.
    dispatch({
      target: engineTargets.editCells,
      type: "controls.setValue",
      value: stroke.layer,
    });
    setStrokeRevision((revision) => revision + 1);
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

    // An in-progress stroke previews from transient state; the committed value
    // is identical once the pointer releases.
    const live = strokeRef.current;
    const drawSettings = live ? { ...settings, edit: live.layer } : settings;

    renderSyntaxErrorFrame({
      context,
      frame: { height, width, x: 0, y: 0 },
      grid: currentGrid(),
      progress: loopProgress,
      settings: drawSettings,
    });
    renderEditorOverlays({
      context,
      frame: { height, width, x: 0, y: 0 },
      settings: drawSettings,
    });
  }, [
    height,
    loopProgress,
    renderScale,
    samplingKey,
    settings,
    strokeRevision,
    width,
  ]);

  if (!rect) return <></>;

  return (
    <canvas
      className={styles.surface}
      data-toolcraft-canvas-handle="cell-paint"
      data-toolcraft-product-output=""
      data-testid="syntax-error-output"
      onPointerCancel={endStroke}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      ref={canvasRef}
    />
  );
}
