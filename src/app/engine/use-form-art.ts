"use client";

/**
 * The Image form picture, decoded once and sampled onto its glyph grid for
 * the current frame size. Undefined while the layer is off, has no upload or
 * is still loading.
 */

import * as React from "react";

import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";

import { formTargets, prepareFormGrid, type FormGrid, type FormSettings } from "./engine-form";
import { findSourceAsset } from "./engine-grid";
import { loadStillSource, peekStillSource } from "./engine-source";

export function useFormArt(
  mediaAssets: readonly ToolcraftMediaAsset[],
  presentationUrls: ReadonlyMap<string, string>,
  form: FormSettings,
  frameWidth: number,
  frameHeight: number,
): FormGrid | undefined {
  const [revision, setRevision] = React.useState(0);
  const asset = React.useMemo(
    () => (form.enabled ? findSourceAsset(mediaAssets, formTargets.file) : undefined),
    [form.enabled, mediaAssets],
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
    return prepareFormGrid(asset.id, image, form, frameWidth, frameHeight) ?? undefined;
  }, [asset, url, revision, form, frameWidth, frameHeight]);
}
