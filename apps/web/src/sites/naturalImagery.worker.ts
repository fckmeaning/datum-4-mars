/// <reference lib="webworker" />
/** Builds the natural-colour imagery of a tile off the main thread (see naturalImagery.ts) and returns it as a WebGL-ready bitmap. */
import { buildNaturalCanvas, type DetailCanvas, type ImageryEnv } from "./naturalCore";
import type { DemMeta } from "./reliefMath";

export interface ImageryRequest {
  meta: DemMeta;
}
export type ImageryReply = { bitmap: ImageBitmap | null; ctxTiles: number } | { error: string };

const env: ImageryEnv = {
  make: (w, h): DetailCanvas => new OffscreenCanvas(w, h),
  async load(url) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) return null;
      return await createImageBitmap(await res.blob());
    } catch {
      return null;
    }
  },
};

self.onmessage = async (e: MessageEvent<ImageryRequest>) => {
  try {
    const r = await buildNaturalCanvas(e.data.meta, env);
    if (!r) {
      (self as unknown as Worker).postMessage({ bitmap: null, ctxTiles: 0 } satisfies ImageryReply);
      return;
    }
    // flipY here: WebGL ignores the unpack-flip flag for bitmaps, and the texture is then used with flipY = false
    const bitmap = await createImageBitmap(r.canvas as OffscreenCanvas, { imageOrientation: "flipY" });
    (self as unknown as Worker).postMessage({ bitmap, ctxTiles: r.ctxTiles } satisfies ImageryReply, [bitmap]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: String(err) } satisfies ImageryReply);
  }
};
