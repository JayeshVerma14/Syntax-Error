import type { ToolcraftVideoExportFormat } from "./artifact-export-settings";
import { ToolcraftArtifactExportError } from "./export-error";

/*
 * Syntax Error override — high-quality video export.
 *
 * Stock Toolcraft targeted 0.05 bits per pixel per frame, clamped to
 * 2–12 Mbps, and refused any file projected over 96 MB. Dense moving glyphs
 * and hard-edged marks turn to blocks at those rates (a 1080 by 1080 export
 * got 2 Mbps). This targets 0.25 bits per pixel, between 16 and 80 Mbps, and
 * raises the ceiling to 512 MB. A long export that would exceed the ceiling
 * is fitted under it by lowering the rate instead of failing.
 */
export const TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES = 512 * 1024 * 1024;

const VIDEO_BITS_PER_PIXEL = 0.25;
const MIN_VIDEO_BITRATE = 16_000_000;
const MAX_VIDEO_BITRATE = 80_000_000;
/** Below this, a fitted export would look worse than refusing it. */
const MIN_FITTED_VIDEO_BITRATE = 2_000_000;

export type ToolcraftVideoCodec = "avc" | "vp8" | "vp9";

export type ToolcraftVideoEncodingSupport = Readonly<{
  avc: boolean;
  vp8: boolean;
  vp9: boolean;
}>;

export type ToolcraftVideoEncodingPolicy = Readonly<{
  bitrate: number;
  codec: ToolcraftVideoCodec;
  extension: ".mp4" | ".webm";
  mediaType: "video/mp4" | "video/webm";
}>;

type ToolcraftVideoEncodingCandidate = Readonly<{
  codec: ToolcraftVideoCodec;
  extension: ".mp4" | ".webm";
  mediaType: "video/mp4" | "video/webm";
}>;

const mp4Candidate: ToolcraftVideoEncodingCandidate = Object.freeze({
  codec: "avc",
  extension: ".mp4",
  mediaType: "video/mp4",
});
const webmCandidates: readonly ToolcraftVideoEncodingCandidate[] = Object.freeze([
  Object.freeze({ codec: "vp9", extension: ".webm", mediaType: "video/webm" }),
  Object.freeze({ codec: "vp8", extension: ".webm", mediaType: "video/webm" }),
]);

export function getToolcraftVideoExportBitrate(
  width: number,
  height: number,
): number {
  return Math.max(
    MIN_VIDEO_BITRATE,
    Math.min(MAX_VIDEO_BITRATE, Math.round(width * height * 30 * VIDEO_BITS_PER_PIXEL)),
  );
}

/** The quality target for one export, fitted under the artifact ceiling. */
export function resolveToolcraftVideoTargetBitrate(
  width: number,
  height: number,
  durationSeconds: number,
): number {
  const fitting = Math.floor(
    (TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES * 8) / (Math.max(durationSeconds, 1e-3) * 1.1),
  );
  const bitrate = Math.min(getToolcraftVideoExportBitrate(width, height), fitting);
  if (bitrate < MIN_FITTED_VIDEO_BITRATE) {
    throw new ToolcraftArtifactExportError({
      code: "video-artifact-too-large",
      message: "The selected video export exceeds Toolcraft's artifact limit.",
    });
  }
  return bitrate;
}

export function resolveToolcraftVideoEncodingPolicy({
  bitrate,
  durationSeconds,
  height,
  requestedFormat,
  support,
  width,
}: Readonly<{
  /** A rate the encoder was probed at; defaults to the quality target. */
  bitrate?: number;
  durationSeconds: number;
  height: number;
  requestedFormat: ToolcraftVideoExportFormat;
  support: ToolcraftVideoEncodingSupport;
  width: number;
}>): ToolcraftVideoEncodingPolicy {
  const chosenBitrate =
    bitrate ?? resolveToolcraftVideoTargetBitrate(width, height, durationSeconds);
  const candidates =
    requestedFormat === "mp4"
      ? [mp4Candidate, ...webmCandidates]
      : [...webmCandidates, mp4Candidate];
  const candidate = candidates.find((item) => support[item.codec]);

  if (!candidate) {
    throw new ToolcraftArtifactExportError({
      code: "video-encoder-unavailable",
      message: "This browser has no supported timestamped video encoder.",
    });
  }

  return Object.freeze({ ...candidate, bitrate: chosenBitrate });
}
