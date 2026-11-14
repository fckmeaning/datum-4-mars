/** Global data layers drawn over the orbital globe (see data/pipeline/make_globe_layers.py). */

export const OVERLAY_IDS = ["topo", "thermal", "slope", "radiation", "pressure", "hazard"] as const;
export type OverlayId = (typeof OVERLAY_IDS)[number];

const BASE = "/data/globe/";

export const OVERLAY_TEXTURE_URL: Record<OverlayId, string> = {
  topo: `${BASE}mars_topo_4k.jpg`,
  thermal: `${BASE}mars_thermal_4k.jpg`,
  slope: `${BASE}mars_slope_color.jpg`,
  radiation: `${BASE}mars_radiation_color.jpg`,
  pressure: `${BASE}mars_pressure_color.jpg`,
  hazard: `${BASE}mars_hazard_color.jpg`,
};

/** Dock layer id -> overlay slot (the 2D map's own "elevation" layer is a different thing and is not mapped). */
export const DOCK_TO_OVERLAY: Record<string, OverlayId | undefined> = {
  topo: "topo",
  thermal: "thermal",
  slope: "slope",
  radiation: "radiation",
  pressure: "pressure",
  hazard: "hazard",
};

export interface LayerMeta {
  name: string;
  unit: string;
  min?: number;
  max?: number;
  digits?: number;
  modeled: boolean;
  source: string;
  ramp?: string[];
  value?: string;
  file?: string;
  offset?: number;
}
export type LayerMetaTable = Record<string, LayerMeta>;

/** value = min + byte/255 * (max - min) */
export function valueFromByte(byte: number, min: number, max: number): number {
  return min + (Math.max(0, Math.min(255, byte)) / 255) * (max - min);
}

export function formatLayerValue(v: number, meta: LayerMeta): string {
  const s = v.toFixed(meta.digits ?? 1);
  return meta.unit ? `${s} ${meta.unit}` : s;
}

export async function loadLayerMeta(base = BASE): Promise<LayerMetaTable | null> {
  try {
    const res = await fetch(`${base}mars_layers.json`);
    if (!res.ok) return null;
    return (await res.json()) as LayerMetaTable;
  } catch {
    return null;
  }
}

async function readRaster(url: string): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

function pixelIndex(width: number, height: number, lat: number, lon: number): number {
  const east = ((((lon + 180) % 360) + 360) % 360) / 360;
  const x = Math.min(width - 1, Math.floor(east * width));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
  return (y * width + x) * 4;
}

export interface ValueSampler {
  at(lat: number, lon: number): number;
}

/** Cursor readout for one modeled layer (8-bit value raster) or for elevation (16-bit in R, G). */
export async function loadValueSampler(id: string, meta: LayerMeta, base = BASE): Promise<ValueSampler | null> {
  if (id === "elevation" && meta.file) {
    const r = await readRaster(base + meta.file);
    if (!r) return null;
    const off = meta.offset ?? 32768;
    return { at: (lat, lon) => {
      const i = pixelIndex(r.width, r.height, lat, lon);
      return (r.data[i] ?? 0) * 256 + (r.data[i + 1] ?? 0) - off;
    } };
  }
  if (!meta.value || meta.min === undefined || meta.max === undefined) return null;
  const r = await readRaster(base + meta.value);
  if (!r) return null;
  const { min, max } = meta;
  return { at: (lat, lon) => valueFromByte(r.data[pixelIndex(r.width, r.height, lat, lon)] ?? 0, min, max) };
}

/** CSS gradient for a legend bar. */
export function rampGradient(ramp: string[]): string {
  return `linear-gradient(90deg, ${ramp.join(", ")})`;
}
