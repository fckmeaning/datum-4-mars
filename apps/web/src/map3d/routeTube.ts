/**
 * routeTube.ts - Route tube generation 1m above terrain with per-segment limiting-factor colors
 * and Curiosity traverse track line processing.
 */

import { Vector3, Color } from "three";
import type { TerrainRasterData } from "./types";
import { sampleTerrainElevation } from "./terrainLoader";
import { geoToAoi } from "./projection";

/**
 * Maps a segment's limiting factor or profile to design token colors (WCAG AA compliant).
 */
export function getLimitingFactorColor(
  limitingFactor?: string,
  profile?: string
): string {
  if (limitingFactor) {
    const factor = limitingFactor.toLowerCase();
    if (factor.includes("slope") || factor.includes("hazard") || factor.includes("step")) {
      return "#F85149"; // --color-danger
    }
    if (factor.includes("energy") || factor.includes("metabolic") || factor.includes("o2")) {
      return "#D29922"; // --color-warning
    }
    if (factor.includes("dose") || factor.includes("radiation") || factor.includes("sep")) {
      return "#BC8CFF"; // --badge-approximate-text
    }
    if (factor.includes("time") || factor.includes("speed")) {
      return "#58A6FF"; // --color-info
    }
    if (factor.includes("thermal") || factor.includes("temp")) {
      return "#E06A3B"; // --color-accent
    }
    if (factor.includes("safe") || factor.includes("nominal")) {
      return "#3FB950"; // --color-ok
    }
  }

  // Fallback to route profile colors (Okabe-Ito colorblind-safe)
  switch (profile?.toUpperCase()) {
    case "SAFEST":
      return "#009E73"; // Green
    case "BALANCED":
      return "#E69F00"; // Orange
    case "SCIENCE":
      return "#CC79A7"; // Purple/Pink
    case "FASTEST":
    default:
      return "#56B4E9"; // Sky Blue
  }
}

export interface RouteSegment3D {
  start: Vector3;
  end: Vector3;
  midpoint: Vector3;
  length: number;
  direction: Vector3;
  color: string;
  limitingFactor?: string;
}

/**
 * Builds 3D route segment data positioned 1 meter above the terrain surface.
 * @param xy Array of AOI [x, y] coordinates in meters
 * @param segments Segment metadata from RouteResult with limiting_factor
 * @param terrain Terrain raster data for surface height sampling
 * @param verticalExaggeration Vertical exaggeration factor
 * @param profile Optional route profile name
 * @param clearanceHeight Height offset above terrain surface in meters (default: 1.0m)
 */
export function buildRouteTubeSegments(
  xy: Array<[number, number]>,
  segments: Array<{ limiting_factor?: string; length_m?: number }> = [],
  terrain: TerrainRasterData,
  verticalExaggeration = 2.0,
  profile = "FASTEST",
  clearanceHeight = 1.0
): RouteSegment3D[] {
  if (xy.length < 2) return [];

  const points3D: Vector3[] = [];

  for (let i = 0; i < xy.length; i++) {
    const pt = xy[i]!;
    const sceneX = pt[0];
    const sceneZ = -pt[1]; // scene Z is -AOI y
    const rawElev = sampleTerrainElevation(terrain, sceneX, sceneZ);
    const surfaceY = (rawElev - terrain.minElevation) * verticalExaggeration;
    points3D.push(new Vector3(sceneX, surfaceY + clearanceHeight, sceneZ));
  }

  const result: RouteSegment3D[] = [];

  for (let i = 0; i < points3D.length - 1; i++) {
    const start = points3D[i]!;
    const end = points3D[i + 1]!;

    const dir = new Vector3().subVectors(end, start);
    const len = dir.length();
    if (len === 0) continue;
    dir.normalize();

    const midpoint = new Vector3().addVectors(start, end).multiplyScalar(0.5);

    const segMeta = segments[i];
    const limitingFactor = segMeta?.limiting_factor;
    const color = getLimitingFactorColor(limitingFactor, profile);

    result.push({
      start,
      end,
      midpoint,
      length: len,
      direction: dir,
      color,
      limitingFactor,
    });
  }

  return result;
}

/**
 * Converts Curiosity traverse GeoJSON coordinates [lon, lat, elev]
 * into 3D scene points 0.5m above the terrain surface.
 */
export function buildTraversePathPoints(
  geoCoords: Array<[number, number, number?]>,
  terrain: TerrainRasterData,
  verticalExaggeration = 2.0,
  clearanceHeight = 0.5
): Vector3[] {
  const points: Vector3[] = [];

  for (let i = 0; i < geoCoords.length; i++) {
    const coord = geoCoords[i]!;
    const lon = coord[0];
    const lat = coord[1];
    const [aoiX, aoiY] = geoToAoi(lat, lon);
    const sceneX = aoiX;
    const sceneZ = -aoiY;

    const rawElev = sampleTerrainElevation(terrain, sceneX, sceneZ);
    const surfaceY = (rawElev - terrain.minElevation) * verticalExaggeration;

    points.push(new Vector3(sceneX, surfaceY + clearanceHeight, sceneZ));
  }

  return points;
}
