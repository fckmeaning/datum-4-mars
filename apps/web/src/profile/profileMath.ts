/**
 * The route profile: elevation, slope and oxygen along the planned route, and the export of the route as GeoJSON (RFC 7946)
 * and GPX 1.1. Everything is read from a Plan (sites/eva/plan.ts); nothing here recomputes the physics.
 */

import type { Plan } from "../sites/eva/plan";

export interface ProfilePoint {
  /** distance along the ground [km], time [h], elevation [m], slope of the leg that ends here [deg], oxygen used [L] */
  distKm: number;
  timeH: number;
  elev: number;
  slopeDeg: number;
  o2L: number;
  kind: "path" | "stop";
  /** index of the plan node */
  node: number;
}

export interface Profile {
  points: ProfilePoint[];
  /** stops with their distance along the route, in order */
  stops: Array<{ index: number; distKm: number; timeH: number; elev: number }>;
  /** the last outbound point from which the walk home still keeps the reserve; null when the whole outbound leg is safe */
  noReturn: ProfilePoint | null;
  /** highest and lowest elevation and the steepest leg */
  elevMin: number;
  elevMax: number;
  slopeMaxDeg: number;
}

export function profileOf(plan: Plan): Profile {
  const points: ProfilePoint[] = plan.nodes.map((n, i) => {
    const prev = i > 0 ? plan.nodes[i - 1]! : null;
    let slope = 0;
    if (prev) {
      const run = Math.hypot(n.x - prev.x, n.y - prev.y);
      slope = run > 1e-6 ? (Math.atan(Math.abs(n.z - prev.z) / run) * 180) / Math.PI : 0;
    }
    return { distKm: n.cumD / 1000, timeH: n.cumT / 3600, elev: n.z, slopeDeg: slope, o2L: n.cumO2, kind: n.kind, node: i };
  });
  const stops = plan.stopNodes.map((idx, k) => {
    const p = points[idx]!;
    return { index: k, distKm: p.distKm, timeH: p.timeH, elev: p.elev };
  });
  let lo = Infinity;
  let hi = -Infinity;
  let steep = 0;
  for (const p of points) {
    if (p.elev < lo) lo = p.elev;
    if (p.elev > hi) hi = p.elev;
    if (p.slopeDeg > steep) steep = p.slopeDeg;
  }
  return {
    points,
    stops,
    noReturn: plan.noReturn === null ? null : (points[plan.noReturn] ?? null),
    elevMin: points.length ? lo : 0,
    elevMax: points.length ? hi : 0,
    slopeMaxDeg: steep,
  };
}

/** Slope [deg] per node thinned to at most `max` points of the longest legs, for charting a long route. */
export function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]!);
  return out;
}

export interface RouteMeta {
  site: string;
  mode: "foot" | "rover";
  verdict: string;
  stopNames: string[];
  /** where the plan came from, for the file */
  generator?: string;
}

type ToLatLon = (x: number, y: number) => { lat: number; lon: number };

function wrap180(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** RFC 7946 FeatureCollection: the route as a LineString and the stops as Points. Coordinates are Mars planetocentric, not Earth WGS 84. */
export function routeGeoJSON(plan: Plan, toLatLon: ToLatLon, meta: RouteMeta) {
  const coord = (n: { x: number; y: number; z: number }): [number, number, number] => {
    const ll = toLatLon(n.x, n.y);
    return [Number(wrap180(ll.lon).toFixed(6)), Number(ll.lat.toFixed(6)), Number(n.z.toFixed(1))];
  };
  // a stop repeats the position of the node before it (the dwell): keep one point there
  const line = plan.nodes.filter((n, i) => i === 0 || n.x !== plan.nodes[i - 1]!.x || n.y !== plan.nodes[i - 1]!.y).map(coord);
  return {
    type: "FeatureCollection" as const,
    // a foreign member (RFC 7946 section 6.1): the coordinates are not Earth's
    marsCoordinateSystem: "Mars planetocentric latitude and east longitude (IAU), elevation in metres above the MOLA datum",
    features: [
      {
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: line },
        properties: {
          name: `${meta.site} sortie`,
          mode: meta.mode,
          verdict: meta.verdict,
          distance_m: Math.round(plan.stats.distanceM),
          time_s: Math.round(plan.stats.timeS),
          o2_used_l: Number(plan.stats.o2L.toFixed(1)),
          o2_usable_l: Number(plan.stats.usableL.toFixed(1)),
          ascent_m: Math.round(plan.stats.ascentM),
          max_grade_deg: Number(plan.stats.maxGradeDeg.toFixed(1)),
          generator: meta.generator ?? "Datum-4 sortie planner (modelled terrain, assumption-based physiology: not for flight use)",
        },
      },
      ...plan.stopNodes.map((idx, k) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: coord(plan.nodes[idx]!) },
        properties: { name: meta.stopNames[k] ?? `Stop ${k + 1}`, stop: k + 1, time_s: Math.round(plan.nodes[idx]!.cumT) },
      })),
    ],
  };
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** GPX 1.1: the route as a track and the stops as waypoints (an Earth GPS app will place them on Earth: the coordinates are Martian). */
export function routeGpx(plan: Plan, toLatLon: ToLatLon, meta: RouteMeta): string {
  const pt = (n: { x: number; y: number; z: number }, tag: string, extra = "") => {
    const ll = toLatLon(n.x, n.y);
    return `<${tag} lat="${ll.lat.toFixed(6)}" lon="${wrap180(ll.lon).toFixed(6)}"><ele>${n.z.toFixed(1)}</ele>${extra}</${tag}>`;
  };
  const wpts = plan.stopNodes.map((idx, k) => pt(plan.nodes[idx]!, "wpt", `<name>${xmlEscape(meta.stopNames[k] ?? `Stop ${k + 1}`)}</name>`));
  const trk = plan.nodes.map((n) => "      " + pt(n, "trkpt")).join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Datum-4" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata><name>${xmlEscape(meta.site)} sortie</name><desc>Mars planetocentric coordinates, not Earth. Verdict ${xmlEscape(meta.verdict)}.</desc></metadata>`,
    ...wpts.map((w) => "  " + w),
    `  <trk>`,
    `    <name>${xmlEscape(meta.site)} sortie (${meta.mode})</name>`,
    `    <trkseg>`,
    trk,
    `    </trkseg>`,
    `  </trk>`,
    `</gpx>`,
    ``,
  ].join("\n");
}

/** Saves text as a file in the browser; returns false when the environment cannot (no Blob URLs). */
export function downloadText(filename: string, text: string, mime: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
