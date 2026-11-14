/**
 * Natural-colour imagery of a tile, built from canvases and a tile loader that the caller supplies, so the same code runs on the
 * main thread (fallback) and inside the imagery Web Worker (normal path, see naturalImagery.worker.ts).
 */
import { ctxTileRange, ctxZoomFor, tileDrawRect, trekTileRange, type DemMeta } from "./reliefMath";
import type { DetailCanvas } from "./ctxDetailCore";

export type { DetailCanvas };
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface ImageryEnv {
  make(w: number, h: number): DetailCanvas;
  /** a decoded image of the tile at `url`, or null when it cannot be had (offline, a gap in the CTX mosaic) */
  load(url: string): Promise<CanvasImageSource | null>;
}

const ctxOf = (c: DetailCanvas): Ctx2D | null => (c as HTMLCanvasElement).getContext("2d", { willReadFrequently: true }) as Ctx2D | null;

const TREK_MDIM = "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/";
const CTX_TILES = "https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/";

/**
 * Pan-sharpening: the colour mosaic keeps its hue and brightness at large scale, the grey CTX layer adds the fine detail.
 * Each pixel of the colour canvas is multiplied by (CTX grey / blurred CTX grey), so a CTX pixel as bright as its
 * surroundings changes nothing and a shadowed ridge darkens the colour under it (weak detail is lifted, see `gain`). Missing CTX tiles (transparent) stay as is.
 */
function sharpenWithCtx(ctx: Ctx2D, layer: DetailCanvas, lctx: Ctx2D, size: number, env: ImageryEnv): void {
  const blurCanvas = env.make(size, size);
  const bctx = ctxOf(blurCanvas);
  if (!bctx) return;
  // halve step by step down to 96 px: every step averages 2 x 2 pixels, so the small image is a true local mean
  let small: DetailCanvas = layer;
  while (small.width > 96) {
    const w = Math.max(96, small.width / 2);
    const next = env.make(w, w);
    const nctx = ctxOf(next);
    if (!nctx) return;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(small, 0, 0, next.width, next.height);
    small = next;
  }
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, size, size);
  try {
    const base = ctx.getImageData(0, 0, size, size);
    const detail = lctx.getImageData(0, 0, size, size).data;
    const blur = bctx.getImageData(0, 0, size, size).data;
    const px = base.data;
    const ratio = (i: number): number => {
      const mean = blur[i + 3]! > 16 ? blur[i]! : detail[i]!;
      return detail[i]! / Math.max(mean, 8);
    };
    // How much contrast the CTX layer has varies a lot (a flat plain at 20 m is within a few per cent of its surroundings,
    // a rough crater floor much more). Lift weak detail towards a spread of about 7 %, never more than 2.5 times.
    let sum2 = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 16) {
      if (detail[i + 3]! < 200) continue;
      const d = ratio(i) - 1;
      sum2 += d * d;
      n++;
    }
    const spread = n > 0 ? Math.sqrt(sum2 / n) : 0;
    const gain = spread > 0.002 ? Math.min(2.5, Math.max(1, 0.07 / spread)) : 1;
    for (let i = 0; i < px.length; i += 4) {
      if (detail[i + 3]! < 200) continue;
      const k = Math.min(2, Math.max(0.45, 1 + gain * (ratio(i) - 1)));
      px[i] = Math.min(255, px[i]! * k);
      px[i + 1] = Math.min(255, px[i + 1]! * k);
      px[i + 2] = Math.min(255, px[i + 2]! * k);
    }
    ctx.putImageData(base, 0, 0);
  } catch {
    /* a tainted canvas (CTX tiles without CORS headers): keep the colour mosaic as it is */
  }
}

/**
 * Natural colour for a tile without an orthophoto: the orbital colour mosaic (Viking MDIM, 232 m) stitched from NASA Trek
 * tiles onto a canvas that spans the DEM bounds exactly, sharpened with the grey Esri CTX camera mosaic (5 to 20 m).
 * CTX is a beta product with gaps; a missing tile just leaves the colour mosaic showing. Needs the network, like the 2D map.
 */
export async function buildNaturalCanvas(meta: DemMeta, env: ImageryEnv): Promise<{ canvas: DetailCanvas; ctxTiles: number } | null> {
  const ctxZ = ctxZoomFor(meta.bounds);
  const size = ctxZ !== null ? 4096 : 1024;
  const canvas = env.make(size, size);
  const ctx = ctxOf(canvas);
  if (!ctx) return null;
  ctx.fillStyle = "#6b4a38";
  ctx.fillRect(0, 0, size, size);
  const r = trekTileRange(meta.bounds, 7);
  const jobs: Promise<void>[] = [];
  for (let row = r.row0; row <= r.row1; row++) {
    for (let col = r.col0; col <= r.col1; col++) {
      jobs.push(
        env.load(`${TREK_MDIM}${r.z}/${row}/${col}.jpg`).then((img) => {
          if (!img) return;
          const d = tileDrawRect(r, row, col, meta.bounds, size, size);
          ctx.drawImage(img, d.x, d.y, d.w, d.h);
        }),
      );
    }
  }
  await Promise.all(jobs);

  let ctxTiles = 0;
  if (ctxZ !== null) {
    const cr = ctxTileRange(meta.bounds, ctxZ);
    const layer = env.make(size, size);
    const lctx = ctxOf(layer);
    const loads: Promise<void>[] = [];
    for (let row = cr.row0; row <= cr.row1; row++) {
      for (let col = cr.col0; col <= cr.col1; col++) {
        loads.push(
          env.load(`${CTX_TILES}${cr.z}/${row}/${col}`).then((img) => {
            if (!img || !lctx) return;
            const d = tileDrawRect(cr, row, col, meta.bounds, size, size);
            lctx.drawImage(img, d.x, d.y, d.w, d.h);
            ctxTiles++;
          }),
        );
      }
    }
    await Promise.all(loads);
    if (lctx && ctxTiles > 0) sharpenWithCtx(ctx, layer, lctx, size, env);
  }
  return { canvas, ctxTiles };
}


