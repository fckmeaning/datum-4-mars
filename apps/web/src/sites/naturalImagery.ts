/**
 * Natural-colour imagery of a tile that has no orthophoto of its own, shared by the 2D map and the 3D relief:
 * the Viking colour mosaic sharpened with the Esri CTX camera mosaic (see naturalCore.buildNaturalCanvas).
 *
 * The 4096 px build (tile downloads, three 64 MB pixel reads and a loop over 16 million pixels) runs in a Web Worker so the
 * page does not freeze while the 3D view opens; without worker support it runs on the main thread as before.
 */
import { buildNaturalCanvas, type DetailCanvas, type ImageryEnv } from "./naturalCore";
import { ctxDetailCanvas } from "./ctxDetailCore";
import type { DemMeta } from "./reliefMath";
import type { ImageryReply, ImageryRequest } from "./naturalImagery.worker";

export interface NaturalImagery {
  /** Spans exactly the tile bounds (north at the top). An ImageBitmap (made by the worker) is already flipped for WebGL, see `flipped`. */
  canvas: HTMLCanvasElement | ImageBitmap;
  /** true for the worker's bitmap: use it as a texture with `flipY = false` */
  flipped: boolean;
  /** How many CTX tiles were drawn; 0 means the colour mosaic alone. */
  ctxTiles: number;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

const domEnv: ImageryEnv = {
  make(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  },
  load: loadImage,
};

const workerSupported = (): boolean => typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";

function buildInWorker(meta: DemMeta): Promise<NaturalImagery | null> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./naturalImagery.worker.ts", import.meta.url), { type: "module" });
    const done = () => w.terminate(); // frees the worker's 4096 px canvases at once
    w.onmessage = (e: MessageEvent<ImageryReply>) => {
      done();
      if ("error" in e.data) reject(new Error(e.data.error));
      else resolve(e.data.bitmap ? { canvas: e.data.bitmap, flipped: true, ctxTiles: e.data.ctxTiles } : null);
    };
    w.onerror = () => {
      done();
      reject(new Error("imagery worker failed"));
    };
    w.postMessage({ meta } satisfies ImageryRequest);
  });
}

async function buildOnMainThread(meta: DemMeta): Promise<NaturalImagery | null> {
  const r = await buildNaturalCanvas(meta, domEnv);
  return r ? { canvas: r.canvas as HTMLCanvasElement, flipped: false, ctxTiles: r.ctxTiles } : null;
}

const cache = new Map<string, Promise<NaturalImagery | null>>();
/** A finished 4096 px picture is 64 MB: only the last few tiles are kept. */
const KEEP = 2;

function trim(): void {
  while (cache.size > KEEP) {
    const oldest = cache.keys().next().value as string;
    const p = cache.get(oldest);
    cache.delete(oldest);
    // release the bitmap's pixels a little later: its texture may still be on its way out
    void p?.then((r) => r && r.flipped && window.setTimeout(() => (r.canvas as ImageBitmap).close(), 5000));
  }
}

/** One build per tile, however many views ask for it. */
export function naturalImagery(key: string, meta: DemMeta): Promise<NaturalImagery | null> {
  let p = cache.get(key);
  if (!p) {
    p = (workerSupported() ? buildInWorker(meta).catch(() => buildOnMainThread(meta)) : buildOnMainThread(meta)).catch(() => {
      cache.delete(key); // a failed build may be retried
      return null;
    });
    cache.set(key, p);
    trim();
  }
  return p;
}

/** Main-thread version of the CTX detail tile (see ctxDetailCore); the 2D map normally gets it from a Web Worker. */
export function ctxDetailTile(img: HTMLImageElement): HTMLCanvasElement | null {
  const make = (w: number, h: number): DetailCanvas => domEnv.make(w, h);
  return ctxDetailCanvas(img, img.naturalWidth || 512, img.naturalHeight || 512, make) as HTMLCanvasElement | null;
}
