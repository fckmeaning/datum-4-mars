/**
 * sun.ts - Solar vector calculations, API integration, and hillshade shading.
 * 
 * Conventions:
 * - Azimuth A: clockwise from North (North = -Z, East = +X, South = +Z, West = -X).
 * - Elevation e: degrees above horizon.
 * - Cartesian vector:
 *     x = cos(e) * sin(A)
 *     y = sin(e)
 *     z = -cos(e) * cos(A)
 */

import type { Vector3D } from "./types";

const DEG2RAD = Math.PI / 180;

/**
 * Converts solar azimuth (clockwise from North) and elevation (above horizon)
 * into a normalized 3D light vector in Three.js scene coordinates.
 */
export function sunAnglesToVector3(
  azimuthDeg: number,
  elevationDeg: number
): Vector3D {
  const eRad = elevationDeg * DEG2RAD;
  const aRad = azimuthDeg * DEG2RAD;

  const cosE = Math.cos(eRad);
  const sinE = Math.sin(eRad);

  const x = cosE * Math.sin(aRad);
  const y = sinE;
  const z = -cosE * Math.cos(aRad);

  // Normalize
  const len = Math.hypot(x, y, z);
  if (len === 0) {
    return { x: 0, y: 1, z: 0 };
  }

  return {
    x: x / len,
    y: y / len,
    z: z / len,
  };
}

/**
 * Computes hillshade illumination factor I in [ambient, 1.0] for a surface normal.
 * I = ambient + (1.0 - ambient) * max(dot(N, S), 0.0)
 * On a horizontal plane (N = [0, 1, 0]), dot(N, S) = S.y = sin(elevation).
 */
export function computeHillshade(
  normal: Vector3D,
  sunDir: Vector3D,
  ambient = 0.15
): number {
  const dot = normal.x * sunDir.x + normal.y * sunDir.y + normal.z * sunDir.z;
  const cosIncidence = Math.max(0, dot);
  return ambient + (1.0 - ambient) * cosIncidence;
}

/**
 * Approximate Mars solar position calculation for Gale Crater when offline.
 * Sol duration = 88775.244s.
 */
export function computeApproximateMarsSun(
  utcString: string,
  latDeg = -4.72,
  lonDeg = 137.4
): { azimuth_deg: number; elevation_deg: number } {
  let epochMs: number;
  try {
    epochMs = Date.parse(utcString);
    if (isNaN(epochMs)) epochMs = Date.now();
  } catch {
    epochMs = Date.now();
  }

  // Mars Sol Date approximation (Mars24 epoch J2000)
  const daysSinceJ2000 = (epochMs - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  const msd = (daysSinceJ2000 - 4.5) / 1.027491252 + 44796.0 - 0.00096;
  const msc = (msd % 1 + 1) % 1; // fractional sol in [0, 1]

  // Local True Solar Time (hours in [0, 24])
  const ltst_h = ((msc * 24 + lonDeg / 15) % 24 + 24) % 24;

  // Hour angle H (15° per hour from solar noon at 12:00)
  const H = (ltst_h - 12) * 15 * DEG2RAD;

  // Approximate declination: seasonal variation around -15° to +15°
  const declination = -5.0 * DEG2RAD;
  const phi = latDeg * DEG2RAD;

  // Solar elevation: sin(e) = sin(phi)*sin(delta) + cos(phi)*cos(delta)*cos(H)
  const sinE =
    Math.sin(phi) * Math.sin(declination) +
    Math.cos(phi) * Math.cos(declination) * Math.cos(H);
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinE))) / DEG2RAD;

  // Azimuth clockwise from North:
  // atan2(-cos(delta)*sin(H), sin(delta)*cos(phi) - cos(delta)*cos(H)*sin(phi))
  const cosDelta = Math.cos(declination);
  const sinDelta = Math.sin(declination);
  const numerator = -cosDelta * Math.sin(H);
  const denominator =
    sinDelta * Math.cos(phi) - cosDelta * Math.cos(H) * Math.sin(phi);

  let azimuthDeg = Math.atan2(numerator, denominator) / DEG2RAD;
  if (azimuthDeg < 0) azimuthDeg += 360;

  return { azimuth_deg: azimuthDeg, elevation_deg: elevationDeg };
}

/**
 * Fetches solar state from API /sun with graceful fallback.
 */
export async function fetchSunPosition(
  lat = -4.72,
  lon = 137.4,
  utc = new Date().toISOString()
): Promise<{ azimuth_deg: number; elevation_deg: number }> {
  try {
    const res = await fetch(
      `/api/v1/sun?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&utc=${encodeURIComponent(utc)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      azimuth_deg: data.azimuth_deg ?? 135,
      elevation_deg: data.elevation_deg ?? 45,
    };
  } catch {
    return computeApproximateMarsSun(utc, lat, lon);
  }
}
