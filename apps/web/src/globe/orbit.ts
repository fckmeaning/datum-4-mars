/**
 * orbit.ts - Mars sphere coordinate conversion and placeholder orbiter kinematics.
 * 
 * Conventions:
 * - Planetocentric latitude [-90, +90] deg (+90 = North Pole / +Y, -90 = South Pole / -Y).
 * - East-positive longitude [-180, +180) deg.
 * - +Y is North, +Z is Prime Meridian (0 deg lon), +X is East (+90 deg lon).
 * - Right-handed Cartesian system matching Three.js.
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface OrbiterDef {
  id: string;
  name: string;
  radius: number; // orbital radius in globe units (e.g. 1.15 to 1.35)
  inclinationDeg: number; // orbital inclination in degrees
  raanDeg: number; // Right Ascension of Ascending Node in degrees
  periodSeconds: number; // orbital period in seconds
  color: string; // color hex for trajectory
  badge: "APPROXIMATE"; // P0 placeholder badge
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Converts planetocentric latitude and east-positive longitude to a 3D Cartesian vector.
 * @param latDeg Latitude in degrees [-90, 90]
 * @param lonDeg Longitude in degrees [-180, 180)
 * @param radius Radius of the sphere (default: 1.0)
 */
export function latLonToVector3(latDeg: number, lonDeg: number, radius = 1.0): Vector3D {
  const phi = Math.max(-90, Math.min(90, latDeg)) * DEG2RAD;
  const lambda = lonDeg * DEG2RAD;

  const cosPhi = Math.cos(phi);
  return {
    x: radius * cosPhi * Math.sin(lambda),
    y: radius * Math.sin(phi),
    z: radius * cosPhi * Math.cos(lambda),
  };
}

/**
 * Converts a 3D Cartesian vector back to planetocentric latitude and east-positive longitude.
 * @param v 3D position vector
 * @returns Object with lat [-90, 90], lon [-180, 180), and radial distance
 */
export function vector3ToLatLon(v: Vector3D): { lat: number; lon: number; r: number } {
  const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (r === 0) {
    return { lat: 0, lon: 0, r: 0 };
  }

  const sinPhi = Math.max(-1, Math.min(1, v.y / r));
  const lat = Math.asin(sinPhi) * RAD2DEG;
  const lon = Math.atan2(v.x, v.z) * RAD2DEG;

  return { lat, lon, r };
}

/**
 * Computes great-circle angular distance in radians between two points on the sphere.
 */
export function greatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const dPhi = (lat2 - lat1) * DEG2RAD;
  const dLambda = (lon2 - lon1) * DEG2RAD;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, Math.min(1, a))), Math.sqrt(Math.max(0, 1 - a)));
  return c;
}

/**
 * Computes the 3D position of an orbiter at a given epoch using circular Keplerian motion.
 * @param orbiter Orbiter orbital parameters
 * @param timeSeconds Time in seconds since reference epoch
 */
export function computeOrbiterPosition(orbiter: OrbiterDef, timeSeconds: number): Vector3D {
  const r = orbiter.radius;
  const period = Math.max(1, orbiter.periodSeconds);
  const theta = (2 * Math.PI * (timeSeconds % period)) / period; // true anomaly

  const inc = orbiter.inclinationDeg * DEG2RAD;
  const raan = orbiter.raanDeg * DEG2RAD;

  // In orbital plane: x_orb = r*cos(theta), z_orb = r*sin(theta)
  // Inclination tilt around X axis:
  const x1 = r * Math.cos(theta);
  const y1 = r * Math.sin(theta) * Math.sin(inc);
  const z1 = r * Math.sin(theta) * Math.cos(inc);

  // RAAN rotation around Y axis (North):
  const cosRaan = Math.cos(raan);
  const sinRaan = Math.sin(raan);

  const x = x1 * cosRaan + z1 * sinRaan;
  const y = y1;
  const z = -x1 * sinRaan + z1 * cosRaan;

  return { x, y, z };
}

/**
 * Generates an array of 3D points forming a closed orbit line.
 * @param orbiter Orbiter parameters
 * @param segments Number of line segments (default: 64)
 */
export function generateOrbitTrackPoints(orbiter: OrbiterDef, segments = 64): Vector3D[] {
  const points: Vector3D[] = [];
  const dt = orbiter.periodSeconds / segments;
  for (let i = 0; i <= segments; i++) {
    points.push(computeOrbiterPosition(orbiter, i * dt));
  }
  return points;
}

/**
 * Pre-configured active Mars orbiters for P0 approximate visualization.
 * Okabe-Ito color palette compliant.
 */
export const DEFAULT_ORBITERS: OrbiterDef[] = [
  {
    id: "mro",
    name: "Mars Reconnaissance Orbiter (MRO)",
    radius: 1.18,
    inclinationDeg: 93.0,
    raanDeg: 45.0,
    periodSeconds: 6720, // ~1.87 hours
    color: "#56B4E9", // Sky blue
    badge: "APPROXIMATE",
  },
  {
    id: "odyssey",
    name: "2001 Mars Odyssey",
    radius: 1.22,
    inclinationDeg: 93.1,
    raanDeg: 135.0,
    periodSeconds: 7200, // ~2.0 hours
    color: "#E69F00", // Orange
    badge: "APPROXIMATE",
  },
  {
    id: "tgo",
    name: "ExoMars TGO",
    radius: 1.20,
    inclinationDeg: 74.0,
    raanDeg: 210.0,
    periodSeconds: 7200, // ~2.0 hours
    color: "#009E73", // Bluish green
    badge: "APPROXIMATE",
  },
  {
    id: "maven",
    name: "MAVEN",
    radius: 1.32,
    inclinationDeg: 75.0,
    raanDeg: 300.0,
    periodSeconds: 16200, // ~4.5 hours
    color: "#CC79A7", // Reddish purple
    badge: "APPROXIMATE",
  },
  {
    id: "mex",
    name: "Mars Express (MEX)",
    radius: 1.28,
    inclinationDeg: 87.0,
    raanDeg: 350.0,
    periodSeconds: 25200, // ~7.0 hours
    color: "#F0E442", // Yellow
    badge: "APPROXIMATE",
  },
];

/**
 * Orbiter state returned from /api/v1/orbiters/states?utc=...
 */
export interface OrbiterApiState {
  id: string;
  utc: string;
  lat: number;
  lon: number;
  alt_m: number;
  xyz_bodyfixed_m: [number, number, number];
  accuracy: "exact" | "approximate" | "simulated";
}

/**
 * Metadata for known orbiters including display name and Okabe-Ito color.
 */
export const ORBITER_METADATA: Record<string, { name: string; color: string }> = {
  mro: { name: "MRO", color: "#56B4E9" },
  odyssey: { name: "2001 Mars Odyssey", color: "#E69F00" },
  tgo: { name: "ExoMars TGO", color: "#009E73" },
  maven: { name: "MAVEN", color: "#CC79A7" },
  mex: { name: "Mars Express", color: "#F0E442" },
};

/**
 * Interpolates between two orbiter states along the shortest angular path.
 * Handles longitude wrapping across [-180, +180) degrees.
 *
 * @param prev Starting state
 * @param curr Target state
 * @param alpha Progress factor in [0, 1]
 */
export function interpolateOrbiterState(
  prev: OrbiterApiState,
  curr: OrbiterApiState,
  alpha: number
): { lat: number; lon: number; alt_m: number } {
  const a = Math.max(0, Math.min(1, alpha));
  const lat = prev.lat + (curr.lat - prev.lat) * a;

  // Shortest angular difference for longitude in [-180, 180)
  let dLon = curr.lon - prev.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  let lon = prev.lon + dLon * a;
  if (lon >= 180) lon -= 360;
  if (lon < -180) lon += 360;

  const alt_m = prev.alt_m + (curr.alt_m - prev.alt_m) * a;

  return { lat, lon, alt_m };
}

