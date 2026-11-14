import { describeUnit, type UnitInfo } from "./geology";

export interface GeoUnitTable {
  file: string;
  width: number;
  height: number;
  nodata: number;
  units: Record<string, { sym: string; rgb: string }>;
}

const BASE = "/data/globe/";

/** Pixel lookup in a one-channel unit-id raster (equirectangular, lon -180..180 west to east, lat 90..-90). */
export function unitIdAt(
  ids: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  lat: number,
  lon: number,
  stride = 1,
): number {
  const east = ((((lon + 180) % 360) + 360) % 360) / 360;
  const x = Math.min(width - 1, Math.floor(east * width));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
  return ids[(y * width + x) * stride] ?? 0;
}

export interface GeologyLookup {
  at(lat: number, lon: number): (UnitInfo & { rgb: string }) | null;
}

/** Loads the unit table and raster; resolves null when the data is not deployed. */
export async function loadGeologyLookup(base = BASE): Promise<GeologyLookup | null> {
  try {
    const table = (await (await fetch(`${base}mars_geo_units.json`)).json()) as GeoUnitTable;
    const img = new Image();
    img.src = `${base}${table.file}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = table.width;
    canvas.height = table.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, table.width, table.height);
    const rgba = ctx.getImageData(0, 0, table.width, table.height).data;
    return {
      at(lat, lon) {
        const id = unitIdAt(rgba, table.width, table.height, lat, lon, 4); // R channel of the grey PNG
        if (id === table.nodata) return null;
        const u = table.units[String(id)];
        return u ? { ...describeUnit(u.sym), rgb: u.rgb } : null;
      },
    };
  } catch {
    return null;
  }
}
