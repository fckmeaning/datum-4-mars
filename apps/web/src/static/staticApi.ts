/**
 * The Python API answered from files and the browser: a drop-in for `GET/POST /api/v1/...` that needs no server.
 *
 *   computed in the browser   health, clock, sun, light-time, orbiter states, place search, route export, space weather (live feed)
 *   build-time JSON           sources, site record, layers, places, orbiters, space-weather snapshot, Gale routes, viewshed,
 *                             isochrones, walkability summary  (public/data/static/*.json, made by data/pipeline/make_static_routes.py)
 *   not available             anything that needs a new Python run: arbitrary route points, uncertainty, pareto, localisation, comms
 *                             windows. These answer HTTP 501 with code STATIC_UNAVAILABLE and a human message; the UI shows it.
 */
import { STATIC_DATA, withBase } from "./config";
import { routeToGeoJson, type ExportWaypoint } from "./exportGeoJson";
import { earthMarsLightTime, mars24, missionSol, orbitPosition, solarTime, sunPosition, type OrbitElements } from "./marsTime";
import { loadSpaceWeather } from "./spaceWeather";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

export const STATIC_UNAVAILABLE = "STATIC_UNAVAILABLE";

/** Landing data of the one site the API knows (contracts/projection.json aoi.mission). */
const GALE_MISSION = { name: "Curiosity (MSL)", landingLonEast: 137.4417, landingUtc: "2012-08-06T05:17:57Z" };
const SNAP_PLACE_M = 150;

const cache = new Map<string, Promise<unknown>>();

/** Loads one build-time JSON file once. A failed load is not cached, so a later call can retry. */
export function loadStatic<T>(name: string, f: typeof fetch = fetch): Promise<T> {
  let p = cache.get(name) as Promise<T> | undefined;
  if (!p) {
    p = f(withBase(`${STATIC_DATA}/${name}`)).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json() as Promise<T>;
    });
    cache.set(name, p);
    p.catch(() => cache.delete(name));
  }
  return p;
}

export function resetStaticCache(): void {
  cache.clear();
}

function ok(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Datum-Source": "static", ...headers } });
}
function fail(status: number, code: string, message: string): Response {
  return ok({ code, message, details: {} }, status);
}
const unavailable = (what: string) =>
  fail(501, STATIC_UNAVAILABLE, `${what} needs the Python API, which is not part of this static build. Precomputed Gale routes, the sortie planner and the clock work without it.`);

const isoZ = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");
function parseTime(raw: string | null): { ok: true; t: string } | { ok: false } {
  if (!raw) return { ok: false };
  const ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(raw.trim()) ? raw.trim() : `${raw.trim()}Z`);
  return Number.isFinite(ms) ? { ok: true, t: raw } : { ok: false };
}
const badTime = () => fail(400, "INVALID_TIME", "utc must be an ISO 8601 timestamp, e.g. 2026-11-14T15:30:00Z");

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 3396190 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ------------------------------------------------------------------------------------------------ places and search
interface Place extends Json {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  aliases?: string[];
}

const COORD = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/;

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
  return m;
}
/** Dice coefficient on character bigrams (the server uses difflib's ratio; same idea, same 0.35 cut-off). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ba = bigrams(a);
  const bb = bigrams(b);
  let hit = 0;
  for (const [k, n] of ba) hit += Math.min(n, bb.get(k) ?? 0);
  return (2 * hit) / (a.length - 1 + (b.length - 1));
}

export function searchPlaces(places: Place[], q: string, limit: number): Place[] {
  const m = COORD.exec(q);
  if (m) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return [
        {
          id: `coord:${lat.toFixed(5)},${lon.toFixed(5)}`, name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, aliases: [], kind: "coordinate", lat, lon,
          x: null, y: null, source: "user input", description: null, science_target: false, pov_image: null,
        },
      ];
    }
  }
  const ql = q.toLowerCase().trim();
  return places
    .map((p) => {
      const best = Math.max(...[p.name, ...(p.aliases ?? [])].map((n) => similarity(ql, n.toLowerCase()) + (n.toLowerCase().includes(ql) ? 0.5 : 0)));
      return { best, p };
    })
    .filter((s) => s.best >= 0.35)
    .sort((a, b) => b.best - a.best)
    .slice(0, limit)
    .map((s) => s.p);
}

function nearestPlace(places: Place[], lat: number, lon: number): Place | null {
  let best: Place | null = null;
  let bd = SNAP_PLACE_M;
  for (const p of places) {
    const d = haversineM(lat, lon, p.lat, p.lon);
    if (d <= bd) {
      best = p;
      bd = d;
    }
  }
  return best;
}

interface RouteBundle {
  start_utc: string;
  base_id: string;
  items: Record<string, Json>;
  extras: Record<string, Json>;
  failed: Record<string, string>;
}

/** Resolves a request waypoint (place id or coordinates) to the place it names, or null. */
function resolveWaypoint(places: Place[], w: Json): Place | null {
  if (w.place_id) return places.find((p) => p.id === w.place_id) ?? null;
  if (typeof w.lat === "number" && typeof w.lon === "number") return nearestPlace(places, w.lat, w.lon);
  return null;
}

const NO_PRECOMPUTED =
  "This start and goal pair was not precomputed. Static build: routes run from the base station to each named place, and back from each place; the sortie planner on the site page routes any new point in the browser.";

async function routeFromBundle(kind: "route" | "rover", body: Json): Promise<Response> {
  const [places, bundle] = await Promise.all([loadStatic<Place[]>("places_gale.json"), loadStatic<RouteBundle>("routes_gale.json")]);
  const wps = (body.waypoints as Json[] | undefined) ?? [];
  if (wps.length !== 2) return fail(501, STATIC_UNAVAILABLE, "Static build: only start and goal routes are precomputed (no extra stops).");
  const a = resolveWaypoint(places, wps[0]!);
  const b = resolveWaypoint(places, wps[1]!);
  if (!a || !b) return fail(501, STATIC_UNAVAILABLE, NO_PRECOMPUTED);
  const profile = String(body.profile ?? "SAFEST");
  const hit = bundle.items[`${kind}|${profile}|${a.id}|${b.id}`] ?? (kind === "route" ? undefined : bundle.items[`${kind}|SAFEST|${a.id}|${b.id}`]);
  if (!hit) {
    const failed = bundle.failed[`${kind}|${profile}|${a.id}|${b.id}`];
    return failed ? fail(422, "NO_ROUTE", failed) : fail(501, STATIC_UNAVAILABLE, NO_PRECOMPUTED);
  }
  return ok({ ...hit, precomputed: { start_utc: bundle.start_utc, note: "Precomputed by the Python core at build time." } });
}

async function alternativesFromBundle(body: Json): Promise<Response> {
  const [places, bundle] = await Promise.all([loadStatic<Place[]>("places_gale.json"), loadStatic<RouteBundle>("routes_gale.json")]);
  const wps = (body.waypoints as Json[] | undefined) ?? [];
  if (wps.length !== 2) return fail(501, STATIC_UNAVAILABLE, "Static build: only start and goal routes are precomputed (no extra stops).");
  const a = resolveWaypoint(places, wps[0]!);
  const b = resolveWaypoint(places, wps[1]!);
  const hit = a && b ? bundle.items[`alternatives|${a.id}|${b.id}`] : undefined;
  if (!hit) return fail(501, STATIC_UNAVAILABLE, NO_PRECOMPUTED);
  const want = new Set<string>((body.profiles as string[] | undefined) ?? []);
  const routes = (hit.routes as Json[]).filter((r) => want.size === 0 || want.has(r.profile));
  return ok({ ...hit, routes: routes.length ? routes : hit.routes, precomputed: { start_utc: bundle.start_utc } });
}

async function backToBase(body: Json): Promise<Response> {
  const [places, bundle] = await Promise.all([loadStatic<Place[]>("places_gale.json"), loadStatic<RouteBundle>("routes_gale.json")]);
  const pos = body.position as Json | undefined;
  const p = pos && typeof pos.lat === "number" ? nearestPlace(places, pos.lat, pos.lon) : null;
  const hit = p ? bundle.items[`back_to_base|${p.id}`] : undefined;
  if (!hit) return fail(501, STATIC_UNAVAILABLE, "Static build: the way back is precomputed from each named place (within 150 m) to the base only.");
  return ok({ ...hit, precomputed: { start_utc: bundle.start_utc } });
}

// ---------------------------------------------------------------------------------------------------------- router
/**
 * Answers an API request from the static layer. `path` is the part after `/api/v1` (with the query string), for example
 * `/sun?lat=-4.6&lon=137.4&utc=2026-11-14T08:31:31Z`. Always resolves with a Response (never throws).
 */
export async function staticApiResponse(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await dispatch(path, init);
  } catch (e) {
    return fail(503, "STATIC_DATA_MISSING", `Static data could not be loaded (${e instanceof Error ? e.message : String(e)}). Run data/pipeline/make_static_routes.py.`);
  }
}

async function dispatch(path: string, init: RequestInit): Promise<Response> {
  const url = new URL(path, "http://static.local");
  const route = url.pathname.replace(/\/+$/, "");
  const q = url.searchParams;
  const method = (init.method ?? "GET").toUpperCase();
  let body: Json = {};
  if (method === "POST" && typeof init.body === "string") {
    try {
      body = JSON.parse(init.body) as Json;
    } catch {
      return fail(400, "INVALID_JSON", "The request body is not valid JSON.");
    }
  }

  if (method === "GET") {
    if (route === "/health") return ok({ status: "ok", api_version: "static", contract_version: 1, data_levels: ["L0", "L1", "L2", "L3"] });
    if (route === "/sources") return ok(await loadStatic("sources.json"));

    if (route === "/sun") {
      const lat = Number(q.get("lat"));
      const lon = Number(q.get("lon"));
      const t = parseTime(q.get("utc"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return fail(422, "VALIDATION", "lat in [-90, 90] and lon in [-180, 180] are required.");
      if (!t.ok) return badTime();
      const s = sunPosition(lat, lon, t.t);
      return ok({
        utc: s.utc, msd: s.msd, ls_deg: s.lsDeg, lmst_h: s.lmstH, ltst_h: s.ltstH, elevation_deg: s.elevationDeg, azimuth_deg: s.azimuthDeg,
        declination_deg: s.declinationDeg, sun_distance_au: s.sunDistanceAu, irradiance_wm2: s.irradianceWm2,
      });
    }

    if (route === "/earth/light-time") {
      const t = parseTime(q.get("utc"));
      if (!t.ok) return badTime();
      const l = earthMarsLightTime(t.t);
      return ok({ utc: t.t, distance_m: l.distanceM, one_way_s: l.oneWayS, accuracy: "approximate" });
    }

    if (route === "/orbiters") {
      const items = await loadStatic<Json[]>("orbiters.json");
      return ok(items);
    }
    if (route === "/orbiters/states") {
      const t = parseTime(q.get("utc"));
      if (!t.ok) return badTime();
      const items = await loadStatic<Json[]>("orbiters.json");
      return ok(
        items.map((o) => {
          const p = orbitPosition(o.elements as OrbitElements, t.t);
          return { id: o.id, utc: t.t, lat: p.latDeg, lon: p.lonDeg, alt_m: p.altM, xyz_bodyfixed_m: p.xyzFixedM, accuracy: o.accuracy ?? "approximate" };
        }),
      );
    }

    if (route === "/alerts/space-weather") {
      const mode = q.get("mode");
      const now = new Date();
      if (mode === "simulated") {
        return ok([
          {
            id: "sim-sep-drill", kind: "SEP", severity: "critical", start: isoZ(now), end: null, source: "marsnav planning drill (SIMULATED)", mode: "simulated",
            link: null, message: "SIMULATED solar particle event for a shelter drill: return to the nearest shelter now. Not a real measurement.",
          },
        ]);
      }
      const r = await loadSpaceWeather(now);
      return ok(r.alerts, 200, { "X-Datum-Weather": r.origin, "X-Datum-Weather-As-Of": r.asOf ?? "" });
    }

    if (route === "/sites") return ok((await loadStatic<Json>("sites.json")).sites);
    let m = /^\/sites\/([^/]+)$/.exec(route);
    if (m) {
      const site = ((await loadStatic<Json>("sites.json")).sites as Json[]).find((s) => s.id === m![1]);
      return site ? ok(site) : fail(404, "SITE_NOT_FOUND", `Site ${m[1]} not found.`);
    }
    m = /^\/sites\/([^/]+)\/layers$/.exec(route);
    if (m) {
      const all = (await loadStatic<Json>("sites.json")).layers as Record<string, Json[]>;
      if (m[1] !== "gale") return fail(404, "SITE_NOT_FOUND", `Site ${m[1]} not found.`);
      const level = q.get("level");
      return ok(level ? (all[level] ?? []) : Object.values(all).flat());
    }
    m = /^\/sites\/([^/]+)\/places$/.exec(route);
    if (m) {
      if (m[1] !== "gale") return fail(404, "SITE_NOT_FOUND", `Site ${m[1]} not found.`);
      const kinds = q.getAll("kind");
      const places = await loadStatic<Place[]>("places_gale.json");
      return ok(kinds.length ? places.filter((p) => kinds.includes(p.kind)) : places);
    }
    m = /^\/sites\/([^/]+)\/clock$/.exec(route);
    if (m) {
      if (m[1] !== "gale") return fail(404, "SITE_NOT_FOUND", `Site ${m[1]} not found.`);
      const t = q.get("utc") ? parseTime(q.get("utc")) : ({ ok: true, t: isoZ(new Date()) } as const);
      if (!t.ok) return badTime();
      const mt = mars24(t.t);
      const { lmstH, ltstH } = solarTime(GALE_MISSION.landingLonEast, mt);
      return ok({
        utc: t.t, mission_name: GALE_MISSION.name, mission_sol: missionSol(t.t, GALE_MISSION.landingLonEast, GALE_MISSION.landingUtc),
        lmst_h: lmstH, ltst_h: ltstH, ls_deg: mt.lsDeg, earth_link_one_way_s: earthMarsLightTime(t.t).oneWayS, earth_link_accuracy: "approximate",
      });
    }
    if (route === "/places/search") {
      const text = q.get("q") ?? "";
      if (!text) return fail(422, "VALIDATION", "q is required.");
      const limit = Math.min(50, Math.max(1, Number(q.get("limit") ?? 10) || 10));
      return ok(searchPlaces(await loadStatic<Place[]>("places_gale.json"), text, limit));
    }

    m = /^\/sites\/([^/]+)\/viewshed$/.exec(route);
    if (m) {
      const [places, bundle] = await Promise.all([loadStatic<Place[]>("places_gale.json"), loadStatic<RouteBundle>("routes_gale.json")]);
      const p = nearestPlace(places, Number(q.get("lat")), Number(q.get("lon")));
      const hit = p ? bundle.extras[`viewshed|${p.id}`] : undefined;
      if (!hit) return fail(501, STATIC_UNAVAILABLE, "Static build: line of sight is precomputed (3 km, observer height 2 m) for the base and the named places only; stand within 150 m of one of them.");
      return ok(hit);
    }
    m = /^\/sites\/([^/]+)\/isochrones$/.exec(route);
    if (m) {
      const bundle = await loadStatic<RouteBundle>("routes_gale.json");
      const hit = bundle.extras["isochrones|gale"];
      return hit ? ok(hit, 200, { "Content-Type": "application/geo+json" }) : unavailable("Return-time isochrones");
    }
    m = /^\/sites\/([^/]+)\/walkability\/summary$/.exec(route);
    if (m) {
      const hit = (await loadStatic<RouteBundle>("routes_gale.json")).extras["walkability_summary|gale"];
      return hit ? ok(hit) : unavailable("The walkability summary");
    }
    return unavailable(`GET ${route}`);
  }

  if (method === "POST") {
    if (route === "/route") return routeFromBundle("route", body);
    if (route === "/route/rover") return routeFromBundle("rover", body);
    if (route === "/route/alternatives") return alternativesFromBundle(body);
    if (route === "/route/back-to-base") return backToBase(body);
    if (route === "/route/export") {
      try {
        const wps = ((body.waypoints as ExportWaypoint[] | undefined) ?? null) as ExportWaypoint[] | null;
        return ok(routeToGeoJson(body.route as Json, wps, { name: body.name as string | undefined }), 200, { "Content-Type": "application/geo+json" });
      } catch (e) {
        return fail(422, "BAD_ROUTE", `The route object cannot be exported: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return unavailable(`POST ${route}`);
  }
  return fail(405, "METHOD_NOT_ALLOWED", `${method} is not supported.`);
}
