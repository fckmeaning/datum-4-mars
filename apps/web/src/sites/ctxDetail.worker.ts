/// <reference lib="webworker" />
/**
 * Turns CTX map tiles into neutral detail tiles off the main thread: the worker downloads the tile, decodes it, does the
 * per-pixel work of ctxDetailCore and sends the finished PNG back, so the 2D map never stalls while tiles arrive.
 */
import { ctxDetailCanvas } from "./ctxDetailCore";

export interface DetailRequest {
  id: number;
  src: string;
}
export type DetailReply = { id: number; blob: Blob } | { id: number; error: true };

const ctl = new Map<number, AbortController>();

self.onmessage = async (e: MessageEvent<DetailRequest | { id: number; cancel: true }>) => {
  const m = e.data;
  if ("cancel" in m) {
    ctl.get(m.id)?.abort();
    ctl.delete(m.id);
    return;
  }
  const ac = new AbortController();
  ctl.set(m.id, ac);
  try {
    const res = await fetch(m.src, { mode: "cors", signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bmp = await createImageBitmap(await res.blob());
    const canvas = ctxDetailCanvas(bmp, bmp.width || 512, bmp.height || 512, (w, h) => new OffscreenCanvas(w, h)) as OffscreenCanvas | null;
    bmp.close();
    if (!canvas) throw new Error("no 2D canvas");
    const blob = await canvas.convertToBlob({ type: "image/png" });
    (self as unknown as Worker).postMessage({ id: m.id, blob } satisfies DetailReply);
  } catch {
    (self as unknown as Worker).postMessage({ id: m.id, error: true } satisfies DetailReply);
  } finally {
    ctl.delete(m.id);
  }
};
