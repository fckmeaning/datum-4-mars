import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staticApiResponse, resetStaticCache, searchPlaces, STATIC_UNAVAILABLE } from "./staticApi";
import { routeToGeoJson } from "./exportGeoJson";
import { loadSpaceWeather, marsCmeAlerts } from "./spaceWeather";
import { computeMissionClock } from "../sites/missionClock";

const STATIC_DIR = path.resolve(__dirname, "../../public/data/static");
const requested: string[] = [];

function fileFetch(extra?: (url: string) => Response | undefined): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requested.push(url);
    const custom = extra?.(url);
    if (custom) return custom;
    const m = /\/data\/static\/(.+)$/.exec(url);
    if (!m) return new Response("not found", { status: 404 });
    const file = path.join(STATIC_DIR, m[1]!);
    if (!fs.existsSync(file)) return new Response("not found", { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
  requested.length = 0;
  resetStaticCache();
  vi.stubGlobal("fetch", fileFetch());
});
afterEach(() => vi.unstubAllGlobals());

const get = async (p: string) => {
  const r = await staticApiResponse(p);
  return { status: r.status, body: (await r.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const post = async (p: string, body: unknown) => {
  const r = await staticApiResponse(p, { method: "POST", body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

describe("static API: values the Python API printed for 2026-11-14T08:31:31Z", () => {
  it("site clock: Gale sol 5074 and a 659 s link delay", async () => {
    const { status, body } = await get("/sites/gale/clock?utc=2026-11-14T08:31:31Z");
    expect(status).toBe(200);
    expect(body.mission_sol).toBe(5074);
    expect(body.mission_name).toBe("Curiosity (MSL)");
    expect(body.lmst_h).toBeCloseTo(6.734767631497903, 6);
    expect(body.ltst_h).toBeCloseTo(6.293694713407399, 6);
    expect(body.ls_deg).toBeCloseTo(21.740886684046018, 6);
    expect(body.earth_link_one_way_s).toBeCloseTo(659.3562133148421, 4);
    expect(Math.round(body.earth_link_one_way_s)).toBe(659);
  });

  it("browser mission clock: Perseverance sol 2039, Gale sol 5074, 659 s", () => {
    const t = new Date("2026-11-14T08:31:31Z");
    expect(computeMissionClock("jezero", { lat: 18.4447, lon: 77.4509 }, t).sol).toBe(2039);
    const gale = computeMissionClock("gale", { lat: -4.5895, lon: 137.4417 }, t);
    expect(gale.sol).toBe(5074);
    expect(Math.round(gale.lightS!)).toBe(659);
    expect(computeMissionClock("gusev", { lat: -14.57, lon: 175.47 }, t).sol).toBeNull();
  });

  it("/sun and /earth/light-time", async () => {
    const sun = await get("/sun?lat=-4.5895&lon=137.4417&utc=2026-11-14T08:31:31Z");
    expect(sun.body.elevation_deg).toBeCloseTo(3.6032056667083463, 6);
    expect(sun.body.azimuth_deg).toBeCloseTo(80.4943799374736, 6);
    expect(sun.body.irradiance_wm2).toBeCloseTo(0.18452610229372607, 6);
    const lt = await get("/earth/light-time?utc=2026-11-14T08:31:31Z");
    expect(lt.body.one_way_s).toBeCloseTo(659.3562133148421, 4);
    expect((await get("/sun?lat=1&lon=1&utc=garbage")).status).toBe(400);
  });

  it("orbiter states are propagated in the browser", async () => {
    const { body } = await get("/orbiters/states?utc=2026-11-14T08:31:31Z");
    expect(body.map((o: { id: string }) => o.id)).toEqual(expect.arrayContaining(["mro", "odyssey"]));
    for (const o of body) {
      expect(Math.abs(o.lat)).toBeLessThanOrEqual(90);
      expect(o.alt_m).toBeGreaterThan(100_000);
      expect(o.xyz_bodyfixed_m).toHaveLength(3);
    }
  });
});

describe("static API: build-time JSON", () => {
  it("health, sources, sites, layers, places", async () => {
    expect((await get("/health")).body.status).toBe("ok");
    const sources = await get("/sources");
    expect(sources.body.length).toBeGreaterThan(3);
    expect(sources.body[0]).toHaveProperty("source_url");
    expect((await get("/sites")).body[0].id).toBe("gale");
    expect((await get("/sites/gale")).body.base.kind).toBe("base");
    expect((await get("/sites/nowhere")).status).toBe(404);
    const layers = await get("/sites/gale/layers?level=L3");
    expect(layers.body.length).toBeGreaterThan(0);
    expect(layers.body.every((l: { level: string }) => l.level === "L3")).toBe(true);
    const bases = await get("/sites/gale/places?kind=base");
    expect(bases.body).toHaveLength(1);
  });

  it("place search is done in the browser", async () => {
    const hit = await get("/places/search?q=boxwork");
    expect(hit.body[0].id).toBe("gale.boxwork_region");
    const coord = await get("/places/search?q=-4.7%2C137.4");
    expect(coord.body[0].kind).toBe("coordinate");
    expect(searchPlaces([], "x", 5)).toEqual([]);
  });
});

describe("static API: precomputed routes", () => {
  const wp = (id: string) => ({ place_id: id });
  it("serves the base to Boxwork route the first-person view asks for", async () => {
    const { status, body } = await post("/route", { site_id: "gale", profile: "SAFEST", waypoints: [wp("gale.base"), wp("gale.boxwork_region")] });
    expect(status).toBe(200);
    expect(body.geometry.type).toBe("LineString");
    expect(body.profile).toBe("SAFEST");
    expect(body.precomputed.start_utc).toBeTruthy();
  });

  it("resolves coordinates to the named place and refuses new points with a clear 501", async () => {
    const places = (await get("/sites/gale/places")).body;
    const base = places.find((p: { kind: string }) => p.kind === "base");
    const dingo = places.find((p: { id: string }) => p.id === "gale.dingo_gap");
    const byCoord = await post("/route", {
      site_id: "gale", profile: "SAFEST",
      waypoints: [{ lat: base.lat, lon: base.lon }, { lat: dingo.lat + 0.0001, lon: dingo.lon }],
    });
    expect(byCoord.status).toBe(200);
    const nowhere = await post("/route", { site_id: "gale", profile: "SAFEST", waypoints: [{ lat: -4.6, lon: 137.3 }, { lat: -4.7, lon: 137.4 }] });
    expect(nowhere.status).toBe(501);
    expect(nowhere.body.code).toBe(STATIC_UNAVAILABLE);
    expect(nowhere.body.message).toMatch(/precomputed/);
  });

  it("rover walkback, alternatives, back-to-base, viewshed, isochrones", async () => {
    const rover = await post("/route/rover", { site_id: "gale", profile: "SAFEST", waypoints: [wp("gale.base"), wp("gale.kimberley")] });
    expect(rover.status).toBe(200);
    const alt = await post("/route/alternatives", { site_id: "gale", profiles: ["FASTEST", "SAFEST"], waypoints: [wp("gale.base"), wp("gale.kimberley")] });
    expect(alt.body.routes.map((r: { profile: string }) => r.profile).sort()).toEqual(["FASTEST", "SAFEST"]);
    const places = (await get("/sites/gale/places")).body;
    const k = places.find((p: { id: string }) => p.id === "gale.kimberley");
    expect((await post("/route/back-to-base", { site_id: "gale", position: { lat: k.lat, lon: k.lon } })).status).toBe(200);
    expect((await get(`/sites/gale/viewshed?lat=${k.lat}&lon=${k.lon}`)).body.visible_b64).toBeTruthy();
    expect((await get("/sites/gale/isochrones?minutes=15,30")).body.type).toBe("FeatureCollection");
  });

  it("things that need Python answer 501 STATIC_UNAVAILABLE, never a crash", async () => {
    for (const p of ["/route/pareto", "/route/uncertainty", "/localize/skyline"]) {
      const r = await post(p, {});
      expect(r.status).toBe(501);
      expect(r.body.code).toBe(STATIC_UNAVAILABLE);
    }
    expect((await get("/comms/windows?site_id=gale")).status).toBe(501);
  });
});

describe("RFC 7946 export in the browser", () => {
  it("exports a precomputed route without a crs member", async () => {
    const route = (await post("/route", { site_id: "gale", profile: "SAFEST", waypoints: [{ place_id: "gale.base" }, { place_id: "gale.boxwork_region" }] })).body;
    const places = (await get("/sites/gale/places")).body;
    const wps = ["gale.base", "gale.boxwork_region"].map((id) => places.find((p: { id: string }) => p.id === id));
    const gj = routeToGeoJson(route, wps.map((p: { lat: number; lon: number; name: string }) => ({ lat: p.lat, lon: p.lon, name: p.name })));
    expect(gj.type).toBe("FeatureCollection");
    expect("crs" in gj).toBe(false);
    expect(gj.features[0].geometry.type).toBe("LineString");
    expect(gj.features.filter((f: { properties: { featureType: string } }) => f.properties.featureType === "MarsWaypoint")).toHaveLength(2);
    expect(gj.properties.body).toBe("Mars");
    expect(gj.bbox).toHaveLength(4);
    // through the router too
    const viaApi = await post("/route/export", { route, waypoints: wps });
    expect(viaApi.status).toBe(200);
    expect(viaApi.body.type).toBe("FeatureCollection");
    expect((await post("/route/export", { route: { geometry: null } })).status).toBe(422);
  });
});

describe("space weather: live first, snapshot labelled", () => {
  const sims = [
    { simulationID: "WSA-ENLIL/1/1", cmeInputs: [{ speed: 600 }], impactList: [{ location: "Mars", arrivalTime: "2026-11-15T12:00Z", isGlancingBlow: true }, { location: "Earth", arrivalTime: "2026-11-15T12:00Z" }], link: "https://x" },
  ];

  it("keeps only Mars impacts and flags the near ones", () => {
    const list = marsCmeAlerts(sims, new Date("2026-11-14T12:00:00Z"));
    expect(list).toHaveLength(1);
    expect(list[0]!.severity).toBe("warning");
    expect(list[0]!.message).toMatch(/glancing blow/);
    expect(marsCmeAlerts(sims, new Date("2026-12-31T00:00:00Z"))[0]!.severity).toBe("info");
  });

  it("uses the live feed when it answers, with no API key of ours", async () => {
    const f = fileFetch((u) => (u.startsWith("https://api.nasa.gov/DONKI") ? new Response(JSON.stringify(sims)) : undefined));
    const r = await loadSpaceWeather(new Date("2026-11-14T12:00:00Z"), f);
    expect(r.origin).toBe("live");
    expect(r.alerts[0]!.mode).toBe("live");
    expect(requested.some((u) => u.includes("api_key=DEMO_KEY"))).toBe(true);
  });

  it("falls back to the committed snapshot and says so", async () => {
    const f = fileFetch((u) => (u.startsWith("https://api.nasa.gov") ? new Response("blocked", { status: 429 }) : undefined));
    const r = await loadSpaceWeather(new Date(), f);
    expect(r.origin).toBe("snapshot");
    expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.liveError).toMatch(/429/);
    expect(r.alerts.every((a) => a.mode === "snapshot" && a.snapshot_utc === r.asOf)).toBe(true);
  });

  it("does not hammer the rate-limited feed: a failure is remembered for 10 minutes, a live answer for 30", async () => {
    const t0 = new Date("2026-11-14T12:00:00Z");
    let donkiCalls = 0;
    const failing = fileFetch((u) => (u.startsWith("https://api.nasa.gov") ? (donkiCalls++, new Response("slow down", { status: 429 })) : undefined));
    await loadSpaceWeather(t0, failing);
    const again = await loadSpaceWeather(new Date(t0.getTime() + 5 * 60_000), failing);
    expect(donkiCalls).toBe(1);
    expect(again.origin).toBe("snapshot");
    await loadSpaceWeather(new Date(t0.getTime() + 11 * 60_000), failing);
    expect(donkiCalls).toBe(2); // the failure memory expired

    localStorage.clear();
    donkiCalls = 0;
    const okFetch = fileFetch((u) => (u.startsWith("https://api.nasa.gov") ? (donkiCalls++, new Response(JSON.stringify(sims))) : undefined));
    await loadSpaceWeather(t0, okFetch);
    const second = await loadSpaceWeather(new Date(t0.getTime() + 20 * 60_000), okFetch);
    expect(donkiCalls).toBe(1);
    expect(second.origin).toBe("live");
    await loadSpaceWeather(new Date(t0.getTime() + 31 * 60_000), okFetch);
    expect(donkiCalls).toBe(2);
  });

  it("returns nothing (not an invented forecast) when neither live nor snapshot exist", async () => {
    const f = (async () => new Response("no", { status: 404 })) as typeof fetch;
    resetStaticCache();
    const r = await loadSpaceWeather(new Date(), f);
    expect(r).toMatchObject({ origin: "snapshot", asOf: null, alerts: [] });
  });
});

describe("no /api request", () => {
  it("the static layer only reads /data/static files", async () => {
    await get("/sites/gale/clock");
    await get("/sources");
    await get("/places/search?q=gale");
    await post("/route", { waypoints: [{ place_id: "gale.base" }, { place_id: "gale.boxwork_region" }] });
    expect(requested.length).toBeGreaterThan(0);
    expect(requested.every((u) => u.includes("/data/static/"))).toBe(true);
    expect(requested.some((u) => u.includes("/api/"))).toBe(false);
  });
});
