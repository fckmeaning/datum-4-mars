/**
 * Route export in the browser: an API `RouteResult` as an RFC 7946 FeatureCollection.
 * Port of packages/marsnav/src/marsnav/export.py `route_to_geojson` (no `crs` member; Mars sphere and planetocentric latitude
 * are stated in `properties.coordinate_note`). The server version can also sample a DEM for vertices without elevation;
 * here only elevations that the route geometry carries are used, and a 2-D line is written when some are missing.
 */
import { R_SPHERE_M } from "./marsTime";

const SNAP_TOLERANCE_M = 300.0;
const ELEVATION_MATCH_M = 50.0;
const COORD_DECIMALS = 7;
const ELEVATION_DECIMALS = 2;
const CONTRACT_VERSION = 1;
export const GENERATOR = `datum-4 static export (API contract v${CONTRACT_VERSION})`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
export interface ExportWaypoint {
  lat: number;
  lon: number;
  role?: string;
  dwell_min?: number;
  name?: string;
  place_id?: string;
}

const lon180 = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
const roundTo = (v: number, nd: number) => Number(v.toFixed(nd));

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_SPHERE_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function position(lon: number, lat: number, z: number | null): number[] {
  if (!(lat >= -90 && lat <= 90)) throw new RangeError(`latitude ${lat} is outside [-90, 90]`);
  const p = [roundTo(lon180(lon), COORD_DECIMALS), roundTo(lat, COORD_DECIMALS)];
  if (z !== null) p.push(roundTo(z, ELEVATION_DECIMALS));
  return p;
}

function nearest(lat: number, lon: number, pts: Array<[number, number]>): { i: number; d: number } {
  let bi = 0;
  let bd = Infinity;
  pts.forEach(([la, lo], i) => {
    const d = haversineM(lat, lon, la, lo);
    if (d < bd) {
      bi = i;
      bd = d;
    }
  });
  return { i: bi, d: bd };
}

/** JSON-safe copy: NaN and infinity become null. */
function clean<T>(v: T): T {
  if (typeof v === "number") return (Number.isFinite(v) ? v : null) as T;
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Json).map(([k, x]) => [k, clean(x)])) as T;
  return v;
}

function isoPlus(t: string | null | undefined, seconds: number): string | null {
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms + seconds * 1000).toISOString().replace(/\.\d+Z$/, "Z") : null;
}

export function routeToGeoJson(route: Json, waypoints?: ExportWaypoint[] | null, opts: { includeSegments?: boolean; name?: string } = {}): Json {
  const includeSegments = opts.includeSegments ?? true;
  const geom = route.geometry ?? {};
  const coords: number[][] = geom.coordinates ?? [];
  if (geom.type !== "LineString" || coords.length < 2) throw new Error("route has no LineString geometry with at least two vertices");
  const gpts = coords.map((c) => [Number(c[1]), Number(c[0])] as [number, number]);
  const gz = coords.map((c) => (c.length > 2 && c[2] != null && Number.isFinite(Number(c[2])) ? Number(c[2]) : null));

  const elevFor = (lat: number, lon: number): number | null => {
    const { i, d } = nearest(lat, lon, gpts);
    return d <= ELEVATION_MATCH_M ? (gz[i] ?? null) : null;
  };
  const useZ = gz.every((z) => z !== null);
  const line = gpts.map(([lat, lon], i) => position(lon, lat, useZ ? gz[i]! : null));

  const segs: Json[] = route.segments ?? [];
  const nodes: Array<[number, number]> = [];
  const cumD = [0];
  const cumT = [0];
  if (segs.length) {
    nodes.push([segs[0]!.start.lat, segs[0]!.start.lon]);
    for (const s of segs) {
      nodes.push([s.end.lat, s.end.lon]);
      cumD.push(cumD[cumD.length - 1]! + Number(s.length_m ?? 0));
      cumT.push(cumT[cumT.length - 1]! + Number(s.duration_s ?? 0));
    }
  }

  const dataLevels: string[] = [...(route.data_levels ?? [])];
  const simInputs: string[] = [...(route.simulated_inputs ?? [])];
  const simulated = simInputs.length > 0 || dataLevels.includes("L0");
  const approximate = route.accuracy === "approximate" || !!route.approximate;

  const features: Json[] = [
    {
      type: "Feature",
      id: route.route_id,
      properties: clean({
        featureType: "MarsRoute",
        route_id: route.route_id,
        site_id: route.site_id,
        profile: route.profile,
        verdict: route.verdict,
        feasible: route.feasibility?.ok,
        violations: route.feasibility?.violations ?? [],
        totals: route.totals ?? {},
        waypoint_order: route.waypoint_order,
        uncertainty: route.uncertainty,
        data_levels: dataLevels,
        simulated_inputs: simInputs,
        assumptions: route.assumptions ?? [],
        simulated,
        approximate,
      }),
      geometry: { type: "LineString", coordinates: line },
    },
  ];

  let wps: Array<{ w: ExportWaypoint; src: number }>;
  if (waypoints && waypoints.length) {
    const order: number[] | undefined = route.waypoint_order;
    const isPerm = Array.isArray(order) && order.length === waypoints.length && [...order].sort((a, b) => a - b).every((v, i) => v === i);
    const idx = isPerm ? order! : waypoints.map((_, i) => i);
    wps = idx.map((src) => {
      const w = waypoints[src]!;
      if (w.lat == null || w.lon == null) throw new Error(`waypoint ${src} has no lat/lon; resolve places to coordinates before exporting`);
      return { w, src };
    });
  } else {
    const first = gpts[0]!;
    const last = gpts[gpts.length - 1]!;
    wps = [
      { w: { lat: first[0], lon: first[1], role: "start" }, src: 0 },
      { w: { lat: last[0], lon: last[1], role: "goal" }, src: 1 },
    ];
  }

  wps.forEach(({ w, src }, stop) => {
    const lat = Number(w.lat);
    const lon = Number(w.lon);
    const props: Json = {
      featureType: "MarsWaypoint",
      stop_index: stop,
      request_index: src,
      name: w.name || w.place_id || `stop ${stop}`,
      role: w.role || (stop === 0 ? "start" : stop === wps.length - 1 ? "goal" : "via"),
      dwell_min: w.dwell_min ?? 0,
    };
    if (nodes.length) {
      const { i: k, d: snap } = nearest(lat, lon, nodes);
      props.snap_distance_m = roundTo(snap, 1);
      if (snap <= SNAP_TOLERANCE_M) {
        const seg = segs[Math.min(k, segs.length - 1)]!;
        Object.assign(props, {
          cumulative_distance_m: roundTo(cumD[k]!, 1),
          cumulative_time_s: roundTo(cumT[k]!, 1),
          t_utc: k < segs.length ? seg.t_start_utc : isoPlus(seg.t_start_utc, Number(seg.duration_s ?? 0)),
          sun: seg.sun,
          temp_K: seg.temp_K,
          dose_rate_mSv_h: seg.dose_rate_mSv_h,
          slope_deg: seg.slope_deg,
          limiting_factor: seg.limiting_factor,
        });
      }
    }
    features.push({ type: "Feature", properties: clean(props), geometry: { type: "Point", coordinates: position(lon, lat, elevFor(lat, lon)) } });
  });

  if (includeSegments) {
    const keys = ["i", "length_m", "duration_s", "slope_deg", "ascent_m", "limiting_factor", "cost", "components", "t_start_utc", "sun", "temp_K", "dose_rate_mSv_h", "energy_kJ", "o2_l"];
    for (const s of segs) {
      const a = s.start;
      const b = s.end;
      const za = useZ ? elevFor(a.lat, a.lon) : null;
      const zb = useZ ? elevFor(b.lat, b.lon) : null;
      const twoD = za === null || zb === null;
      const segProps = Object.fromEntries(keys.map((k) => [k, s[k] ?? null]));
      features.push({
        type: "Feature",
        properties: clean({ featureType: "MarsRouteSegment", ...segProps }),
        geometry: { type: "LineString", coordinates: [position(a.lon, a.lat, twoD ? null : za), position(b.lon, b.lat, twoD ? null : zb)] },
      });
    }
  }

  const lons = line.map((p) => p[0]!);
  const lats = line.map((p) => p[1]!);
  return {
    type: "FeatureCollection",
    name: opts.name || `marsnav_route_${route.route_id ?? "unnamed"}`,
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
    features,
    properties: clean({
      generator: GENERATOR,
      coordinate_note:
        `Positions are [longitude, latitude, elevation]: longitude in degrees EAST in [-180, 180), planetocentric latitude in degrees, ` +
        `elevation in metres from the source DEM (see data_levels) on Mars, a sphere of radius ${R_SPHERE_M.toFixed(0)} m. ` +
        `RFC 7946 names WGS 84 (Earth); these are Mars coordinates, not Earth coordinates. There is no crs member.`,
      body: "Mars",
      sphere_radius_m: R_SPHERE_M,
      latitude_type: "planetocentric",
      longitude_convention: "east positive, [-180, 180)",
      site_id: route.site_id,
      data_levels: dataLevels,
      simulated,
      approximate,
      simulated_inputs: simInputs,
      contract_version: CONTRACT_VERSION,
    }),
  };
}

/** Starts a browser download of a GeoJSON object (`marsnav_route.geojson`). */
export function downloadGeoJson(gj: Json, filename = "marsnav_route.geojson"): void {
  const blob = new Blob([JSON.stringify(gj)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
