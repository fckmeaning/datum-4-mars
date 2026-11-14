import { greatCircleDistance, latLonToVector3 } from "./orbit";

/** NASA Human Landing Sites Workshop (Oct 2015, USGS compilation): proposed Exploration Zones. */
export const ZONE_RADIUS_KM = 100;
export const ZONES_SOURCE = "NASA Human Landing Sites Workshop, Oct 2015 (USGS compilation)";
const MARS_RADIUS_KM = 3396.19;

export interface ExplorationZone {
  name: string;
  lat: number;
  lon: number;
}

const RAW: ReadonlyArray<readonly [string, number, number]> = [
  ["E. Melas Chasma", -11.7, -70.0],
  ["Coprates Chasma", -11.7, -66.6],
  ["Viking", 22.3, -48.3],
  ["Acidalia Planitia", 20.0, -40.0],
  ["NE Marineris", -4.1, -35.2],
  ["SE Marineris", -18.8, -49.2],
  ["Gale Crater", -4.6, 137.4],
  ["S. Meridiani Planum", -3.2, -4.5],
  ["Gusev-Apollinaris Sulci", -13.0, 175.0],
  ["Zephyria Planum", -1.4, 157.1],
  ["Hebrus Valles", 20.1, 126.6],
  ["Hypanis Delta", 11.7, -45.3],
  ["Jezero-Isidis-Syrtis", 17.7, 77.0],
  ["Nili Fossae", 22.1, 77.0],
  ["Aram Chaos", 2.4, -20.0],
  ["Cerberus", 10.0, 162.0],
  ["S. Nectaris Fossae", -28.9, -59.7],
  ["Hadriacus Palus", -26.8, 77.5],
  ["Mawrth Vallis", 24.3, -19.2],
  ["McLaughlin Crater", 21.9, -22.4],
  ["Arabia Terra", 0.4, -8.3],
  ["Columbus Crater", -29.0, -166.0],
  ["Huygens Crater", -13.5, 55.5],
  ["Noctis Landing", -6.5, -92.5],
  ["Deuteronilus Mensae", 39.1, 23.2],
  ["E. Hellas", -40.0, 104.0],
  ["Ismenius Cavus", 33.8, 17.2],
  ["Hale Crater", -35.8, -36.3],
  ["Noachis Terra Chloride", -37.2, -9.5],
  ["Arcadia Planitia (W)", 39.0, 172.0],
  ["Erebus Montes", 39.0, -167.9],
  ["Acheron Fossae", 39.8, -139.4],
  ["Newton Crater", -40.6, -160.0],
  ["Protonilus Mensae", 42.2, 48.1],
  ["Arcadia Planitia (E)", 46.2, -171.2],
  ["Copernicus Crater", -49.2, -169.2],
  ["Ausonia Cavus", -32.0, 96.5],
  ["Kasei Valles", 24.8, -72.6],
];

export const EXPLORATION_ZONES: readonly ExplorationZone[] = RAW.map(([name, lat, lon]) => ({ name, lat, lon }));

/** Distance in km along the surface between two lat/lon points. */
export function surfaceDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return greatCircleDistance(lat1, lon1, lat2, lon2) * MARS_RADIUS_KM;
}

/** The zone whose 100 km disc contains the point (nearest centre if several), or null. */
export function zoneAt(lat: number, lon: number): { zone: ExplorationZone; distanceKm: number } | null {
  let best: { zone: ExplorationZone; distanceKm: number } | null = null;
  for (const zone of EXPLORATION_ZONES) {
    const d = surfaceDistanceKm(lat, lon, zone.lat, zone.lon);
    if (d <= ZONE_RADIUS_KM && (!best || d < best.distanceKm)) best = { zone, distanceKm: d };
  }
  return best;
}

/**
 * Points of a small circle of the given surface radius around (lat, lon), on a sphere of the given
 * radius, as a closed polyline (first point repeated at the end is NOT included).
 */
export function ringPoints(
  lat: number,
  lon: number,
  radiusKm: number,
  segments = 64,
  sphereRadius = 1.002,
): Array<{ x: number; y: number; z: number }> {
  const ang = radiusKm / MARS_RADIUS_KM;
  const c = latLonToVector3(lat, lon, 1);
  // orthonormal basis (u, v) tangent at the centre
  const north = { x: 0, y: 1, z: 0 };
  let ux = north.y * c.z - north.z * c.y;
  let uy = north.z * c.x - north.x * c.z;
  let uz = north.x * c.y - north.y * c.x;
  const un = Math.hypot(ux, uy, uz) || 1;
  ux /= un;
  uy /= un;
  uz /= un;
  const vx = c.y * uz - c.z * uy;
  const vy = c.z * ux - c.x * uz;
  const vz = c.x * uy - c.y * ux;
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    pts.push({
      x: sphereRadius * (c.x * ca + sa * (ct * ux + st * vx)),
      y: sphereRadius * (c.y * ca + sa * (ct * uy + st * vy)),
      z: sphereRadius * (c.z * ca + sa * (ct * uz + st * vz)),
    });
  }
  return pts;
}
