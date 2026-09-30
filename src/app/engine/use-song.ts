"use client";

/**
 * The uploaded song, decoded and analysed once per file. Returns null until
 * the analysis is ready, while Audio reactive is off, or with no song.
 */

import * as React from "react";

import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";

import { audioTargets } from "./engine-audio";
import { loadSong, peekSong, releaseSongs, type Song } from "./engine-audio-io";
import { findSourceAsset } from "./engine-grid";

export function useSong(
  mediaAssets: readonly ToolcraftMediaAsset[],
  presentationUrls: ReadonlyMap<string, string>,
  enabled: boolean,
): Song | null {
  const [revision, setRevision] = React.useState(0);
  const asset = React.useMemo(
    () => (enabled ? findSourceAsset(mediaAssets, audioTargets.file) : undefined),
    [enabled, mediaAssets],
  );
  const url = asset ? presentationUrls.get(asset.id) : undefined;

  React.useEffect(() => {
    releaseSongs(new Set(mediaAssets.map((item) => item.id)));
  }, [mediaAssets]);

  React.useEffect(() => {
    if (!asset || !url) return;
    let active = true;
    void loadSong(asset.id, url).then(() => {
      if (active) setRevision((value) => value + 1);
    });
    return () => {
      active = false;
    };
  }, [asset, url]);

  // `revision` re-reads the cache once a decode settles.
  return React.useMemo(
    () => (asset && url && revision >= 0 ? peekSong(asset.id) : null),
    [asset, url, revision],
  );
}
