import type { ToolcraftVideoExportFormat } from "./artifact-export-settings";
import { ToolcraftArtifactExportError } from "./export-error";
import {
  TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES,
  resolveToolcraftVideoEncodingPolicy,
  resolveToolcraftVideoTargetBitrate,
  type ToolcraftVideoCodec,
} from "./video-encoding-policy";

export type ToolcraftVideoEncoderBackend = Readonly<{
  addFrame: (
    timeSeconds: number,
    durationSeconds: number,
    keyFrame: boolean,
  ) => Promise<void>;
  cancel: () => Promise<void>;
  extension: ".mp4" | ".webm";
  finalize: () => Promise<Blob>;
  mediaType: "video/mp4" | "video/webm";
}>;

export type ToolcraftVideoEncoderBackendFactoryRequest = Readonly<{
  /** Syntax Error override: a soundtrack to mux beside the frames. */
  audio?: AudioBuffer | null;
  canvas: HTMLCanvasElement;
  durationSeconds: number;
  height: number;
  requestedFormat: ToolcraftVideoExportFormat;
  signal: AbortSignal;
  width: number;
}>;

export type ToolcraftVideoEncoderBackendFactory = (
  request: ToolcraftVideoEncoderBackendFactoryRequest,
) => Promise<ToolcraftVideoEncoderBackend>;

export async function createToolcraftVideoEncoderBackend(
  request: ToolcraftVideoEncoderBackendFactoryRequest,
): Promise<ToolcraftVideoEncoderBackend> {
  request.signal.throwIfAborted();
  const mediabunny = await import("mediabunny");
  request.signal.throwIfAborted();
  const codecs: readonly ToolcraftVideoCodec[] = ["avc", "vp9", "vp8"];
  // Syntax Error override — high-quality video export: probe at the quality
  // target, and step the rate down only if the requested format's codec
  // refuses it, so a very high rate never silently switches the container.
  const targetBitrate = resolveToolcraftVideoTargetBitrate(
    request.width,
    request.height,
    request.durationSeconds,
    request.requestedFormat,
  );
  const preferredCodec = request.requestedFormat === "mp4" ? 0 : 1;
  const rates = [targetBitrate, 96_000_000, 64_000_000, 40_000_000, 24_000_000, 12_000_000].filter(
    (rate, index) => index === 0 || rate < targetBitrate,
  );
  let bitrate = targetBitrate;
  let supportResults: readonly boolean[] = [];
  for (const rate of rates) {
    bitrate = rate;
    supportResults = await Promise.all(
      codecs.map((codec) =>
        mediabunny.canEncodeVideo(codec, {
          bitrate: rate,
          height: request.height,
          width: request.width,
        }),
      ),
    );
    request.signal.throwIfAborted();
    if (supportResults[preferredCodec] === true) break;
  }
  const policy = resolveToolcraftVideoEncodingPolicy({
    bitrate,
    durationSeconds: request.durationSeconds,
    height: request.height,
    requestedFormat: request.requestedFormat,
    support: {
      avc: supportResults[0] === true,
      vp8: supportResults[2] === true,
      vp9: supportResults[1] === true,
    },
    width: request.width,
  });
  const format =
    policy.mediaType === "video/mp4"
      ? new mediabunny.Mp4OutputFormat()
      : new mediabunny.WebMOutputFormat();
  const target = new mediabunny.BufferTarget();
  let overflowError: ToolcraftArtifactExportError | null = null;
  target.on("write", ({ end }) => {
    if (end > TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES && !overflowError) {
      overflowError = new ToolcraftArtifactExportError({
        code: "video-artifact-too-large",
        message: "The encoded video exceeds Toolcraft's artifact limit.",
      });
    }
  });
  const output = new mediabunny.Output({ format, target });
  let source: InstanceType<typeof mediabunny.CanvasSource>;
  try {
    source = new mediabunny.CanvasSource(request.canvas, {
      bitrate: policy.bitrate,
      codec: policy.codec,
      // WebM keeps its alpha channel, so Background off exports a
      // transparent video; MP4's codec has no alpha, so it is dropped there.
      alpha: policy.mediaType === "video/webm" ? "keep" : "discard",
      // Hard-edged marks and glyphs: ask the encoder to keep detail.
      contentHint: "detail",
      keyFrameInterval: 2,
      latencyMode: "quality",
    });
    output.addVideoTrack(source, { frameRate: 30 });
    // Syntax Error override: the soundtrack, in the first codec this
    // container carries that the browser can encode (AAC or Opus in MP4,
    // Opus in WebM).
    let soundtrack: InstanceType<typeof mediabunny.AudioBufferSource> | null = null;
    const audio = request.audio ?? null;
    if (audio) {
      const containerCodecs = format.getSupportedAudioCodecs();
      let audioCodec: (typeof containerCodecs)[number] | null = null;
      for (const candidate of ["aac", "opus"] as const) {
        if (!containerCodecs.includes(candidate)) continue;
        if (
          await mediabunny.canEncodeAudio(candidate, {
            bitrate: 192_000,
            numberOfChannels: audio.numberOfChannels,
            sampleRate: audio.sampleRate,
          })
        ) {
          audioCodec = candidate;
          break;
        }
      }
      if (audioCodec) {
        soundtrack = new mediabunny.AudioBufferSource({ bitrate: 192_000, codec: audioCodec });
        output.addAudioTrack(soundtrack);
      }
    }
    await output.start();
    request.signal.throwIfAborted();
    if (soundtrack && audio) {
      await soundtrack.add(audio);
      soundtrack.close();
    }
  } catch (error) {
    try {
      // Output owns connected sources and can cancel even before start completed.
      await output.cancel();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Video startup and cleanup failed.", { cause: error });
    }
    throw error;
  }
  let closed = false;
  let finalized = false;
  let cancellation: Promise<void> | undefined;

  function closeSource(): void {
    if (!closed) {
      closed = true;
      source.close();
    }
  }

  return Object.freeze({
    addFrame: async (timeSeconds, durationSeconds, keyFrame) => {
      request.signal.throwIfAborted();
      await source.add(timeSeconds, durationSeconds, { keyFrame });
      if (overflowError) throw overflowError;
      request.signal.throwIfAborted();
    },
    cancel: () => {
      // Output.cancel force-closes its tracks; a second caller must await the same cleanup.
      cancellation ??= finalized
        ? Promise.resolve()
        : Promise.resolve().then(() => output.cancel());
      return cancellation;
    },
    extension: policy.extension,
    finalize: async () => {
      request.signal.throwIfAborted();
      closeSource();
      await output.finalize();
      finalized = true;
      if (overflowError) throw overflowError;
      request.signal.throwIfAborted();
      if (!target.buffer) {
        throw new ToolcraftArtifactExportError({
          code: "video-encode-failed",
          message: "Toolcraft video encoding produced no artifact.",
        });
      }
      if (target.buffer.byteLength > TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES) {
        throw new ToolcraftArtifactExportError({
          code: "video-artifact-too-large",
          message: "The encoded video exceeds Toolcraft's artifact limit.",
        });
      }
      return new Blob([target.buffer], { type: policy.mediaType });
    },
    mediaType: policy.mediaType,
  });
}
