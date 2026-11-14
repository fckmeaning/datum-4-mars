/**
 * fpvMath.ts - pure geometry for the first-person (helmet) view.
 *
 * Conventions (same as src/map3d): AOI metres, x = East, y = North; scene X = x, scene Z = -y, scene Y = up.
 * Headings are degrees clockwise from North. Raster rows run from North (row 0) to South, and a raster value sits at the
 * CENTRE of its pixel (a bbox edge is the outer edge of the first/last pixel).
 */

import type { TerrainRasterData } from "../map3d/types";

/** Mars sphere radius [m] (contracts/projection.json, D-04). */
export const MARS_RADIUS_M = 3_396_190;
/** Helmet height above the ground [m]. */
export const EYE_HEIGHT_M = 1.7;
/** The eye never gets closer than this to the ground [m], even while the vertical smoothing lags. */
export const EYE_MIN_CLEARANCE_M = 0.6;
/** Fallback walking speed [m/s] for a segment without a usable duration (matches the model's flat speed order of magnitude). */
export const FALLBACK_SPEED_M_S = 0.8;

const DEG = Math.PI / 180;

export type Dem = Pick<TerrainRasterData, "width" | "height" | "bbox" | "elevation" | "minElevation" | "nodata">;

// ---------------------------------------------------------------- angles

/** Wraps an angle to [0, 360). */
export function wrapDeg360(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Shortest signed difference b - a in (-180, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  let d = wrapDeg360(b - a);
  if (d > 180) d -= 360;
  return d;
}

/**
 * Exponential approach of a heading to a target along the SHORTEST arc (no spin across the 0/360 wrap).
 * tau <= 0 snaps to the target (used for reduced motion).
 */
export function smoothHeadingDeg(current: number, target: number, dtSec: number, tauSec: number): number {
  if (!(tauSec > 0) || !(dtSec > 0)) return wrapDeg360(tauSec > 0 ? current : target);
  const k = 1 - Math.exp(-dtSec / tauSec);
  return wrapDeg360(current + angleDiffDeg(current, target) * k);
}

/** Heading [deg clockwise from North] of an AOI displacement (dx East, dy North). */
export function headingDeg(dx: number, dy: number): number {
  return wrapDeg360(Math.atan2(dx, dy) / DEG);
}

/** Straight-line bearing and distance from (x, y) to (bx, by) in AOI metres (F45-style "back to base" vector). */
export function bearingDistance(x: number, y: number, bx: number, by: number): { bearingDeg: number; distanceM: number } {
  const dx = bx - x;
  const dy = by - y;
  return { bearingDeg: headingDeg(dx, dy), distanceM: Math.hypot(dx, dy) };
}

// ---------------------------------------------------------------- terrain

/** F04 - height by which the surface falls away from the local horizontal plane at distance d: d^2 / (2R). */
export function curvatureDropM(distM: number, radiusM = MARS_RADIUS_M): number {
  return (distM * distM) / (2 * radiusM);
}

/** Bilinear elevation [m] at AOI (x, y); the position is clamped to the raster, nodata falls back to the minimum. */
export function demHeight(dem: Dem, x: number, y: number): number {
  const [minX, minY, maxX, maxY] = dem.bbox;
  const col = clamp(((x - minX) / (maxX - minX)) * dem.width - 0.5, 0, dem.width - 1);
  const row = clamp(((maxY - y) / (maxY - minY)) * dem.height - 0.5, 0, dem.height - 1);
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const c1 = Math.min(dem.width - 1, c0 + 1);
  const r1 = Math.min(dem.height - 1, r0 + 1);
  const fx = col - c0;
  const fy = row - r0;
  const at = (r: number, c: number): number => {
    const v = dem.elevation[r * dem.width + c];
    return v === undefined || !Number.isFinite(v) || v <= dem.nodata + 100 ? dem.minElevation : v;
  };
  const top = at(r0, c0) * (1 - fx) + at(r0, c1) * fx;
  const bottom = at(r1, c0) * (1 - fx) + at(r1, c1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** True when (x, y) lies inside the raster extent. */
export function insideDem(dem: Dem, x: number, y: number): boolean {
  const [minX, minY, maxX, maxY] = dem.bbox;
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/** Local slope [deg, positive uphill] along a heading, from a central difference over +-baseM metres. */
export function slopeAlongHeadingDeg(dem: Dem, x: number, y: number, hDeg: number, baseM = 10): number {
  const sx = Math.sin(hDeg * DEG);
  const sy = Math.cos(hDeg * DEG);
  const ahead = demHeight(dem, x + sx * baseM, y + sy * baseM);
  const behind = demHeight(dem, x - sx * baseM, y - sy * baseM);
  return Math.atan2(ahead - behind, 2 * baseM) / DEG;
}

/**
 * Elevation angle [deg] of the terrain horizon seen from an eye at (x, y, eyeElevM) along a heading: the maximum over the ray
 * of atan((terrain - curvature drop - eye) / distance). Only the DEM extent is known; samples outside it are ignored.
 */
export function horizonAngleDeg(dem: Dem, x: number, y: number, eyeElevM: number, hDeg: number, maxDistM = 20000, stepM = 20): number {
  const sx = Math.sin(hDeg * DEG);
  const sy = Math.cos(hDeg * DEG);
  let best = -90;
  for (let d = stepM; d <= maxDistM; d += stepM) {
    const px = x + sx * d;
    const py = y + sy * d;
    if (!insideDem(dem, px, py)) break;
    const a = Math.atan2(demHeight(dem, px, py) - curvatureDropM(d) - eyeElevM, d) / DEG;
    if (a > best) best = a;
  }
  // with no terrain in view the geometric horizon of a sphere dips below horizontal by acos(R / (R + h))
  return best > -90 ? best : -Math.acos(MARS_RADIUS_M / (MARS_RADIUS_M + Math.max(0, EYE_HEIGHT_M))) / DEG;
}

/**
 * Eye elevation [m]: ground + eyeHeight, smoothed vertically so steps in a 10 m DEM do not make the camera jump, but never
 * below ground + EYE_MIN_CLEARANCE_M.
 */
export function eyeElevation(groundM: number, previousEyeM: number | null, dtSec: number, eyeHeightM = EYE_HEIGHT_M, tauSec = 0.25): number {
  const target = groundM + eyeHeightM;
  const smoothed = previousEyeM === null || !(tauSec > 0) || !(dtSec > 0) ? target : previousEyeM + (target - previousEyeM) * (1 - Math.exp(-dtSec / tauSec));
  return Math.max(smoothed, groundM + EYE_MIN_CLEARANCE_M);
}

// ---------------------------------------------------------------- route path

export interface PathSegmentInfo {
  length_m?: number;
  duration_s?: number;
}

export interface PathData {
  xy: Array<[number, number]>;
  /** Cumulative fraction [0, 1] of the route's own segments by length (empty without segment data); see segmentIndexAtDistance. */
  segEdges: number[];
  /** Cumulative distance at each vertex [m] (starts at 0). */
  cumLen: number[];
  /** Cumulative walking time at each vertex [s] (starts at 0). */
  cumTime: number[];
  totalLength: number;
  totalTime: number;
}

/**
 * Builds a distance/time-parametrised polyline.
 *
 * The API's `segments` are the route model's own steps (one per grid move, 118 of them for 78 smoothed vertices), so they
 * generally do NOT correspond one-to-one with the legs of `xy`. Each leg's walking time is therefore taken from the overlap of
 * the leg with the segments along the route, both measured as a fraction of the total length (a segment's time is spread
 * evenly over its length). With equal counts and no lengths the segments are matched by index. Without usable durations the
 * fallback speed is used.
 */
export function buildPathData(xy: ReadonlyArray<ReadonlyArray<number>>, segments: ReadonlyArray<PathSegmentInfo> = []): PathData {
  const pts: Array<[number, number]> = [];
  for (const p of xy) {
    const x = p[0];
    const y = p[1];
    if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
  }
  const legLen: number[] = [];
  for (let i = 1; i < pts.length; i++) legLen.push(Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const geomTotal = legLen.reduce((a, b) => a + b, 0);

  // segment edges as fractions of the total segment length
  const segLen = segments.map((sg) => (sg.length_m !== undefined && Number.isFinite(sg.length_m) && sg.length_m > 0 ? sg.length_m : 0));
  const segTotal = segLen.reduce((a, b) => a + b, 0);
  const useIndex = segments.length === legLen.length && segTotal <= 0;
  const segEdges: number[] = [];
  if (segTotal > 0) {
    let acc = 0;
    segEdges.push(0);
    for (const l of segLen) {
      acc += l;
      segEdges.push(acc / segTotal);
    }
  }

  const cumLen = [0];
  const cumTime = [0];
  let legStart = 0;
  for (let i = 0; i < legLen.length; i++) {
    const len = legLen[i]!;
    let t = NaN;
    if (useIndex) {
      const dur = segments[i]?.duration_s;
      if (dur !== undefined && Number.isFinite(dur) && dur > 0) t = dur;
    } else if (segEdges.length > 1 && geomTotal > 0) {
      const f0 = legStart / geomTotal;
      const f1 = (legStart + len) / geomTotal;
      let sum = 0;
      let ok = true;
      for (let j = 0; j + 1 < segEdges.length; j++) {
        const lo = Math.max(f0, segEdges[j]!);
        const hi = Math.min(f1, segEdges[j + 1]!);
        if (hi <= lo) continue;
        const dur = segments[j]?.duration_s;
        const width = segEdges[j + 1]! - segEdges[j]!;
        if (dur === undefined || !Number.isFinite(dur) || dur <= 0 || width <= 0) {
          ok = false;
          break;
        }
        sum += (dur * (hi - lo)) / width;
      }
      if (ok && sum > 0) t = sum;
    }
    if (!Number.isFinite(t)) t = len / FALLBACK_SPEED_M_S;
    legStart += len;
    cumLen.push(cumLen[i]! + len);
    cumTime.push(cumTime[i]! + t);
  }
  return { xy: pts, segEdges, cumLen, cumTime, totalLength: cumLen[cumLen.length - 1] ?? 0, totalTime: cumTime[cumTime.length - 1] ?? 0 };
}

/**
 * Index of the route segment (as delivered by the API) under a distance along the path; used for per-segment styling.
 * Returns the leg index when the route carries no segment lengths.
 */
export function segmentIndexAtDistance(path: PathData, dist: number): number {
  if (path.segEdges.length < 2 || path.totalLength <= 0) return segmentIndexAt(path.cumLen, clamp(dist, 0, path.totalLength));
  return segmentIndexAt(path.segEdges, clamp(dist / path.totalLength, 0, 1));
}

function segmentIndexAt(cum: number[], value: number): number {
  let lo = 0;
  let hi = cum.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid]! <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface PathState {
  x: number;
  y: number;
  /** Heading of the current leg [deg clockwise from North]. */
  headingDeg: number;
  /** Index of the current leg. */
  seg: number;
  /** Fraction [0, 1] along the current leg. */
  frac: number;
}

/** Position and leg heading at a distance along the path (clamped to [0, totalLength]). */
export function pathStateAtDistance(path: PathData, dist: number): PathState {
  const n = path.xy.length;
  if (n === 0) return { x: 0, y: 0, headingDeg: 0, seg: 0, frac: 0 };
  if (n === 1) return { x: path.xy[0]![0], y: path.xy[0]![1], headingDeg: 0, seg: 0, frac: 0 };
  const d = clamp(dist, 0, path.totalLength);
  const seg = segmentIndexAt(path.cumLen, d);
  const a = path.xy[seg]!;
  const b = path.xy[seg + 1]!;
  const len = path.cumLen[seg + 1]! - path.cumLen[seg]!;
  const frac = len > 0 ? (d - path.cumLen[seg]!) / len : 0;
  return { x: a[0] + (b[0] - a[0]) * frac, y: a[1] + (b[1] - a[1]) * frac, headingDeg: headingDeg(b[0] - a[0], b[1] - a[1]), seg, frac };
}

/** Distance along the path reached after a given walking time [s] (piecewise linear in each leg's duration). */
export function distanceAtTime(path: PathData, tSec: number): number {
  if (path.xy.length < 2) return 0;
  const t = clamp(tSec, 0, path.totalTime);
  const seg = segmentIndexAt(path.cumTime, t);
  const dt = path.cumTime[seg + 1]! - path.cumTime[seg]!;
  const f = dt > 0 ? (t - path.cumTime[seg]!) / dt : 0;
  return path.cumLen[seg]! + (path.cumLen[seg + 1]! - path.cumLen[seg]!) * f;
}

/** Walking time [s] needed to reach a distance along the path (inverse of distanceAtTime). */
export function timeAtDistance(path: PathData, dist: number): number {
  if (path.xy.length < 2) return 0;
  const d = clamp(dist, 0, path.totalLength);
  const seg = segmentIndexAt(path.cumLen, d);
  const len = path.cumLen[seg + 1]! - path.cumLen[seg]!;
  const f = len > 0 ? (d - path.cumLen[seg]!) / len : 0;
  return path.cumTime[seg]! + (path.cumTime[seg + 1]! - path.cumTime[seg]!) * f;
}

/** Speed [m/s] of the leg containing a distance. */
export function pathSpeedAt(path: PathData, dist: number): number {
  if (path.xy.length < 2) return 0;
  const seg = segmentIndexAt(path.cumLen, clamp(dist, 0, path.totalLength));
  const dt = path.cumTime[seg + 1]! - path.cumTime[seg]!;
  return dt > 0 ? (path.cumLen[seg + 1]! - path.cumLen[seg]!) / dt : 0;
}

/** Distance along the path of the point closest to (x, y); used to rejoin the route after free roaming. */
export function nearestDistanceOnPath(path: PathData, x: number, y: number): number {
  let best = Infinity;
  let bestDist = 0;
  for (let i = 0; i < path.xy.length - 1; i++) {
    const a = path.xy[i]!;
    const b = path.xy[i + 1]!;
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const f = len2 > 0 ? clamp(((x - a[0]) * vx + (y - a[1]) * vy) / len2, 0, 1) : 0;
    const d2 = (a[0] + vx * f - x) ** 2 + (a[1] + vy * f - y) ** 2;
    if (d2 < best) {
      best = d2;
      bestDist = path.cumLen[i]! + Math.sqrt(len2) * f;
    }
  }
  return bestDist;
}

/**
 * Cumulative resource used up to a distance along the path. `perSegment[i]` is the amount used on leg i (for example
 * `segments[i].o2_l`); inside a leg the amount grows linearly with distance.
 */
export function cumulativeAlong(path: PathData, perSegment: ReadonlyArray<number | undefined>, dist: number): number {
  if (path.xy.length < 2) return 0;
  const d = clamp(dist, 0, path.totalLength);
  const seg = segmentIndexAt(path.cumLen, d);
  let sum = 0;
  for (let i = 0; i < seg; i++) sum += perSegment[i] ?? 0;
  const len = path.cumLen[seg + 1]! - path.cumLen[seg]!;
  const f = len > 0 ? (d - path.cumLen[seg]!) / len : 0;
  return sum + (perSegment[seg] ?? 0) * f;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
