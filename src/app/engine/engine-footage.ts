/**
 * Footage decoding. This is the one module that owns a media element: the
 * runtime offers product code no video-frame source, and its video codec
 * library is reserved for artifact export, so a hidden element decoded by the
 * browser is the only frame-accurate path to a footage frame. Everything
 * outside this module sees footage only as a drawable frame.
 */

const videos = new Map<string, { element: HTMLVideoElement; url: string }>();

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

/**
 * Seeks footage to one timeline time and resolves once that frame is painted.
 * Export needs the exact frame, so this awaits `seeked` rather than sampling
 * whatever the element happens to be showing, and a clip already parked on
 * the target waits for its frame data rather than resolving before it can be
 * drawn.
 */
export function seekFootage(
  resourceRef: string,
  timeSeconds: number,
): Promise<HTMLVideoElement | null> {
  const entry = videos.get(resourceRef);
  if (!entry) return Promise.resolve(null);
  const element = entry.element;
  return new Promise((resolve) => {
    const ready = () => {
      if (!Number.isFinite(element.duration) || element.duration <= 0) {
        resolve(element.readyState >= 2 ? element : null);
        return;
      }
      const target = Math.min(
        Math.max(timeSeconds % element.duration, 0),
        Math.max(element.duration - 1e-3, 0),
      );
      if (Math.abs(element.currentTime - target) < 1e-3) {
        if (element.readyState >= 2) {
          resolve(element);
          return;
        }
        const onData = () => {
          element.removeEventListener("loadeddata", onData);
          resolve(element);
        };
        element.addEventListener("loadeddata", onData);
        return;
      }
      const onSeeked = () => {
        element.removeEventListener("seeked", onSeeked);
        resolve(element);
      };
      element.addEventListener("seeked", onSeeked);
      element.currentTime = target;
    };
    if (element.readyState >= 1) {
      ready();
      return;
    }
    const onMeta = () => {
      element.removeEventListener("loadedmetadata", onMeta);
      element.removeEventListener("error", onError);
      ready();
    };
    const onError = () => {
      element.removeEventListener("loadedmetadata", onMeta);
      element.removeEventListener("error", onError);
      resolve(null);
    };
    element.addEventListener("loadedmetadata", onMeta);
    element.addEventListener("error", onError);
  });
}

/** Drops elements for footage assets that are no longer attached. */
export function releaseFootage(active: ReadonlySet<string>): void {
  for (const key of [...videos.keys()]) {
    if (!active.has(key)) {
      videos.get(key)?.element.removeAttribute("src");
      videos.delete(key);
    }
  }
}
