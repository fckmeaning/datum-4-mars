/**
 * markers.ts - 3D Waypoint and Place markers on the Gale Crater terrain.
 */

import { Vector3 } from "three";
import type { TerrainRasterData } from "./types";
import { sampleTerrainElevation } from "./terrainLoader";
import { geoToAoi } from "./projection";

export interface Marker3DItem {
  id: string;
  name: string;
  kind: "base" | "science" | "waypoint" | "rover" | "place";
  position: Vector3;
  color: string;
  description?: string;
  normal?: Vector3;
}

export interface PlaceInput {
  id: string;
  name: string;
  kind?: string;
  lat: number;
  lon: number;
  science_target?: boolean;
  description?: string;
}

export interface WaypointInput {
  role?: "start" | "via" | "science" | "goal";
  lat?: number | null;
  lon?: number | null;
  place_id?: string | null;
}

/**
 * Maps waypoint role to marker color (Okabe-Ito compliant).
 */
export function getWaypointRoleColor(role?: string): string {
  switch (role) {
    case "start":
      return "#3FB950"; // Green
    case "goal":
      return "#F85149"; // Red
    case "science":
      return "#CC79A7"; // Science Purple
    case "via":
    default:
      return "#E69F00"; // Orange
  }
}

/**
 * Computes the finite-difference terrain surface normal at a given scene (x, z) coordinate.
 */
export function sampleTerrainNormal(
  terrain: TerrainRasterData,
  sceneX: number,
  sceneZ: number,
  verticalExaggeration = 1.0,
  eps = 5.0
): Vector3 {
  const eL = sampleTerrainElevation(terrain, sceneX - eps, sceneZ);
  const eR = sampleTerrainElevation(terrain, sceneX + eps, sceneZ);
  const eD = sampleTerrainElevation(terrain, sceneX, sceneZ - eps);
  const eU = sampleTerrainElevation(terrain, sceneX, sceneZ + eps);

  const dEdX = ((eR - eL) / (2 * eps)) * verticalExaggeration;
  const dEdZ = ((eU - eD) / (2 * eps)) * verticalExaggeration;

  return new Vector3(-dEdX, 1.0, -dEdZ).normalize();
}

/**
 * Builds 3D marker positions clamped to the terrain surface + vertical offset.
 */
export function buildPlaceMarkers(
  places: PlaceInput[],
  terrain: TerrainRasterData,
  verticalExaggeration = 2.0,
  yOffset = 2.0
): Marker3DItem[] {
  return places.map((place) => {
    const [aoiX, aoiY] = geoToAoi(place.lat, place.lon);
    const sceneX = aoiX;
    const sceneZ = -aoiY;

    const rawElev = sampleTerrainElevation(terrain, sceneX, sceneZ);
    const surfaceY = (rawElev - terrain.minElevation) * verticalExaggeration;

    let kind: Marker3DItem["kind"] = "place";
    let color = "#58A6FF"; // Info blue

    if (place.kind === "base" || place.id.includes("base")) {
      kind = "base";
      color = "#3FB950"; // Habitat green
    } else if (place.science_target || place.id.includes("boxwork")) {
      kind = "science";
      color = "#CC79A7"; // Science magenta
    } else if (place.id.includes("rover")) {
      kind = "rover";
      color = "#E06A3B"; // Mars ochre
    }

    const normal =
      kind === "rover"
        ? sampleTerrainNormal(terrain, sceneX, sceneZ, verticalExaggeration)
        : undefined;

    return {
      id: place.id,
      name: place.name,
      kind,
      position: new Vector3(sceneX, surfaceY + yOffset, sceneZ),
      color,
      description: place.description,
      normal,
    };
  });
}

/**
 * Builds 3D markers from route waypoints.
 */
export function buildWaypointMarkers(
  waypoints: WaypointInput[],
  terrain: TerrainRasterData,
  verticalExaggeration = 2.0,
  yOffset = 2.5
): Marker3DItem[] {
  const result: Marker3DItem[] = [];

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i]!;
    if (wp.lat === undefined || wp.lat === null || wp.lon === undefined || wp.lon === null) continue;

    const [aoiX, aoiY] = geoToAoi(wp.lat, wp.lon);
    const sceneX = aoiX;
    const sceneZ = -aoiY;

    const rawElev = sampleTerrainElevation(terrain, sceneX, sceneZ);
    const surfaceY = (rawElev - terrain.minElevation) * verticalExaggeration;

    const role = wp.role ?? (i === 0 ? "start" : i === waypoints.length - 1 ? "goal" : "via");
    const color = getWaypointRoleColor(role);

    result.push({
      id: `wp-${i}-${role}`,
      name: `WP ${i + 1}: ${role.toUpperCase()}`,
      kind: "waypoint",
      position: new Vector3(sceneX, surfaceY + yOffset, sceneZ),
      color,
    });
  }

  return result;
}
