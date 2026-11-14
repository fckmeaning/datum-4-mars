import type { LayerMeta } from "../../api/client";

/** One class of a classified raster, as written by the pipeline into the layer sidecar (`classes`). */
export interface ClassBand {
  min: number;
  max: number;
  label: string;
  color: string;
}

function isBand(v: unknown): v is ClassBand {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.min === "number" && typeof o.max === "number" && typeof o.label === "string" && typeof o.color === "string";
}

/** `classes` is passed through from the sidecar JSON but is not part of the generated LayerMeta type: validate, never trust. */
export function readClasses(meta: LayerMeta | undefined): ClassBand[] {
  if (!meta) return [];
  const raw = (meta as LayerMeta & { classes?: unknown }).classes;
  return Array.isArray(raw) ? raw.filter(isBand) : [];
}

/** Class label for an index value (e.g. a walkability value read under the cursor). */
export function classFor(value: number, bands: readonly ClassBand[]): ClassBand | undefined {
  return [...bands].sort((a, b) => b.min - a.min).find((b) => value >= b.min);
}
