/// <reference lib="webworker" />
/**
 * Fetches and decodes an elevation PNG (R*256 + G metres, or 16-bit linear over a range) into a Float32Array off the
 * main thread: a 3-million-pixel tile takes the main thread long enough to drop frames, here it costs it nothing.
 */
import { decodeDem } from "./reliefMath";

export interface DemDecodeRequest {
  id: number;
  url: string;
  offset?: number;
  range?: [number, number];
}
export type DemDecodeReply = { id: number; heights: Float32Array } | { id: number; error: string };

const ctl = new Map<number, AbortController>();

self.onmessage = async (e: MessageEvent<DemDecodeRequest | { id: number; cancel: true }>) => {
  const m = e.data;
  if ("cancel" in m) {
    ctl.get(m.id)?.abort();
    ctl.delete(m.id);
    return;
  }
  const ac = new AbortController();
  ctl.set(m.id, ac);
  try {
    const res = await fetch(m.url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bmp = await createImageBitmap(await res.blob());
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2D canvas");
    ctx.drawImage(bmp, 0, 0);
    const { width, height } = bmp;
    bmp.close();
    const heights = decodeDem(ctx.getImageData(0, 0, width, height).data, width, height, m.offset, m.range);
    (self as unknown as Worker).postMessage({ id: m.id, heights } satisfies DemDecodeReply, [heights.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: m.id, error: String(err) } satisfies DemDecodeReply);
  } finally {
    ctl.delete(m.id);
  }
};
