import { Texture } from "three";

/**
 * Loads an image as a three.js texture without decoding it on the main thread: the file is fetched (and can be aborted
 * when the user leaves), decoded by `createImageBitmap` off-thread and handed to the GPU as a bitmap. `flipY` is baked into
 * the bitmap (WebGL ignores the unpack-flip flag for bitmaps), so the result looks exactly like a `TextureLoader` texture.
 */
export async function loadBitmapTexture(url: string, signal?: AbortSignal): Promise<Texture> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const blob = await res.blob();
  if (!/^image\//.test(blob.type)) throw new Error(`not an image: ${url}`); // an SPA fallback page answers 200 for a missing file
  const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
  if (signal?.aborted) {
    bitmap.close();
    throw new DOMException("aborted", "AbortError");
  }
  const tex = new Texture(bitmap);
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Frees a texture's GPU memory and, for a bitmap texture, its decoded pixels. Safe on null. */
export function disposeTexture(tex: Texture | null | undefined): void {
  if (!tex) return;
  const img = tex.image as unknown;
  tex.dispose();
  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) img.close();
}

/** Runs `fn` when the browser is idle, at the latest after `timeoutMs`, and not while the tab is hidden. */
export function whenIdle(fn: () => void, timeoutMs = 3000): () => void {
  let cancelled = false;
  let handle = 0;
  const run = () => {
    if (cancelled) return;
    if (document.hidden) {
      document.addEventListener("visibilitychange", run, { once: true });
      return;
    }
    fn();
  };
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  if (w.requestIdleCallback) handle = w.requestIdleCallback(run, { timeout: timeoutMs });
  else handle = window.setTimeout(run, 250);
  return () => {
    cancelled = true;
    document.removeEventListener("visibilitychange", run);
    if (w.requestIdleCallback && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}
