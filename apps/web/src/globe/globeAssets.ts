/**
 * Shared texture sources of the planet views.
 *
 * The orbital globe (MarsGlobe) and the flat map (flatmap/FlatMarsMap) show the same equirectangular rasters, so the
 * file names, the layer order and the image loading live here once. Images are cached by URL: switching between the two
 * views never downloads or decodes a mosaic twice.
 */
import { OVERLAY_IDS, OVERLAY_TEXTURE_URL, type OverlayId } from "./globeLayers";

export const GLOBE_DATA_BASE = "/data/globe/";
export const MOSAIC_4K_URL = `${GLOBE_DATA_BASE}mars_color_4k.jpg`;
export const MOSAIC_8K_URL = `${GLOBE_DATA_BASE}mars_color_8k.jpg`;
export const GEOLOGY_URL = `${GLOBE_DATA_BASE}mars_geology_4k.jpg`;

/**
 * Order in which the layers are composited over the mosaic: the geologic map first, then the data layers, exactly as in the
 * globe shader (each one multiplies the colour of what is below it, so relief stays readable).
 */
export const COMPOSITE_ORDER = ["geology", ...OVERLAY_IDS] as const;
export type CompositeLayerId = (typeof COMPOSITE_ORDER)[number];

export function compositeUrl(id: CompositeLayerId): string {
  return id === "geology" ? GEOLOGY_URL : OVERLAY_TEXTURE_URL[id as OverlayId];
}

const cache = new Map<string, Promise<HTMLImageElement | null>>();

/** Decoded image for a URL, or null when it is missing (data not deployed). One request per URL. */
export function loadGlobeImage(url: string): Promise<HTMLImageElement | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      cache.delete(url); // a later attempt may succeed (the API was not up yet)
      resolve(null);
    };
    img.src = url;
  });
  cache.set(url, p);
  return p;
}

/** The 8k mosaic needs a 8192 px texture and about 180 MB of GPU memory: skip it on small devices. */
export function canUse8kMosaic(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) return false;
    if (window.matchMedia?.("(pointer: coarse)").matches) return false;
    const gl = document.createElement("canvas").getContext("webgl2") as WebGL2RenderingContext | null;
    const max = Number(gl?.getParameter(gl.MAX_TEXTURE_SIZE));
    return Number.isFinite(max) && max >= 8192;
  } catch {
    return false;
  }
}
