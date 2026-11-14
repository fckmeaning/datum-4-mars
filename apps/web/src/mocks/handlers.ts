import { http, HttpResponse } from "msw";
import {
  MOCK_SITE_GALE,
  MOCK_LAYERS_GALE,
  MOCK_PLACES_GALE,
  MOCK_SITE_CLOCK,
  createMockPointReport,
  MOCK_SOURCES,
  generateMockAlternatives,
  createMockBackToBase,
} from "./data";
import type { components } from "../api/schema";

export const handlers = [
  // Health
  http.get("/api/v1/health", () => {
    const health: components["schemas"]["Health"] = {
      status: "ok",
      api_version: "1.1.0",
      contract_version: 1,
      data_levels: ["L0", "L1", "L2", "L3"],
    };
    return HttpResponse.json(health);
  }),

  // Mission Clock
  http.get("/api/v1/sites/:siteId/clock", () => {
    return HttpResponse.json(MOCK_SITE_CLOCK);
  }),

  // What's Here
  http.get("/api/v1/sites/:siteId/whats-here", ({ request }) => {
    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get("lat") ?? "-4.72");
    const lon = parseFloat(url.searchParams.get("lon") ?? "137.40");
    return HttpResponse.json(createMockPointReport(lat, lon));
  }),

  // Sources manifest
  http.get("/api/v1/sources", () => {
    return HttpResponse.json(MOCK_SOURCES);
  }),

  // Sites list
  http.get("/api/v1/sites", () => {
    return HttpResponse.json([MOCK_SITE_GALE]);
  }),

  // Site detail
  http.get("/api/v1/sites/:siteId", ({ params }) => {
    const { siteId } = params;
    if (siteId === "gale") {
      return HttpResponse.json(MOCK_SITE_GALE);
    }
    return HttpResponse.json({ code: "NOT_FOUND", message: `Site '${siteId}' not found` }, { status: 404 });
  }),

  // Site layers
  http.get("/api/v1/sites/:siteId/layers", ({ params, request }) => {
    const { siteId } = params;
    if (siteId !== "gale") {
      return HttpResponse.json({ code: "NOT_FOUND", message: `Site '${siteId}' not found` }, { status: 404 });
    }
    const url = new URL(request.url);
    const level = url.searchParams.get("level");
    if (level) {
      return HttpResponse.json(MOCK_LAYERS_GALE.filter((l) => l.level === level));
    }
    return HttpResponse.json(MOCK_LAYERS_GALE);
  }),

  // Site places (Points of Interest)
  http.get("/api/v1/sites/:siteId/places", ({ params, request }) => {
    const { siteId } = params;
    if (siteId !== "gale") {
      return HttpResponse.json({ code: "NOT_FOUND", message: `Site '${siteId}' not found` }, { status: 404 });
    }
    const url = new URL(request.url);
    const kinds = url.searchParams.getAll("kind");
    if (kinds.length > 0) {
      return HttpResponse.json(MOCK_PLACES_GALE.filter((p) => kinds.includes(p.kind)));
    }
    return HttpResponse.json(MOCK_PLACES_GALE);
  }),

  // Search places
  http.get("/api/v1/places/search", ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
    const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);

    if (!q) {
      return HttpResponse.json(MOCK_PLACES_GALE.slice(0, limit));
    }

    const matches = MOCK_PLACES_GALE.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.aliases && p.aliases.some((a) => a.toLowerCase().includes(q))),
    );

    return HttpResponse.json(matches.slice(0, limit));
  }),

  // Route alternatives
  http.post("/api/v1/route/alternatives", async ({ request }) => {
    try {
      const body = (await request.json()) as components["schemas"]["AlternativesRequest"];
      const waypoints = body.waypoints ?? [];
      const startWp = waypoints[0];
      const endWp = waypoints[waypoints.length - 1];

      const startLat = startWp?.lat ?? -4.5895;
      const startLon = startWp?.lon ?? 137.4417;
      const endLat = endWp?.lat ?? -4.755;
      const endLon = endWp?.lon ?? 137.382;

      const result = generateMockAlternatives(startLat, startLon, endLat, endLon);
      return HttpResponse.json(result);
    } catch {
      return HttpResponse.json(
        { code: "INVALID_REQUEST", message: "Failed to parse route request body" },
        { status: 400 },
      );
    }
  }),

  // Route back-to-base
  http.post("/api/v1/route/back-to-base", async ({ request }) => {
    try {
      const body = (await request.json()) as components["schemas"]["BackToBaseRequest"];
      const pos = body.position ?? { lat: -4.68, lon: 137.41 };
      const base = body.base ?? { lat: -4.5895, lon: 137.4417 };
      const result = createMockBackToBase(pos.lat, pos.lon, base.lat, base.lon);
      return HttpResponse.json(result);
    } catch {
      return HttpResponse.json(
        { code: "INVALID_REQUEST", message: "Failed to parse back-to-base request body" },
        { status: 400 },
      );
    }
  }),
];
