/**
 * colormap.ts - Perceptually uniform color scales for 3D terrain draping (Cividis and Magma).
 * 
 * Provides:
 * - Cividis LUT (elevation)
 * - Magma LUT (slope)
 * - Legend definitions matching 2D map styling.
 */

import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  ClampToEdgeWrapping,
} from "three";
import { sampleCividisRgb } from "./cividis";

export { sampleCividisRgb, createCividisLutTexture } from "./cividis";

/**
 * Key control points for the Magma colormap (RGB in [0, 1]).
 * Derived from the standard matplotlib / viridis-family magma specification.
 */
const MAGMA_STOPS: Array<{ t: number; r: number; g: number; b: number }> = [
  { t: 0.0, r: 0.0, g: 0.004, b: 0.016 }, // Deep black/purple
  { t: 0.125, r: 0.09, g: 0.06, b: 0.24 },
  { t: 0.25, r: 0.26, g: 0.06, b: 0.44 },
  { t: 0.375, r: 0.45, g: 0.12, b: 0.47 },
  { t: 0.5, r: 0.63, g: 0.18, b: 0.43 }, // Magenta
  { t: 0.625, r: 0.79, g: 0.26, b: 0.35 },
  { t: 0.75, r: 0.93, g: 0.41, b: 0.24 }, // Coral orange
  { t: 0.875, r: 0.98, g: 0.66, b: 0.22 },
  { t: 1.0, r: 0.988, g: 1.0, b: 0.643 }, // Pale yellow
];

/**
 * Samples the Magma colormap at normalized position t in [0, 1].
 * Returns [r, g, b] with components in [0, 1].
 */
export function sampleMagmaRgb(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));

  let lower = MAGMA_STOPS[0]!;
  let upper = MAGMA_STOPS[MAGMA_STOPS.length - 1]!;

  for (let i = 0; i < MAGMA_STOPS.length - 1; i++) {
    const s0 = MAGMA_STOPS[i]!;
    const s1 = MAGMA_STOPS[i + 1]!;
    if (clamped >= s0.t && clamped <= s1.t) {
      lower = s0;
      upper = s1;
      break;
    }
  }

  const span = upper.t - lower.t;
  const factor = span > 0 ? (clamped - lower.t) / span : 0;

  const r = lower.r + (upper.r - lower.r) * factor;
  const g = lower.g + (upper.g - lower.g) * factor;
  const b = lower.b + (upper.b - lower.b) * factor;

  return [r, g, b];
}

/**
 * Creates a 256x1 RGBA DataTexture representing the Magma colormap.
 */
export function createMagmaLutTexture(): DataTexture {
  const width = 256;
  const height = 1;
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    const [r, g, b] = sampleMagmaRgb(t);

    const idx = i * 4;
    data[idx] = Math.round(r * 255);
    data[idx + 1] = Math.round(g * 255);
    data[idx + 2] = Math.round(b * 255);
    data[idx + 3] = 255;
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}

export interface LegendItem {
  id: "elevation" | "slope";
  name: string;
  unit: string;
  min: number;
  max: number;
  ticks: Array<{ value: number; label: string; color: string }>;
}

/**
 * Returns legend metadata matching 2D map styling.
 */
export function getLayerLegend(
  type: "elevation" | "slope",
  minElevation = -4578,
  maxElevation = -2007
): LegendItem {
  if (type === "elevation") {
    const range = maxElevation - minElevation;
    const ticks = [0, 0.25, 0.5, 0.75, 1.0].map((t) => {
      const val = minElevation + t * range;
      const [r, g, b] = sampleCividisRgb(t);
      const hex = `#${Math.round(r * 255).toString(16).padStart(2, "0")}${Math.round(g * 255).toString(16).padStart(2, "0")}${Math.round(b * 255).toString(16).padStart(2, "0")}`;
      return {
        value: val,
        label: `${Math.round(val)}m`,
        color: hex,
      };
    });

    return {
      id: "elevation",
      name: "Elevation (Cividis)",
      unit: "m",
      min: minElevation,
      max: maxElevation,
      ticks,
    };
  } else {
    // Slope in degrees: nominal 0° to 35°
    const maxSlope = 35;
    const ticks = [0, 8, 15, 25, 35].map((val) => {
      const t = val / maxSlope;
      const [r, g, b] = sampleMagmaRgb(t);
      const hex = `#${Math.round(r * 255).toString(16).padStart(2, "0")}${Math.round(g * 255).toString(16).padStart(2, "0")}${Math.round(b * 255).toString(16).padStart(2, "0")}`;
      return {
        value: val,
        label: `${val}°`,
        color: hex,
      };
    });

    return {
      id: "slope",
      name: "Slope (Magma)",
      unit: "deg",
      min: 0,
      max: maxSlope,
      ticks,
    };
  }
}
