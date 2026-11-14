/**
 * GPU style expressions for the 2D map rasters (OpenLayers WebGLTile `style.color`).
 *
 * OpenLayers rules that bit us before and are encoded here:
 *  - r, g, b are 0-255 (alpha 0-1); 0-1 values render black.
 *  - float elevations need `normalize: false` on the GeoTIFF source, otherwise band values are rescaled to 0..1.
 *  - ["band", 1, dx, dy] offsets: x to the right, y DOWN the image, so north is dy = -1.
 *
 * Everything here is a pure function returning plain arrays, so it is unit-tested without WebGL.
 */

import type { ExpressionValue } from "ol/expr/expression.js";
import type { ClassBand } from "./classes";

export type Expr = ExpressionValue;

export type Rgb = readonly [number, number, number];

/** Gale elevation range [m]: crater floor .. Mount Sharp (matches the L1/L2/L3 value_range). */
export const GALE_ELEVATION_RANGE: readonly [number, number] = [-4550, -2030];

/** Hypsometric tint: cividis samples (colour-blind safe) at five equally spaced fractions of the elevation range. */
export const CIVIDIS_STOPS: readonly Rgb[] = [
  [0, 32, 76],
  [66, 78, 108],
  [124, 123, 120],
  [188, 175, 111],
  [253, 231, 55],
];

export const HILLSHADE_EXAGGERATION = 3; // vertical exaggeration in the shading only (display, not analysis)
/** Sun from azimuth 315 deg, 40 deg above the horizon: L = (east, north, up). */
export const SUN = { east: -0.54, north: 0.54, up: 0.643 } as const;

/** Slope colour stops [deg]: flat / moderate / steep / cliff. */
export const SLOPE_STOPS: readonly { deg: number; rgba: readonly [number, number, number, number] }[] = [
  { deg: 0, rgba: [0, 153, 51, 0.8] },
  { deg: 12, rgba: [230, 204, 26, 0.8] },
  { deg: 25, rgba: [230, 77, 26, 0.85] },
  { deg: 35, rgba: [153, 13, 13, 0.9] },
];

/** Default walking grade limit [deg] (config/params.yaml terrain.theta_max_walk_deg, ASSUMPTION range 20-30). */
export const DEFAULT_NO_GO_DEG = 25;

export function elevationStops(range: readonly [number, number] = GALE_ELEVATION_RANGE): { z: number; rgb: Rgb }[] {
  const [lo, hi] = range;
  const n = CIVIDIS_STOPS.length - 1;
  return CIVIDIS_STOPS.map((rgb, i) => ({ z: Math.round(lo + ((hi - lo) * i) / n), rgb }));
}

/** CSS gradient of the elevation ramp for legends. */
export function elevationGradientCss(range: readonly [number, number] = GALE_ELEVATION_RANGE): string {
  const stops = elevationStops(range);
  return `linear-gradient(90deg, ${stops.map((s, i) => `rgb(${s.rgb.join(",")}) ${Math.round((i / (stops.length - 1)) * 100)}%`).join(", ")})`;
}

export function slopeGradientCss(): string {
  const max = SLOPE_STOPS[SLOPE_STOPS.length - 1]!.deg;
  return `linear-gradient(90deg, ${SLOPE_STOPS.map((s) => `rgb(${s.rgba[0]},${s.rgba[1]},${s.rgba[2]}) ${Math.round((s.deg / max) * 100)}%`).join(", ")})`;
}

export interface TerrainTerms {
  /** east gradient dz/dx (m/m) */
  dzdx: Expr;
  /** gradient magnitude helper for the slope (sign is irrelevant) */
  dzdy: Expr;
  /** sun-lit fraction of the surface, 0..1 */
  intensity: Expr;
  /** shading multiplier, 0.22 (shadow) .. 1.27 (facing the sun) */
  shade: Expr;
  slopeDeg: Expr;
}

/** Shared GPU terms from the +-1 pixel neighbours. `resM` is read from the style variable of the same name. */
export function terrainTerms(): TerrainTerms {
  const cellM2: Expr = ["*", 2, ["var", "resM"]];
  const dzdx: Expr = ["/", ["-", ["band", 1, 1, 0], ["band", 1, -1, 0]], cellM2];
  const dzdy: Expr = ["/", ["-", ["band", 1, 0, 1], ["band", 1, 0, -1]], cellM2];
  const gx: Expr = ["*", HILLSHADE_EXAGGERATION, dzdx];
  const gy: Expr = ["*", HILLSHADE_EXAGGERATION, ["/", ["-", ["band", 1, 0, -1], ["band", 1, 0, 1]], cellM2]];
  const norm: Expr = ["sqrt", ["+", 1, ["+", ["*", gx, gx], ["*", gy, gy]]]];
  // normal = (-gx, -gy, 1) / norm
  const dot: Expr = ["/", ["+", ["+", ["*", ["-", 0, gx], SUN.east], ["*", ["-", 0, gy], SUN.north]], SUN.up], norm];
  const intensity: Expr = ["clamp", dot, 0, 1];
  const shade: Expr = ["+", 0.22, ["*", 1.05, intensity]];
  const slopeDeg: Expr = ["*", ["atan", ["sqrt", ["+", ["*", dzdx, dzdx], ["*", dzdy, dzdy]]]], 180 / Math.PI];
  return { dzdx, dzdy, intensity, shade, slopeDeg };
}

function rampChannel(stops: { z: number; rgb: Rgb }[], c: 0 | 1 | 2): Expr {
  return ["interpolate", ["linear"], ["band", 1], ...stops.flatMap((s) => [s.z, s.rgb[c]])];
}

/** Shaded relief: hypsometric tint x hillshade. */
export function reliefColor(range: readonly [number, number] = GALE_ELEVATION_RANGE): Expr {
  const { shade } = terrainTerms();
  const stops = elevationStops(range);
  return ["color", ["*", rampChannel(stops, 0), shade], ["*", rampChannel(stops, 1), shade], ["*", rampChannel(stops, 2), shade], 1];
}

/** Plain hillshade in grey (for the Hillshade toggle). */
export function hillshadeColor(): Expr {
  const { intensity } = terrainTerms();
  const grey: Expr = ["*", 255, intensity];
  return ["color", grey, grey, grey, 1];
}

/**
 * Slope ramp with a hard no-go class: cells steeper than `noGoDeg` are drawn solid dark red (the walking limit of the
 * route planner). Note: WebGL tile styles expose no pixel coordinates, so this is a solid fill, not a hatch.
 */
export function slopeColor(noGoDeg: number = DEFAULT_NO_GO_DEG): Expr {
  const { slopeDeg } = terrainTerms();
  const ramp: Expr = ["interpolate", ["linear"], slopeDeg, ...SLOPE_STOPS.flatMap((s) => [s.deg, [...s.rgba]])];
  return ["case", [">", slopeDeg, noGoDeg], [120, 8, 12, 0.92], ramp];
}

/** Grayscale optical image: linear stretch between the layer's value range, slight lift for the mid-tones. */
export function opticalColor(range: readonly [number, number] = [10, 195]): Expr {
  const [lo, hi] = range;
  const stretched: Expr = ["clamp", ["/", ["-", ["band", 1], lo], Math.max(1, hi - lo)], 0, 1];
  const v: Expr = ["*", 255, ["^", stretched, 0.85]];
  return ["color", v, v, v, 1];
}

function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/**
 * Classified walkability raster (uint8 0-100, nodata 255 is transparent through the source's nodata): colour by band
 * from the layer meta `classes`, highest threshold first. Opacity is applied by the layer.
 */
export function walkabilityColor(bands: readonly ClassBand[]): Expr {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  if (sorted.length === 0) return ["color", 128, 128, 128, 0];
  const out: unknown[] = ["case"];
  for (const b of sorted.slice(0, -1)) {
    const [r, g, bl] = hexToRgb(b.color);
    out.push([">=", ["band", 1], b.min], ["color", r, g, bl, 0.62]);
  }
  const [r, g, bl] = hexToRgb(sorted[sorted.length - 1]!.color);
  out.push(["color", r, g, bl, 0.62]);
  return out as Expr;
}

/** Collects every numeric literal that is a colour channel inside an expression (for the 0-255 invariant test). */
export function colourChannels(expr: unknown): number[] {
  const found: number[] = [];
  const walk = (e: unknown): void => {
    if (!Array.isArray(e)) return;
    if (e[0] === "color") {
      for (const v of e.slice(1, 4)) if (typeof v === "number") found.push(v);
    }
    for (const v of e) walk(v);
  };
  walk(expr);
  return found;
}
