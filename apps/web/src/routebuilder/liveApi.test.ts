/**
 * Live check against a running API (skipped unless MARSNAV_LIVE_API is set to its base, e.g. http://127.0.0.1:8000).
 *   PowerShell:  $env:MARSNAV_LIVE_API="http://127.0.0.1:8000"; npx vitest run src/routebuilder/liveApi.test.ts
 */
import { describe, expect, it } from "vitest";
import { GALE_BASE, addPoint, type BuilderPoint } from "./model";
import { buildAlternativesRequest, planAlternatives, planBackToBase } from "./routeApi";
import { cardFacts, verdictOf, whyRoute } from "./explain";

const LIVE = (typeof process !== "undefined" && process.env["MARSNAV_LIVE_API"]) || "";
const BOXWORK = { lat: -4.80659, lon: 137.37999 }; // measured from the MSL waypoints (decision D-13)

describe.skipIf(!LIVE)("live API: base to boxwork region", () => {
  const baseUrl = `${LIVE}/api/v1`;
  let pts: BuilderPoint[] = [];
  pts = addPoint(pts, { lat: GALE_BASE.lat, lon: GALE_BASE.lon, placeId: GALE_BASE.id, name: GALE_BASE.name });
  pts = addPoint(pts, { lat: BOXWORK.lat, lon: BOXWORK.lon });

  it(
    "returns four alternatives with verdicts",
    async () => {
      const t0 = Date.now();
      const req = buildAlternativesRequest(pts, { siteId: "gale", startUtc: "2026-11-14T15:30:00Z" });
      const res = await planAlternatives(req, { baseUrl });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const rows = res.routes.map((r) => {
        const f = cardFacts(r);
        return `${r.profile.padEnd(8)} ${verdictOf(r).call.padEnd(7)} ${f.time.padEnd(10)} ${f.distance.padEnd(8)} dose ${f.dose} | ${verdictOf(r).reason}`;
      });
      console.log(`live alternatives in ${secs} s (levels ${res.routes[0]?.data_levels.join(",")}):\n${rows.join("\n")}`);
      console.log(`why BALANCED: ${whyRoute(res.routes.find((r) => r.profile === "BALANCED")!, res.routes).join(" ")}`);
      expect(res.routes.map((r) => r.profile)).toEqual(["FASTEST", "SAFEST", "BALANCED", "SCIENCE"]);
      for (const r of res.routes) {
        expect(["READY", "CAUTION", "NO_GO"]).toContain(verdictOf(r).call);
        expect(r.totals.time_s).toBeGreaterThan(0);
        expect(r.segments.length).toBeGreaterThan(0);
      }
    },
    180_000,
  );

  it("maps a point outside the AOI to OUT_OF_AOI", async () => {
    const outside = addPoint(pts.slice(0, 1), { lat: 10, lon: 10 });
    const req = buildAlternativesRequest(outside, { siteId: "gale" });
    await expect(planAlternatives(req, { baseUrl })).rejects.toMatchObject({ code: "OUT_OF_AOI", status: 400 });
  }, 60_000);

  it("plans the way back to base", async () => {
    const res = await planBackToBase({ siteId: "gale", position: BOXWORK, base: GALE_BASE }, { baseUrl });
    console.log(`back to base: ${(res.distance_m / 1000).toFixed(2)} km, bearing ${res.bearing_deg.toFixed(0)}°, eta ${(res.eta_s / 60).toFixed(0)} min, dose ${res.dose_mSv.toFixed(2)} mSv`);
    expect(res.distance_m).toBeGreaterThan(1000);
    expect(res.route.geometry.coordinates.length).toBeGreaterThan(2);
  }, 180_000);
});
