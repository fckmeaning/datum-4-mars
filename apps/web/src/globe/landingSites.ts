/**
 * landingSites.ts - Martian landing sites catalog and 3D visibility math.
 * 
 * Features:
 * - Gale Crater: open status, highlighted marker.
 * - Other historical sites: open as well; `detail` says whether local terrain data exists (3D) or only orbital imagery (2D).
 * - Geometric horizon & limb culling: checks if a point is on the visible front
 *   hemisphere and within the camera's tangent cone horizon, with a limb margin
 *   to ensure labels never overlap the planetary limb.
 */

import { type Vector3D, latLonToVector3 } from "./orbit";

export interface LandingSite {
  id: string;
  name: string;
  mission: string;
  year: number;
  lat: number;
  lon: number;
  status: "open" | "locked";
  note?: string;
  /** "local": a local elevation model exists (3D and first person are real); "orbital": orbital imagery only (2D). */
  detail?: "local" | "orbital";
}

export const DEFAULT_LANDING_SITES: LandingSite[] = [
  {
    id: "gale",
    name: "Gale Crater",
    mission: "MSL Curiosity",
    year: 2012,
    lat: -4.5895,
    lon: 137.4417,
    status: "open",
    detail: "local",
  },
  {
    id: "jezero",
    name: "Jezero Crater",
    mission: "Mars 2020 Perseverance",
    year: 2021,
    lat: 18.38,
    lon: 77.58,
    status: "open",
    detail: "local",
  },
  {
    id: "meridiani",
    name: "Meridiani Planum",
    mission: "MER-B Opportunity",
    year: 2004,
    lat: -1.95,
    lon: 354.47,
    status: "open",
    detail: "orbital",
  },
  {
    id: "gusev",
    name: "Gusev Crater",
    mission: "MER-A Spirit",
    year: 2004,
    lat: -14.57,
    lon: 175.47,
    status: "open",
    detail: "orbital",
  },
  {
    id: "elysium",
    name: "Elysium Planitia",
    mission: "InSight",
    year: 2018,
    lat: 4.50,
    lon: 135.62,
    status: "open",
    detail: "orbital",
  },
  {
    id: "chryse",
    name: "Chryse Planitia",
    mission: "Viking 1",
    year: 1976,
    lat: 22.48,
    lon: -47.97,
    status: "open",
    detail: "orbital",
  },
  {
    id: "utopia",
    name: "Utopia Planitia",
    mission: "Zhurong / Viking 2",
    year: 2021,
    lat: 25.07,
    lon: 109.93,
    status: "open",
    detail: "orbital",
  },
  {
    id: "ares",
    name: "Ares Vallis",
    mission: "Mars Pathfinder",
    year: 1997,
    lat: 19.33,
    lon: -33.55,
    status: "open",
    detail: "orbital",
  },
];

/**
 * Loads landing sites from /data/landing_sites.json if present; falls back to DEFAULT_LANDING_SITES.
 */
export async function loadLandingSites(): Promise<LandingSite[]> {
  try {
    const res = await fetch("/data/landing_sites.json");
    if (!res.ok) {
      return DEFAULT_LANDING_SITES;
    }
    const data = (await res.json()) as LandingSite[];
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch {
    // Network / fetch error or unavailable in environment
  }
  return DEFAULT_LANDING_SITES;
}

/**
 * Geometric visibility calculation for a site on the sphere.
 * 
 * A site at position P on a sphere of radius R is visible from camera position C iff:
 *   (C - P) . P > 0
 * 
 * In terms of unit vectors n_P = P / ||P|| and n_C = C / ||C||:
 *   cos(theta) = n_P . n_C > R / ||C||
 * 
 * To ensure labels never overlap the planetary limb, a limb margin is added:
 *   n_P . n_C > (R / ||C||) + limbMargin
 * 
 * @param sitePos 3D position of the site (in world or camera-relative space)
 * @param cameraPos 3D position of the camera (in the same space)
 * @param sphereRadius Radius of the globe (default: 1.0)
 * @param limbMargin Minimum angular margin inside the geometric horizon (default: 0.08)
 * @returns true if the site is visible and well inside the limb
 */
export function isSiteVisible(
  sitePos: Vector3D,
  cameraPos: Vector3D,
  sphereRadius = 1.0,
  limbMargin = 0.08
): boolean {
  const camDist = Math.hypot(cameraPos.x, cameraPos.y, cameraPos.z);
  if (camDist <= sphereRadius) {
    return false; // Camera inside or on surface
  }

  const siteDist = Math.hypot(sitePos.x, sitePos.y, sitePos.z);
  if (siteDist <= 0) {
    return false;
  }

  // Dot product of normalized site and camera vectors
  const dot =
    (sitePos.x * cameraPos.x + sitePos.y * cameraPos.y + sitePos.z * cameraPos.z) /
    (siteDist * camDist);

  // Geometric horizon threshold: cos(beta) = sphereRadius / camDist
  const horizonThreshold = sphereRadius / camDist + limbMargin;

  return dot > horizonThreshold;
}

/**
 * Converts a landing site to its 3D position vector on the globe.
 */
export function getSiteVector(site: LandingSite, radius = 1.002): Vector3D {
  return latLonToVector3(site.lat, site.lon, radius);
}
