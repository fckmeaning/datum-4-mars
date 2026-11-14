import type { DemDecodeReply } from "./demDecode.worker";
import { decodeDem } from "./reliefMath";

const hasWorker = (): boolean => typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";

let worker: Worker | null = null;
let next = 1;
const waiting = new Map<number, { ok: (h: Float32Array) => void; fail: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./demDecode.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<DemDecodeReply>) => {
    const p = waiting.get(e.data.id);
    if (!p) return;
    waiting.delete(e.data.id);
    if ("heights" in e.data) p.ok(e.data.heights);
    else p.fail(new Error(e.data.error));
  };
  w.onerror = () => {
    for (const [, p] of waiting) p.fail(new Error("elevation worker failed"));
    waiting.clear();
    worker?.terminate();
    worker = null; // the next load starts a fresh one
  };
  worker = w;
  return w;
}

export interface DemDecodeJob {
  promise: Promise<Float32Array>;
  /** Stops the download and drops the result (the page the user left). */
  cancel(): void;
}

/** Elevation PNG to heights in metres. Runs in a worker; without worker support it decodes on the main thread. */
export function decodeDemPng(url: string, offset: number | undefined, range: [number, number] | undefined): DemDecodeJob {
  if (!hasWorker()) {
    let dead = false;
    const promise = (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2D canvas");
      ctx.drawImage(img, 0, 0);
      const out = decodeDem(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, offset, range);
      if (dead) throw new Error("cancelled");
      return out;
    })();
    return { promise, cancel: () => void (dead = true) };
  }
  const id = next++;
  const w = getWorker();
  const promise = new Promise<Float32Array>((ok, fail) => {
    waiting.set(id, { ok, fail });
    w.postMessage({ id, url: new URL(url, window.location.href).href, offset, range });
  });
  return {
    promise,
    cancel() {
      if (waiting.delete(id)) worker?.postMessage({ id, cancel: true });
    },
  };
}
