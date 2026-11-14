/** Pure helpers for the MOLA 463 m relief of a site (see data/pipeline/fetch_site_dems.py). */

import { MARS_RADIUS_KM } from "./scale";

export interface DemMeta {
  id: string;
  centre: { lat: number; lon: number };
  bounds: { west: number; east: number; north: number; south: number };
  width: number;
  height: number;
  pixel_m: number;
  min_m: number;
  max_m: number;
  offset: number;
  /** true: 16-bit linear between min_m and max_m (high-detail tiers); false/absent: R*256 + G - offset in whole metres. */
  q16?: boolean;
  tier?: string;
  label?: string;
  /** file name of an orthophoto next to dem.png that covers the same bounds */
  imagery?: string;
  source?: string;
}

/**
 * Heights in metres from an RGBA raster, row 0 north. Default: value = R*256 + G - offset (whole metres).
 * With `range` [min, max]: 16-bit linear, min + value / 65535 * (max - min), which keeps the fine relief of the high-detail tiers.
 */
export function decodeDem(rgba: Uint8ClampedArray, width: number, height: number, offset = 32768, range?: [number, number]): Float32Array {
  const out = new Float32Array(width * height);
  if (range) {
    const [lo, hi] = range;
    for (let i = 0; i < out.length; i++) out[i] = lo + (((rgba[i * 4] ?? 0) * 256 + (rgba[i * 4 + 1] ?? 0)) / 65535) * (hi - lo);
  } else {
    for (let i = 0; i < out.length; i++) out[i] = (rgba[i * 4] ?? 0) * 256 + (rgba[i * 4 + 1] ?? 0) - offset;
  }
  return out;
}

/** Ground size in metres of the patch (east-west measured at the centre latitude). */
export function groundSizeM(b: DemMeta["bounds"], centreLat: number): { w: number; h: number } {
  const R = MARS_RADIUS_KM * 1000;
  const rad = Math.PI / 180;
  return { w: (b.east - b.west) * rad * R * Math.cos(centreLat * rad), h: (b.north - b.south) * rad * R };
}

export interface TileRange {
  z: number;
  col0: number;
  col1: number;
  row0: number;
  row1: number;
  /** degrees covered by one tile */
  tileDeg: number;
}

/** Tiles of the NASA Trek equirectangular grid (256 px, level 0 = 0.703125 deg/px, origin -180/90) that cover the bounds. */
export function trekTileRange(b: DemMeta["bounds"], z: number): TileRange {
  const tileDeg = (0.703125 / 2 ** z) * 256;
  return {
    z,
    tileDeg,
    col0: Math.floor((b.west + 180) / tileDeg),
    col1: Math.floor((b.east + 180) / tileDeg),
    row0: Math.floor((90 - b.north) / tileDeg),
    row1: Math.floor((90 - b.south) / tileDeg),
  };
}

/** Tiles of the Esri CTX grid (512 px, level 0 = 0.3515625 deg/px, plate carree, origin -180/90) that cover the bounds. */
export function ctxTileRange(b: DemMeta["bounds"], z: number): TileRange {
  const tileDeg = (0.3515625 / 2 ** z) * 512;
  return {
    z,
    tileDeg,
    col0: Math.floor((b.west + 180) / tileDeg),
    col1: Math.floor((b.east + 180) / tileDeg),
    row0: Math.floor((90 - b.north) / tileDeg),
    row1: Math.floor((90 - b.south) / tileDeg),
  };
}

/**
 * CTX level whose pixels are about as fine as the texture can hold: the bounds fit `maxPx` pixels at it (level 12 is
 * about 5 m per pixel and the finest worth using). Below level 9 (more than 80 tiles) the CTX layer is not used.
 */
export function ctxZoomFor(b: DemMeta["bounds"], maxPx = 4096): number | null {
  const degPerPx = (b.east - b.west) / maxPx;
  const z = Math.min(12, Math.floor(Math.log2(0.3515625 / degPerPx)));
  return z >= 9 ? z : null;
}

/** Where a tile lands on a canvas that spans exactly the bounds. */
export function tileDrawRect(
  r: TileRange,
  row: number,
  col: number,
  b: DemMeta["bounds"],
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  const west = -180 + col * r.tileDeg;
  const north = 90 - row * r.tileDeg;
  const sx = canvasW / (b.east - b.west);
  const sy = canvasH / (b.north - b.south);
  return { x: (west - b.west) * sx, y: (b.north - north) * sy, w: r.tileDeg * sx, h: r.tileDeg * sy };
}

const statsCache = new WeakMap<Float32Array, { min: number; max: number; range: number }>();

/** Elevation statistics used for the info line (cached per array: it is asked for on every render of the 3D view). */
export function reliefStats(h: Float32Array): { min: number; max: number; range: number } {
  const hit = statsCache.get(h);
  if (hit) return hit;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < h.length; i++) {
    const v = h[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const out = { min, max, range: max - min };
  statsCache.set(h, out);
  return out;
}
