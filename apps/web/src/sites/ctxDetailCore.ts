/**
 * The pixel work of the CTX detail tile, shared by the main thread (fallback) and the Web Worker (normal path), so both
 * produce the same tile. No DOM besides canvases: `make` creates a canvas (HTMLCanvasElement or OffscreenCanvas).
 */
export type DetailCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function ctxOf(c: DetailCanvas, readback: boolean): Ctx2D | null {
  return (c as HTMLCanvasElement).getContext("2d", readback ? { willReadFrequently: true } : undefined) as Ctx2D | null;
}

/**
 * One CTX map tile turned into a neutral-grey detail tile for the 2D map: every pixel becomes 128 x (its brightness /
 * the local mean of its tile), so flat ground is 128 and ridges, craters and slopes sit above and below it. Laid over the
 * colour mosaic with "hard light" (128 changes nothing) it sharpens the colour without changing its brightness or hue.
 * Weak contrast is lifted the same way as in `sharpenWithCtx`. Transparent pixels (no data) stay transparent.
 */
export function ctxDetailCanvas(src: CanvasImageSource, w: number, h: number, make: (w: number, h: number) => DetailCanvas): DetailCanvas | null {
  const canvas = make(w, h);
  const ctx = ctxOf(canvas, true);
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  let small: DetailCanvas = canvas;
  while (small.width > 16) {
    const next = make(Math.max(16, small.width / 2), Math.max(16, small.height / 2));
    const nctx = ctxOf(next, false);
    if (!nctx) return null;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(small, 0, 0, next.width, next.height);
    small = next;
  }
  const blurCanvas = make(w, h);
  const bctx = ctxOf(blurCanvas, true);
  if (!bctx) return null;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, w, h);
  try {
    const out = ctx.getImageData(0, 0, w, h);
    const px = out.data;
    const blur = bctx.getImageData(0, 0, w, h).data;
    const ratio = (i: number): number => px[i]! / Math.max(blur[i + 3]! > 16 ? blur[i]! : px[i]!, 8);
    let sum2 = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 16) {
      if (px[i + 3]! < 200) continue;
      const d = ratio(i) - 1;
      sum2 += d * d;
      n++;
    }
    const spread = n > 0 ? Math.sqrt(sum2 / n) : 0;
    const gain = spread > 0.002 ? Math.min(2.2, Math.max(1, 0.07 / spread)) : 1;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3]! < 200) {
        px[i] = px[i + 1] = px[i + 2] = 128;
        continue;
      }
      const v = Math.min(255, Math.max(0, 128 * (1 + gain * (ratio(i) - 1))));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  } catch {
    return null; // a tainted canvas: the tile is shown as it came
  }
}
