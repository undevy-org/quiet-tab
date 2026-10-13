// Chrome's `_favicon` endpoint answers HTTP 200 with a grey default globe for a page it has no icon for, so the
// image `error` event never fires. This module tells that globe apart from a real icon by exact pixel comparison
// with ONE sentinel image from the same endpoint (docs/favicon-globe-fallback.md). Pure logic plus injected I/O:
// no document/window access here, the page passes `loadImage`, `createCanvas` and the timer pair.

export const DEFAULT_FAVICON_TIMEOUT_MS = 2000;
export const DEFAULT_FAVICON_SENTINEL_PAGE = "https://quiet-tab-no-favicon.invalid/";

export function isDefaultFaviconPixels(candidate, sentinel) {
  if (!candidate || !sentinel) return false;
  const length = candidate.length;
  if (!(length > 0) || sentinel.length !== length) return false;
  for (let i = 0; i < length; i += 1) {
    if (candidate[i] !== sentinel[i]) return false;
  }
  return true;
}

function validSize(image) {
  return image && image.naturalWidth > 0 && image.naturalHeight > 0;
}

// options: sentinelUrl, loadImage(url) -> Promise<image>, createCanvas(w, h), timeoutMs, setTimer, clearTimer.
// check(url, image) / classifyImage(url, image) -> Promise<"default" | "real" | "unknown">; never rejects.
export function createDefaultFaviconChecker({
  sentinelUrl,
  loadImage,
  createCanvas,
  timeoutMs = DEFAULT_FAVICON_TIMEOUT_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id)
}) {
  const verdicts = new Map();
  let canvas = null;
  let ready = null;
  let sentinel = null;
  let failed = false;

  function readPixels(image) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!canvas) canvas = createCanvas(1, 1);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
  }

  // The sentinel is requested on the first call, the one timeout starts at that request; success, failure and the
  // timeout settle the same promise once, so a late sentinel answer changes nothing.
  function ensureReady() {
    if (ready) return ready;
    ready = new Promise((resolve) => {
      let settled = false;
      let timer;
      const settle = (ok) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimer(timer);
        if (!ok) failed = true;
        resolve(ok);
      };
      timer = setTimer(() => settle(false), timeoutMs);
      try {
        Promise.resolve(loadImage(sentinelUrl)).then(
          (image) => {
            if (settled) return;
            try {
              if (!validSize(image)) throw new Error("Sentinel has no size");
              sentinel = { width: image.naturalWidth, height: image.naturalHeight, bytes: readPixels(image) };
              settle(true);
            } catch {
              settle(false);
            }
          },
          () => settle(false)
        );
      } catch {
        settle(false);
      }
    });
    return ready;
  }

  async function classify(url, image) {
    const known = verdicts.get(url);
    if (known) return known;
    if (failed) return "unknown";
    const ok = await ensureReady();
    if (!ok || failed) return "unknown";
    const again = verdicts.get(url);
    if (again) return again;
    if (!validSize(image)) return "unknown";
    let verdict;
    try {
      if (image.naturalWidth !== sentinel.width || image.naturalHeight !== sentinel.height) {
        verdict = "real";
      } else {
        verdict = isDefaultFaviconPixels(readPixels(image), sentinel.bytes) ? "default" : "real";
      }
    } catch {
      return "unknown";
    }
    verdicts.set(url, verdict);
    return verdict;
  }

  return {
    check: classify,
    classifyImage: classify,
    verdictFor: (url) => verdicts.get(url),
    get failed() {
      return failed;
    }
  };
}
