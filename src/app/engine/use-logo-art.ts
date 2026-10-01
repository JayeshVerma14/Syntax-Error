"use client";

/**
 * The uploaded logo, decoded once and prepared as blocks for the current
 * frame size. Undefined while the logo is off, not uploaded or still loading.
 */

import * as React from "react";

import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";

import { findSourceAsset } from "./engine-grid";
import { logoTargets, type LogoSettings } from "./engine-logo";
import { prepareLogoFrame } from "./engine-logo-art";
import type { LogoFrame } from "./engine-render";
import { loadStillSource, peekStillSource } from "./engine-source";

export function useLogoArt(
  mediaAssets: readonly ToolcraftMediaAsset[],
  presentationUrls: ReadonlyMap<string, string>,
  logo: LogoSettings,
  frameWidth: number,
  frameHeight: number,
): LogoFrame | undefined {
  const [revision, setRevision] = React.useState(0);
  const asset = React.useMemo(
    () => (logo.enabled ? findSourceAsset(mediaAssets, logoTargets.file) : undefined),
    [logo.enabled, mediaAssets],
  );
  const url = asset ? presentationUrls.get(asset.id) : undefined;

  React.useEffect(() => {
    if (!asset || !url) return;
    let active = true;
    void loadStillSource(asset.id, url).then(() => {
      if (active) setRevision((value) => value + 1);
    });
    return () => {
      active = false;
    };
  }, [asset, url]);

  return React.useMemo(() => {
    if (!asset || !url || revision < 0 || frameWidth < 1 || frameHeight < 1) return undefined;
    const image = peekStillSource(asset.id);
    if (!image) return undefined;
    return prepareLogoFrame(asset.id, image, logo, frameWidth, frameHeight) ?? undefined;
  }, [asset, url, revision, logo, frameWidth, frameHeight]);
}
