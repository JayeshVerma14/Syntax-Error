/**
 * Turns the selected source into one decoded raster. Preview peeks at
 * whatever is already decoded; export awaits the decode so an artifact is
 * never blank. The raster does not depend on cell size: the grid for any
 * density is box-averaged out of it by `gridFromRaster`.
 */

import { waitForFont } from "./engine-fonts";
import { peekFootage, seekFootage } from "./engine-footage";
import type { EngineSettings } from "./engine-settings";
import {
  awaitStillSource,
  peekStillSource,
  rasterizeDrawable,
  rasterizeFootage,
  rasterizeWordmark,
  type SourceRaster,
} from "./engine-source";

/** How long an export waits for a freshly chosen typeface before rasterizing. */
const EXPORT_FONT_WAIT_MS = 3000;

export type SourceAssetLike = Readonly<{
  assetKind: string;
  id: string;
  lifecycle?: string;
  sourceTarget?: string;
}>;

/** The attached asset that owns the active source kind, when it is ready. */
export function findSourceAsset(
  assets: readonly SourceAssetLike[],
  target: string | null,
): SourceAssetLike | undefined {
  if (!target) return undefined;
  return assets.find(
    (asset) => asset.sourceTarget === target && asset.lifecycle === "ready",
  );
}

type RasterRequest = Readonly<{
  assetId: string | null;
  frameHeight: number;
  frameWidth: number;
  settings: EngineSettings;
  timeSeconds: number;
}>;

/** Synchronous path for live preview. Returns null until a decode settles. */
export function peekSourceRaster(request: RasterRequest): SourceRaster | null {
  const { settings } = request;
  if (settings.sourceKind === "text") {
    return rasterizeWordmark(
      settings.text,
      settings.type,
      request.frameWidth,
      request.frameHeight,
    );
  }
  if (!request.assetId) return null;
  if (settings.sourceKind === "video") {
    const element = peekFootage(request.assetId);
    return element
      ? rasterizeFootage(element, request.frameWidth, request.frameHeight)
      : null;
  }
  const drawable = peekStillSource(request.assetId);
  return drawable
    ? rasterizeDrawable(drawable, request.frameWidth, request.frameHeight)
    : null;
}

/** Awaiting path for artifact export and video frame scheduling. */
export async function resolveSourceRaster(
  request: RasterRequest,
): Promise<SourceRaster | null> {
  const { settings } = request;
  if (settings.sourceKind === "text") {
    await waitForFont(settings.type, EXPORT_FONT_WAIT_MS);
    return rasterizeWordmark(
      settings.text,
      settings.type,
      request.frameWidth,
      request.frameHeight,
    );
  }
  if (!request.assetId) return null;
  if (settings.sourceKind === "video") {
    const element = await seekFootage(request.assetId, request.timeSeconds);
    return element
      ? rasterizeFootage(element, request.frameWidth, request.frameHeight)
      : null;
  }
  const drawable = await awaitStillSource(request.assetId);
  return drawable
    ? rasterizeDrawable(drawable, request.frameWidth, request.frameHeight)
    : null;
}
