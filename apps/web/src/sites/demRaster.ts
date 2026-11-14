/**
 * Rasters computed from a site's elevation patch (MOLA 463 m, data/pipeline/fetch_site_dems.py): the blue-to-yellow
 * elevation colour with shaded relief (the look of the Gale planner map), and the modeled data layers.
 *
 * Model constants are the ones of config/params.yaml (atmosphere.scale_height_H, atmosphere.P_ref,
 * radiation.dose_eq_ref, radiation.beta_pressure_dose); P_ref and the dose were measured at the Gale floor, -4400 m.
 */

import { MARS_RADIUS_KM } from "./scale";
import type { DemMeta } from "./reliefMath";

export const MODEL = { H_m: 11100, P_ref_Pa: 750, h_ref_m: -4400, dose_ref_mSv_day: 0.64, beta: 0.5 } as const;

export type RasterKind = "elevation" | "slope" | "radiation" | "pressure" | "hazard";

export interface RasterSpec {
  kind: RasterKind;
  name: string;
  unit: string;
  min: number;
  max: number;
  digits: number;
  ramp: string[];
  modeled: boolean;
}

const RAMPS = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  inferno: ["#000004", "#57106e", "#bc3754", "#f98e09", "#fcffa4"],
  plasma: ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
  risk: ["#1a9850", "#a6d96a", "#fee08b", "#f46d43", "#a50026"],
  cividis: ["#00204d", "#31446b", "#666970", "#958f78", "#cbba69", "#ffea46"],
} as const;

/** Spec of a data layer; elevation range comes from the patch itself. */
export function rasterSpec(kind: RasterKind, elevMin = 0, elevMax = 1): RasterSpec {
  switch (kind) {
    case "elevation":
      return { kind, name: "Elevation", unit: "m", min: elevMin, max: elevMax, digits: 0, ramp: [...RAMPS.cividis], modeled: false };
    case "slope":
      return { kind, name: "Slope (463 m grid)", unit: "deg", min: 0, max: 12, digits: 1, ramp: [...RAMPS.viridis], modeled: true };
    case "radiation":
      return { kind, name: "Radiation dose rate", unit: "mSv/day", min: 0.5, max: 1.5, digits: 2, ramp: [...RAMPS.plasma], modeled: true };
    case "pressure":
      return { kind, name: "Surface pressure", unit: "Pa", min: 50, max: 1100, digits: 0, ramp: [...RAMPS.inferno], modeled: true };
    case "hazard":
      return { kind, name: "Hazard index", unit: "index", min: 0, max: 1, digits: 2, ramp: [...RAMPS.risk], modeled: true };
  }
}

export function pressurePa(h_m: number): number {
  return MODEL.P_ref_Pa * Math.exp(-(h_m - MODEL.h_ref_m) / MODEL.H_m);
}

export function doseMSvPerDay(h_m: number): number {
  return MODEL.dose_ref_mSv_day * Math.pow(MODEL.P_ref_Pa / pressurePa(h_m), MODEL.beta);
}

/** Ground size of one pixel in metres: dx (east-west at the centre latitude) and dy (north-south). */
export function pixelSizeM(meta: DemMeta): { dx: number; dy: number } {
  const R = MARS_RADIUS_KM * 1000;
  const rad = Math.PI / 180;
  const dLon = (meta.bounds.east - meta.bounds.west) / meta.width;
  const dLat = (meta.bounds.north - meta.bounds.south) / meta.height;
  return { dx: dLon * rad * R * Math.cos(meta.centre.lat * rad), dy: dLat * rad * R };
}

/** Slope in degrees by central differences. */
export function slopeDeg(h: Float32Array, w: number, ht: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(w * ht);
  const at = (x: number, y: number) => h[Math.min(ht - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < ht; y++) {
    for (let x = 0; x < w; x++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) / (2 * dx);
      const gy = (at(x, y + 1) - at(x, y - 1)) / (2 * dy);
      out[y * w + x] = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
    }
  }
  return out;
}

/** Lambert hillshade in [0, 1]; the sun sits in the north-west at `altDeg`. `exag` scales heights (463 m cells hide small relief). */
export function hillshade(h: Float32Array, w: number, ht: number, dx: number, dy: number, azDeg = 315, altDeg = 38, exag = 4): Float32Array {
  const out = new Float32Array(w * ht);
  const az = (azDeg * Math.PI) / 180;
  const alt = (altDeg * Math.PI) / 180;
  // light vector (east, north, up)
  const lx = Math.sin(az) * Math.cos(alt);
  const ly = Math.cos(az) * Math.cos(alt);
  const lz = Math.sin(alt);
  const at = (x: number, y: number) => h[Math.min(ht - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < ht; y++) {
    for (let x = 0; x < w; x++) {
      const gx = ((at(x + 1, y) - at(x - 1, y)) / (2 * dx)) * exag; // d height / d east
      const gy = ((at(x, y - 1) - at(x, y + 1)) / (2 * dy)) * exag; // d height / d north (row 0 is north)
      const n = Math.hypot(gx, gy, 1);
      const shade = (-gx * lx - gy * ly + lz) / n;
      out[y * w + x] = Math.max(0, Math.min(1, shade));
    }
  }
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function rampColor(ramp: string[], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(ramp[i]!);
  const b = hexToRgb(ramp[i + 1]!);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Value raster of a layer in its own units. */
export function layerValues(kind: RasterKind, h: Float32Array, w: number, ht: number, dx: number, dy: number): Float32Array {
  if (kind === "elevation") return h;
  if (kind === "slope") return slopeDeg(h, w, ht, dx, dy);
  const out = new Float32Array(h.length);
  if (kind === "pressure") for (let i = 0; i < h.length; i++) out[i] = pressurePa(h[i]!);
  else if (kind === "radiation") for (let i = 0; i < h.length; i++) out[i] = doseMSvPerDay(h[i]!);
  else {
    // both parts are scaled to this patch: at a single site the absolute spread of the dose is tiny
    const s = slopeDeg(h, w, ht, dx, dy);
    const d = Float32Array.from(h, (v) => doseMSvPerDay(v));
    let smax = 3; // a loop: spreading millions of values into Math.max overflows the call stack
    for (const v of s) if (v > smax) smax = v;
    let dmin = Infinity;
    let dmax = -Infinity;
    for (const v of d) {
      if (v < dmin) dmin = v;
      if (v > dmax) dmax = v;
    }
    const dspan = dmax - dmin || 1;
    for (let i = 0; i < h.length; i++) out[i] = 0.5 * Math.min(1, s[i]! / smax) + 0.5 * ((d[i]! - dmin) / dspan);
  }
  return out;
}

/**
 * Spec with the colour scale of this patch: elevation, pressure, dose and hazard span the site's own range (so a plain still
 * shows structure; the legend prints the real numbers), slope runs from 0 to the larger of 3 degrees and the patch maximum.
 */
export function specFor(kind: RasterKind, vals: Float32Array): RasterSpec {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of vals) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const base = rasterSpec(kind, lo, hi);
  if (kind === "slope") return { ...base, min: 0, max: Math.max(3, Math.ceil(hi)) };
  if (kind === "hazard") return { ...base, min: 0, max: 1 };
  if (kind === "elevation") return { ...base, min: lo, max: hi };
  const pad = (hi - lo) * 0.02 || 0.01 * Math.abs(hi) || 1; // flat patch: keep a visible span
  return { ...base, min: lo - pad, max: hi + pad };
}

export interface DisplayGrid {
  h: Float32Array;
  w: number;
  ht: number;
  meta: DemMeta;
}

const displayCache = new WeakMap<Float32Array, Map<number, DisplayGrid>>();

/**
 * The elevation tile averaged down so that its longer side is at most `maxSide` pixels, for pictures that are drawn over the
 * tile (the elevation colour, the slope, radiation, pressure and hazard layers). A 3 million pixel tile makes each of them
 * take seconds; at 1024 pixels (20 m on the 10 m Gale tile) it is a quarter of that and looks the same on screen. The
 * grid still spans the same bounds. Values read under the cursor come from the full tile, not from this.
 */
export function displayGrid(h: Float32Array, w: number, ht: number, meta: DemMeta, maxSide = 1024): DisplayGrid {
  const step = Math.max(1, Math.ceil(Math.max(w, ht) / maxSide));
  if (step === 1) return { h, w, ht, meta };
  const hit = displayCache.get(h)?.get(maxSide);
  if (hit) return hit;
  const w2 = Math.ceil(w / step);
  const h2 = Math.ceil(ht / step);
  const out = new Float32Array(w2 * h2);
  for (let r = 0; r < h2; r++) {
    for (let c = 0; c < w2; c++) {
      let sum = 0;
      let n = 0;
      for (let y = r * step; y < Math.min(ht, (r + 1) * step); y++) {
        for (let x = c * step; x < Math.min(w, (c + 1) * step); x++) {
          sum += h[y * w + x]!;
          n++;
        }
      }
      out[r * w2 + c] = sum / n;
    }
  }
  const grid = { h: out, w: w2, ht: h2, meta: { ...meta, width: w2, height: h2 } };
  const bySide = displayCache.get(h) ?? new Map<number, DisplayGrid>();
  bySide.set(maxSide, grid);
  displayCache.set(h, bySide);
  return grid;
}

/**
 * Colour raster as RGBA bytes: the layer colour times shaded relief. Elevation is normalised to the patch range
 * (so even a flat plain shows its structure, as in the Gale planner).
 */
export function renderRaster(
  kind: RasterKind,
  h: Float32Array,
  w: number,
  ht: number,
  meta: DemMeta,
  options: { shade?: number; alpha?: number } = {},
): { data: Uint8ClampedArray; spec: RasterSpec } {
  const { dx, dy } = pixelSizeM(meta);
  const vals = layerValues(kind, h, w, ht, dx, dy);
  const spec = specFor(kind, vals);
  const sh = hillshade(h, w, ht, dx, dy, 315, 38, kind === "elevation" ? 5 : 4);
  const shadeAmt = options.shade ?? 0.75; // how much the relief darkens/lightens the colour
  const alpha = Math.round(255 * (options.alpha ?? 1));
  const out = new Uint8ClampedArray(w * ht * 4);
  const span = spec.max - spec.min || 1;
  // the ramp is parsed once (not two hex strings per pixel) and blended in place: same numbers as rampColor, no allocation
  const stops = spec.ramp.map(hexToRgb);
  const last = stops.length - 1;
  for (let i = 0; i < vals.length; i++) {
    const t = (vals[i]! - spec.min) / span;
    const x = Math.max(0, Math.min(1, t)) * last;
    const j = Math.min(last - 1, Math.floor(x));
    const f = x - j;
    const a = stops[j]!;
    const b = stops[j + 1]!;
    const k = 1 - shadeAmt + shadeAmt * (sh[i]! * 1.6); // 0.7 shade is neutral-ish, lit slopes brighten
    out[i * 4] = (a[0] + (b[0] - a[0]) * f) * k;
    out[i * 4 + 1] = (a[1] + (b[1] - a[1]) * f) * k;
    out[i * 4 + 2] = (a[2] + (b[2] - a[2]) * f) * k;
    out[i * 4 + 3] = alpha;
  }
  return { data: out, spec };
}

/** Value of a layer at a lat/lon inside the patch (nearest pixel), or null outside. */
export function valueAt(kind: RasterKind, vals: Float32Array, meta: DemMeta, lat: number, lon: number): number | null {
  const b = meta.bounds;
  if (lon < b.west || lon > b.east || lat > b.north || lat < b.south) return null;
  const x = Math.min(meta.width - 1, Math.floor(((lon - b.west) / (b.east - b.west)) * meta.width));
  const y = Math.min(meta.height - 1, Math.floor(((b.north - lat) / (b.north - b.south)) * meta.height));
  void kind;
  return vals[y * meta.width + x] ?? null;
}
