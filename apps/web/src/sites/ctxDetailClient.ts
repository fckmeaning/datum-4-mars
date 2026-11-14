import type { DetailReply } from "./ctxDetail.worker";
import { ctxDetailTile } from "./naturalImagery";

export interface CtxDetailLoader {
  /** Fills `target.src` with the detail tile of the CTX tile at `src` (or with `src` itself when the work fails). */
  load(src: string, target: HTMLImageElement): void;
  /** Cancels what is still running and frees the worker (the map is gone). */
  dispose(): void;
}

const hasWorker = (): boolean => typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";

function setBlob(target: HTMLImageElement, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const free = () => URL.revokeObjectURL(url);
  target.addEventListener("load", free, { once: true });
  target.addEventListener("error", free, { once: true });
  target.src = url;
}

/** CTX tile -> detail tile. Normally runs in a Web Worker; without one it runs on the main thread, one tile per frame. */
export function createCtxDetailLoader(): CtxDetailLoader {
  if (!hasWorker()) return mainThreadLoader();
  let worker: Worker | null = new Worker(new URL("./ctxDetail.worker.ts", import.meta.url), { type: "module" });
  const waiting = new Map<number, { src: string; target: HTMLImageElement; retried?: boolean }>();
  let next = 1;
  worker.onmessage = (e: MessageEvent<DetailReply>) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if ("blob" in e.data) setBlob(w.target, e.data.blob);
    else if (!w.retried) {
      // one more try after a pause (a rate-limited or dropped tile usually comes the second time), then the map reports the gap
      const again = next++;
      waiting.set(again, { ...w, retried: true });
      window.setTimeout(() => worker?.postMessage({ id: again, src: w.src }), 1500);
    } else w.target.src = w.src; // fails the same way, so the map reports the gap
  };
  worker.onerror = () => {
    // the worker itself broke: every waiting tile is shown as it came
    for (const [, w] of waiting) w.target.src = w.src;
    waiting.clear();
  };
  return {
    load(src, target) {
      const id = next++;
      waiting.set(id, { src, target });
      worker?.postMessage({ id, src });
    },
    dispose() {
      waiting.clear();
      worker?.terminate();
      worker = null;
    },
  };
}

function mainThreadLoader(): CtxDetailLoader {
  let alive = true;
  return {
    load(src, target) {
      const raw = new Image();
      raw.crossOrigin = "anonymous";
      raw.onload = () => {
        if (!alive) return;
        const detail = ctxDetailTile(raw);
        if (!detail) {
          target.src = src;
          return;
        }
        detail.toBlob((blob) => (blob && alive ? setBlob(target, blob) : (target.src = src)), "image/png");
      };
      raw.onerror = () => {
        target.src = src;
      };
      raw.src = src;
    },
    dispose() {
      alive = false;
    },
  };
}
