import type { DataLevel, LayerMeta } from "../api/client";

/**
 * Selects the highest fidelity available data level (L3 > L2 > L1 > L0)
 * from a list of site layers or available levels.
 */
export function selectBestDataLevel(
  layers: LayerMeta[] | DataLevel[],
): DataLevel {
  const levels = new Set<string>();

  for (const item of layers) {
    if (typeof item === "string") {
      levels.add(item);
    } else if (item.level) {
      levels.add(item.level);
    }
  }

  if (levels.has("L3")) return "L3";
  if (levels.has("L2")) return "L2";
  if (levels.has("L1")) return "L1";
  return "L0";
}

/**
 * Finds the elevation layer for the best available level.
 */
export function getBestElevationLayer(layers: LayerMeta[]): LayerMeta | undefined {
  const elevations = layers.filter(
    (l) => l.family === "topography" && (l.id.includes("elevation") || l.name.toLowerCase().includes("elevation")),
  );
  if (elevations.length === 0) return undefined;
  const bestLevel = selectBestDataLevel(elevations);
  return elevations.find((l) => l.level === bestLevel) || elevations[0];
}

/** Best (highest level) layer among those matching `pick`; ties resolved to the first. */
export function getBestLayer(layers: LayerMeta[], pick: (l: LayerMeta) => boolean): LayerMeta | undefined {
  const found = layers.filter(pick);
  if (found.length === 0) return undefined;
  const bestLevel = selectBestDataLevel(found);
  return found.find((l) => l.level === bestLevel) ?? found[0];
}

/** Classified walkability raster (id `gale.<level>.walkability`). */
export function getWalkabilityLayer(layers: LayerMeta[]): LayerMeta | undefined {
  return getBestLayer(layers, (l) => l.id.includes("walkability") && !!l.cog_url);
}

/** Static optical basemap (not one of the dated TIME-MARS snapshots). */
export function getOpticalLayer(layers: LayerMeta[]): LayerMeta | undefined {
  return getBestLayer(layers, (l) => l.family === "optical" && !l.time_dependent && !!l.cog_url);
}

/**
 * Key under which the store keeps the visibility/opacity of a layer from the API list. The map reads canonical keys
 * (elevation, optical, walkability); anything else keeps its own id.
 */
export function stateKeyFor(layer: LayerMeta): string {
  if (layer.id.includes("elevation") || (layer.family === "topography" && layer.name.toLowerCase().includes("elevation"))) return "elevation";
  if (layer.id.includes("walkability")) return "walkability";
  if (layer.family === "optical" && !layer.time_dependent) return "optical";
  return layer.id;
}
