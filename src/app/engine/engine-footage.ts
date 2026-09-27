/**
 * Footage decoding. This is the one module that owns a media element: the
 * runtime offers product code no video-frame source, and its video codec
 * library is reserved for artifact export, so a hidden element decoded by the
 * browser is the only frame-accurate path to a footage frame. Everything
 * outside this module sees footage only as a drawable frame.
 *
 * Two access modes share the element. Live playback lets the browser decode
 * in real time (`playFootage`) and reports each presented frame through
 * `onFootageFrame`, because seeking a media element once per animation tick
 * forces a keyframe decode per frame and stalls the preview. Scrubbing and
 * export use `seekFootage`, which parks the element on one exact frame;
 * concurrent seek requests coalesce so only the latest target is decoded.
 */

type FootageEntry = {
  element: HTMLVideoElement;
  /** When an exact-frame seek was last requested; live playback yields to it. */
  heldAt?: number;
  /** In-flight seek: the newest requested target and everyone waiting on it. */
  seek?: { resolvers: Array<(element: HTMLVideoElement) => void>; target: number };
  url: string;
};

const videos = new Map<string, FootageEntry>();

/** How far live playback may drift from the timeline before it is re-synced. */
const DRIFT_TOLERANCE_S = 0.25;

/**
 * How long after an exact-frame seek live playback stays parked. Export seeks
 * frame after frame, so this keeps the preview from restarting the element
 * between artifact frames; once seeks stop, playback resumes on the next tick.
 */
const EXACT_FRAME_HOLD_MS = 250;

/** Keeps one hidden video element per footage asset for frame-accurate seeks. */
export function registerFootage(
  resourceRef: string,
  url: string,
): HTMLVideoElement {
  const existing = videos.get(resourceRef);
  if (existing && existing.url === url) return existing.element;
  const element = document.createElement("video");
  element.crossOrigin = "anonymous";
  element.muted = true;
  element.loop = true;
  element.playsInline = true;
  element.preload = "auto";
  element.src = url;
  videos.set(resourceRef, { element, url });
  return element;
}

export function peekFootage(resourceRef: string): HTMLVideoElement | null {
  const entry = videos.get(resourceRef);
  if (!entry) return null;
  return entry.element.readyState >= 2 ? entry.element : null;
}

function clampToClip(element: HTMLVideoElement, timeSeconds: number): number {
  return Math.min(
    Math.max(timeSeconds % element.duration, 0),
    Math.max(element.duration - 1e-3, 0),
  );
}

/**
 * Resolves once the element knows its duration, or null when it never will.
 * Metadata is the minimum both playback and seeking need.
 */
function awaitMetadata(element: HTMLVideoElement): Promise<HTMLVideoElement | null> {
  if (element.readyState >= 1) return Promise.resolve(element);
  return new Promise((resolve) => {
    const done = (result: HTMLVideoElement | null) => {
      element.removeEventListener("loadedmetadata", onMeta);
      element.removeEventListener("error", onError);
      resolve(result);
    };
    const onMeta = () => done(element);
    const onError = () => done(null);
    element.addEventListener("loadedmetadata", onMeta);
    element.addEventListener("error", onError);
  });
}

/**
 * Seeks footage to one timeline time and resolves once that frame is painted.
 * Export needs the exact frame, so this awaits `seeked` rather than sampling
 * whatever the element happens to be showing. While a seek is in flight, a
 * newer request only replaces the target: the element is never asked to decode
 * intermediate frames a scrub has already moved past. Seeking pauses live
 * playback; `playFootage` resumes it on the next playing tick.
 */
export function seekFootage(
  resourceRef: string,
  timeSeconds: number,
): Promise<HTMLVideoElement | null> {
  const entry = videos.get(resourceRef);
  if (!entry) return Promise.resolve(null);
  const element = entry.element;
  return awaitMetadata(element).then((ready) => {
    if (!ready) return null;
    if (!Number.isFinite(element.duration) || element.duration <= 0) {
      return element.readyState >= 2 ? element : null;
    }
    entry.heldAt = performance.now();
    if (!element.paused) element.pause();
    const target = clampToClip(element, timeSeconds);

    if (entry.seek) {
      entry.seek.target = target;
      return new Promise<HTMLVideoElement>((resolve) => {
        entry.seek?.resolvers.push(resolve);
      });
    }

    if (Math.abs(element.currentTime - target) < 1e-3 && !element.seeking) {
      if (element.readyState >= 2) return element;
      return new Promise<HTMLVideoElement>((resolve) => {
        const onData = () => {
          element.removeEventListener("loadeddata", onData);
          resolve(element);
        };
        element.addEventListener("loadeddata", onData);
      });
    }

    return new Promise<HTMLVideoElement>((resolve) => {
      const seek = { resolvers: [resolve], target };
      entry.seek = seek;
      const onSeeked = () => {
        // A newer target arrived mid-flight: chase it before settling anyone.
        if (Math.abs(element.currentTime - seek.target) >= 1e-3) {
          element.currentTime = seek.target;
          return;
        }
        element.removeEventListener("seeked", onSeeked);
        entry.seek = undefined;
        for (const settle of seek.resolvers) settle(element);
      };
      element.addEventListener("seeked", onSeeked);
      element.currentTime = target;
    });
  });
}

/**
 * Keeps footage playing in real time alongside the timeline. Idempotent and
 * cheap to call on every tick: it starts the element if it is parked and only
 * re-syncs `currentTime` when playback has drifted from the playhead, so the
 * browser decodes sequentially instead of seeking per frame.
 */
export function playFootage(resourceRef: string, timeSeconds: number): void {
  const entry = videos.get(resourceRef);
  if (!entry || entry.seek) return;
  if (
    entry.heldAt !== undefined &&
    performance.now() - entry.heldAt < EXACT_FRAME_HOLD_MS
  ) {
    return;
  }
  const element = entry.element;
  if (element.readyState < 1) {
    void awaitMetadata(element).then((ready) => {
      if (ready) playFootage(resourceRef, timeSeconds);
    });
    return;
  }
  if (!Number.isFinite(element.duration) || element.duration <= 0) return;
  const target = clampToClip(element, timeSeconds);
  const drift = Math.abs(element.currentTime - target);
  // Near the loop seam the wrapped distance is what matters.
  const wrapped = Math.min(drift, element.duration - drift);
  if (wrapped > DRIFT_TOLERANCE_S && !element.seeking) {
    element.currentTime = target;
  }
  if (element.paused) {
    void element.play().catch(() => {
      // Autoplay policy or a detached source; the paused frame still renders.
    });
  }
}

export function pauseFootage(resourceRef: string): void {
  const element = videos.get(resourceRef)?.element;
  if (element && !element.paused) element.pause();
}

/**
 * Calls back whenever the element has advanced to a new frame while playing,
 * so the preview re-samples footage at the clip's own cadence rather than on
 * every timeline tick. The element is never attached to the document, and
 * `requestVideoFrameCallback` only reports frames the page composites, so
 * this polls `currentTime` on animation frames instead. Returns the
 * unsubscribe function.
 */
export function onFootageFrame(
  resourceRef: string,
  callback: () => void,
): () => void {
  const element = videos.get(resourceRef)?.element;
  if (!element) return () => {};
  let active = true;
  let lastTime = -1;
  let frame = 0;
  const tick = () => {
    if (!active) return;
    if (element.currentTime !== lastTime && element.readyState >= 2) {
      lastTime = element.currentTime;
      callback();
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    active = false;
    cancelAnimationFrame(frame);
  };
}

/** Drops elements for footage assets that are no longer attached. */
export function releaseFootage(active: ReadonlySet<string>): void {
  for (const key of [...videos.keys()]) {
    if (!active.has(key)) {
      const element = videos.get(key)?.element;
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
      videos.delete(key);
    }
  }
}
