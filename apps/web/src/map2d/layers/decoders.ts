import { toMarsAoi } from "../projection";

/** Unpack a base64 `np.packbits(mask, axis=None)` string into one byte per pixel (0 or 1), length rows*cols. */
export function unpackBits(b64: string, rows: number, cols: number): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(rows * cols);
  for (let i = 0; i < out.length; i++) {
    const byte = bin.charCodeAt(i >> 3);
    out[i] = (byte >> (7 - (i & 7))) & 1;
  }
  return out;
}

export interface ViewshedPayload {
  crop: { rows: number; cols: number };
  bounds: { north_west: { lat: number; lon: number }; south_east: { lat: number; lon: number } };
  visible_b64: string;
  in_range_b64: string;
  visible_fraction: number;
  observer: { lat: number; lon: number; ground_m?: number };
  radius_m?: number;
  cell_m?: number;
}

/** RGBA bitmap: visible = translucent teal, in range but shadowed = dark, outside the radius = transparent. */
export function viewshedRgba(visible: Uint8Array, inRange: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(visible.length * 4);
  for (let i = 0; i < visible.length; i++) {
    const o = i * 4;
    if (visible[i]) {
      px[o] = 20;
      px[o + 1] = 184;
      px[o + 2] = 166;
      px[o + 3] = 105;
    } else if (inRange[i]) {
      px[o] = 8;
      px[o + 1] = 12;
      px[o + 2] = 16;
      px[o + 3] = 150;
    }
  }
  return px;
}

/** Image extent [minX, minY, maxX, maxY] in AOI metres from the lat/lon corners of the crop. */
export function viewshedExtent(b: ViewshedPayload["bounds"]): [number, number, number, number] {
  const [x0, y0] = toMarsAoi([b.north_west.lon, b.north_west.lat]);
  const [x1, y1] = toMarsAoi([b.south_east.lon, b.south_east.lat]);
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

export interface IsochroneLine {
  minutes: number;
  label: string;
  /** one or more polylines in lon/lat */
  lines: [number, number][][];
}

interface GeoFeature {
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

function numberProp(p: Record<string, unknown> | null | undefined, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = p?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/** Parse the isochrone FeatureCollection (LineString / MultiLineString per level). Unknown shapes yield []. */
export function parseIsochrones(fc: unknown): IsochroneLine[] {
  const feats = (fc as { features?: GeoFeature[] } | null)?.features;
  if (!Array.isArray(feats)) return [];
  const out: IsochroneLine[] = [];
  for (const f of feats) {
    const g = f.geometry;
    if (!g?.type || !Array.isArray(g.coordinates)) continue;
    const minutes = numberProp(f.properties, ["minutes", "level_min", "time_min", "level"]);
    if (minutes === undefined) continue;
    let lines: [number, number][][];
    if (g.type === "LineString") lines = [g.coordinates as [number, number][]];
    else if (g.type === "MultiLineString") lines = g.coordinates as [number, number][][];
    else continue;
    const label = typeof f.properties?.label === "string" ? (f.properties.label as string) : `${minutes} min`;
    out.push({ minutes, label, lines: lines.filter((l) => l.length > 1) });
  }
  return out.sort((a, b) => a.minutes - b.minutes);
}
