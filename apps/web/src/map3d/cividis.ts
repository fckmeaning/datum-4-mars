/**
 * cividis.ts - Perceptually uniform, color-blind friendly Cividis colormap LUT for Three.js.
 * 
 * Provides:
 * - A 256x1 RGBA DataTexture for GPU shader sampling.
 * - CPU color sampler for UI and legend generation.
 */

import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  ClampToEdgeWrapping,
} from "three";

/**
 * Key control points for the Cividis colormap (RGB in [0, 1]).
 * Derived from the official Nuñez et al. (PLOS ONE 2017) cividis definition.
 */
const CIVIDIS_STOPS: Array<{ t: number; r: number; g: number; b: number }> = [
  { t: 0.0, r: 0.0, g: 0.125, b: 0.302 }, // Dark indigo/blue
  { t: 0.125, r: 0.075, g: 0.208, b: 0.408 },
  { t: 0.25, r: 0.188, g: 0.294, b: 0.463 },
  { t: 0.375, r: 0.306, g: 0.38, b: 0.49 },
  { t: 0.5, r: 0.435, g: 0.467, b: 0.498 }, // Mid neutral teal-grey
  { t: 0.625, r: 0.573, g: 0.561, b: 0.478 },
  { t: 0.75, r: 0.722, g: 0.667, b: 0.424 },
  { t: 0.875, r: 0.875, g: 0.784, b: 0.329 },
  { t: 1.0, r: 0.996, g: 0.918, b: 0.275 }, // Bright yellow
];

/**
 * Samples the Cividis colormap at normalized position t in [0, 1].
 * Returns [r, g, b] with components in [0, 1].
 */
export function sampleCividisRgb(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));

  // Find surrounding stops
  let lower = CIVIDIS_STOPS[0]!;
  let upper = CIVIDIS_STOPS[CIVIDIS_STOPS.length - 1]!;

  for (let i = 0; i < CIVIDIS_STOPS.length - 1; i++) {
    const s0 = CIVIDIS_STOPS[i]!;
    const s1 = CIVIDIS_STOPS[i + 1]!;
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
 * Creates a 256x1 RGBA DataTexture representing the Cividis color ramp.
 * Memory safe: call texture.dispose() when removing the scene.
 */
export function createCividisLutTexture(): DataTexture {
  const width = 256;
  const height = 1;
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    const [r, g, b] = sampleCividisRgb(t);

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
