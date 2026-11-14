import { describe, expect, it, vi } from "vitest";
import { alternativesBody, jsonResponse } from "./fixtures";
import { addPoint, type BuilderPoint } from "./model";
import {
  PlanError,
  ResultCache,
  buildAlternativesRequest,
  mapApiError,
  planAlternatives,
  planBackToBase,
  planOrder,
  requestHash,
} from "./routeApi";

function pts(n: number): BuilderPoint[] {
  let out: BuilderPoint[] = [];
  for (let i = 0; i < n; i++) out = addPoint(out, { id: `p${i}`, lat: -4.7 + i * 0.01, lon: 137.4 });
  return out;
}

describe("buildAlternativesRequest", () => {
  it("sends roles and rounded coordinates, all four profiles, and omits level", () => {
    const req = buildAlternativesRequest(pts(3), { siteId: "gale", startUtc: "2026-11-14T15:30:00Z" });
    expect(req.waypoints.map((w) => w.role)).toEqual(["start", "via", "goal"]);
    expect(req.profiles).toEqual(["FASTEST", "SAFEST", "BALANCED", "SCIENCE"]);
    expect("level" in req).toBe(false);
    expect(req.site_id).toBe("gale");
    expect(req.start_utc).toBe("2026-11-14T15:30:00Z");
    expect(req.algorithm).toBe("astar");
    expect(req.optimize_order).toBe(false);
  });

  it("omits start_utc when not given", () => {
    expect("start_utc" in buildAlternativesRequest(pts(2), { siteId: "gale" })).toBe(false);
  });

  it("needs at least two points", () => {
    expect(() => buildAlternativesRequest(pts(1), { siteId: "gale" })).toThrowError(PlanError);
    try {
      buildAlternativesRequest(pts(0), { siteId: "gale" });
    } catch (e) {
      expect((e as PlanError).code).toBe("TOO_FEW_POINTS");
    }
  });
});

describe("requestHash and ResultCache", () => {
  it("is stable for equal requests and differs when a coordinate changes", () => {
    const a = buildAlternativesRequest(pts(2), { siteId: "gale" });
    const b = buildAlternativesRequest(pts(2), { siteId: "gale" });
    expect(requestHash(a)).toBe(requestHash(b));
    const moved = pts(2).map((p, i) => (i === 1 ? { ...p, lat: p.lat + 0.001 } : p));
    expect(requestHash(buildAlternativesRequest(moved, { siteId: "gale" }))).not.toBe(requestHash(a));
  });

  it("evicts the least recently used entry", () => {
    const c = new ResultCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1); // a is now the most recent
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
    expect(c.size).toBe(2);
  });
});

describe("mapApiError", () => {
  it("maps the API error codes to readable messages", () => {
    const aoi = mapApiError(400, { code: "OUT_OF_AOI", message: "A waypoint lies outside the site area." });
    expect(aoi).toMatchObject({ code: "OUT_OF_AOI", retryable: false });
    expect(aoi.message).toContain("outside");

    const noRoute = mapApiError(422, { code: "NO_ROUTE", message: "No feasible route: x. Try other points." });
    expect(noRoute).toMatchObject({ code: "NO_ROUTE", retryable: false });

    expect(mapApiError(400, { code: "UNKNOWN_PLACE" }).code).toBe("UNKNOWN_PLACE");
    expect(mapApiError(400, { code: "INVALID_ROUTE" }).code).toBe("INVALID_ROUTE");
  });

  it("marks server failures as retryable and falls back to generic text", () => {
    const e = mapApiError(503, null);
    expect(e).toMatchObject({ code: "SERVER", retryable: true });
    expect(e.message.length).toBeGreaterThan(10);
    expect(mapApiError(418, "nope").code).toBe("UNKNOWN");
  });
});

describe("network calls", () => {
  it("posts JSON to /route/alternatives and returns the parsed body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(alternativesBody()));
    const req = buildAlternativesRequest(pts(2), { siteId: "gale" });
    const res = await planAlternatives(req, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.routes).toHaveLength(4);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/route/alternatives");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ site_id: "gale", profiles: ["FASTEST", "SAFEST", "BALANCED", "SCIENCE"] });
  });

  it("turns a connection failure into a retryable NETWORK error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(planAlternatives(buildAlternativesRequest(pts(2), { siteId: "gale" }), { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({
      code: "NETWORK",
      retryable: true,
    });
  });

  it("maps an HTTP 422 NO_ROUTE answer", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: "NO_ROUTE", message: "No feasible route: blocked." }, 422));
    await expect(planAlternatives(buildAlternativesRequest(pts(2), { siteId: "gale" }), { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({
      code: "NO_ROUTE",
      status: 422,
    });
  });

  it("reports an aborted request as ABORTED", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(planAlternatives(buildAlternativesRequest(pts(2), { siteId: "gale" }), { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("builds the back-to-base and order requests", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ order: [0, 2, 1], cost_matrix: [], total_cost: 1, method: "held_karp" }));
    await planOrder(pts(3), { siteId: "gale" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const orderBody = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(orderBody).toMatchObject({ site_id: "gale", profile: "BALANCED", return_to_start: false });
    expect(orderBody.waypoints).toHaveLength(3);

    const f2 = vi.fn(async () => jsonResponse({}));
    await planBackToBase({ siteId: "gale", position: { lat: -4.7, lon: 137.4 }, base: { lat: -4.5895, lon: 137.4417 } }, { fetchImpl: f2 as unknown as typeof fetch });
    const [url, init] = f2.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/route/back-to-base");
    expect(JSON.parse(String(init.body))).toMatchObject({ position: { lat: -4.7, lon: 137.4 }, base: { lat: -4.5895, lon: 137.4417 }, profile: "SAFEST" });
  });
});
