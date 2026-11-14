import { describe, it, expect } from "vitest";
import { DEFAULT_LANDING_SITES } from "./landingSites";
import { SITE_FACTS, daysSinceLanding, siteFacts, wrapLon180 } from "./siteCatalog";

describe("site catalog", () => {
  it("has facts for every landing site on the globe", () => {
    for (const s of DEFAULT_LANDING_SITES) expect(siteFacts(s.id), s.id).toBeDefined();
    expect(Object.keys(SITE_FACTS).sort()).toEqual(DEFAULT_LANDING_SITES.map((s) => s.id).sort());
  });

  it("every site is open and tells the truth about its detail tier", () => {
    for (const s of DEFAULT_LANDING_SITES) {
      expect(s.status).toBe("open");
      expect(s.detail).toBe(SITE_FACTS[s.id]!.detail);
    }
    expect(SITE_FACTS["gale"]!.detail).toBe("local");
    expect(SITE_FACTS["meridiani"]!.detail).toBe("orbital");
  });

  it("counts days since landing in whole UTC days", () => {
    expect(daysSinceLanding("2026-11-14", new Date("2026-11-14T23:59:00Z"))).toBe(0);
    expect(daysSinceLanding("2026-11-13", new Date("2026-11-14T00:01:00Z"))).toBe(1);
    expect(daysSinceLanding("2027-01-01", new Date("2026-11-14T00:00:00Z"))).toBe(0);
  });

  it("wraps longitude for the tile services", () => {
    expect(wrapLon180(354.47)).toBeCloseTo(-5.53);
    expect(wrapLon180(137.44)).toBeCloseTo(137.44);
    expect(wrapLon180(180)).toBe(-180);
  });
});

describe("landing station positions", () => {
  it("every station is near its globe marker (same region)", () => {
    for (const s of DEFAULT_LANDING_SITES) {
      const p = SITE_FACTS[s.id]!.stationPos;
      expect(Math.abs(p.lat - s.lat)).toBeLessThan(1.5);
      expect(Math.abs(wrapLon180(p.lon) - wrapLon180(s.lon))).toBeLessThan(2);
    }
  });
  it("Jezero's station is the Octavia E. Butler landing, not the crater centre", () => {
    expect(SITE_FACTS["jezero"]!.stationPos).toEqual({ lat: 18.4447, lon: 77.4508 });
  });
});
