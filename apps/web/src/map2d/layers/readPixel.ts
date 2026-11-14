/** First band value of a `Layer.getData(pixel)` result, or NaN when nothing was rendered under the pixel. */
export function firstBand(data: Float32Array | Uint8Array | Uint8ClampedArray | DataView | null | undefined): number {
  if (!data || data instanceof DataView || data.length === 0) return Number.NaN;
  return Number(data[0]);
}
