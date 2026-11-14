import { describe, it, expect } from "vitest";
import { apiClient, ApiError } from "./client";

describe("apiClient", () => {
  it("fetches health status", async () => {
    const health = await apiClient.getHealth();
    expect(health.status).toBe("ok");
    expect(health.data_levels).toContain("L1");
  });

  it("fetches site mission clock", async () => {
    const clock = await apiClient.getSiteClock("gale");
    expect(clock.mission_sol).toBe(4362);
    expect(clock.earth_link_one_way_s).toBeGreaterThan(0);
    expect(clock.lmst_h).toBeGreaterThan(0);
    expect(clock.ls_deg).toBeGreaterThan(0);
  });

  it("queries what's here point report", async () => {
    const report = await apiClient.whatsHere("gale", -4.755, 137.382);
    expect(report.point.lat).toBe(-4.755);
    expect(report.point.lon).toBe(137.382);
    expect(report.elevation_m).toBeDefined();
    expect(report.slope_deg).toBeDefined();
    expect(report.simulated_fields).toBeDefined();
  });

  it("lists sources manifest", async () => {
    const sources = await apiClient.listSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0]?.source_url).toBeDefined();
  });

  it("lists sites and gets Gale crater site", async () => {
    const sites = await apiClient.listSites();
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]?.id).toBe("gale");

    const gale = await apiClient.getSite("gale");
    expect(gale.id).toBe("gale");
    expect(gale.name).toContain("Gale");
    expect(gale.base.kind).toBe("base");
  });

  it("lists layers for a site", async () => {
    const layers = await apiClient.listLayers("gale");
    expect(layers.length).toBeGreaterThan(0);
    const elevation = layers.find((l) => l.id === "elevation");
    expect(elevation).toBeDefined();
    expect(elevation?.family).toBe("topography");
  });

  it("lists site places and filters by kind", async () => {
    const places = await apiClient.listSitePlaces("gale");
    expect(places.length).toBeGreaterThan(0);

    const bases = await apiClient.listSitePlaces("gale", ["base"]);
    expect(bases.every((b) => b.kind === "base")).toBe(true);
  });

  it("searches places with fuzzy/substring matching", async () => {
    const results = await apiClient.searchPlaces("boxwork", "gale");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toContain("Boxwork");
  });

  it("requests route alternatives returning 4 profiles", async () => {
    const res = await apiClient.routeAlternatives({
      site_id: "gale",
      waypoints: [
        { role: "start", dwell_min: 0, lat: -4.5895, lon: 137.4417 },
        { role: "goal", dwell_min: 0, lat: -4.755, lon: 137.382 },
      ],
      profiles: ["FASTEST", "SAFEST", "BALANCED", "SCIENCE"],
      algorithm: "astar",
      optimize_order: false,
      return_to_start: false,
    });

    expect(res.routes.length).toBe(4);
    const profiles = res.routes.map((r) => r.profile);
    expect(profiles).toContain("FASTEST");
    expect(profiles).toContain("SAFEST");
    expect(profiles).toContain("BALANCED");
    expect(profiles).toContain("SCIENCE");
  });

  it("maps API errors to ApiError with human-readable status and messages", () => {
    const error = new ApiError("Validation failed: waypoint unreachable", 422, {
      code: "NO_ROUTE",
      message: "Waypoint unreachable due to > 25 deg slope constraint",
    });

    expect(error.name).toBe("ApiError");
    expect(error.status).toBe(422);
    expect(error.message).toContain("waypoint unreachable");
    expect(error.details).toEqual({
      code: "NO_ROUTE",
      message: "Waypoint unreachable due to > 25 deg slope constraint",
    });
  });
});
