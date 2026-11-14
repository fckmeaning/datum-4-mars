import { describe, it, expect } from "vitest";
import { EXPLORATION_ZONES, ZONE_RADIUS_KM, ringPoints, surfaceDistanceKm, zoneAt } from "./zones";

describe("exploration zones", () => {
  it("has the 38 zones from the 2015 workshop with unique names", () => {
    expect(EXPLORATION_ZONES).toHaveLength(38);
    expect(new Set(EXPLORATION_ZONES.map((z) => z.name)).size).toBe(38);
  });

  it("finds the Gale zone for the landing site and nothing in an empty area", () => {
    expect(zoneAt(-4.5895, 137.4417)?.zone.name).toBe("Gale Crater");
    expect(zoneAt(80, 0)).toBeNull();
  });

  it("respects the 100 km radius", () => {
    // one degree of latitude is about 59.3 km
    expect(zoneAt(-4.6 + 1.5, 137.4)?.zone.name).toBe("Gale Crater");
    expect(zoneAt(-4.6 + 1.8, 137.4)).toBeNull();
  });

  it("draws rings whose points are 100 km from the centre and on the sphere", () => {
    const z = EXPLORATION_ZONES[6]!;
    const pts = ringPoints(z.lat, z.lon, ZONE_RADIUS_KM, 32, 1.002);
    expect(pts).toHaveLength(32);
    for (const p of pts) {
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1.002, 6);
      const lat = (Math.asin(p.y / 1.002) * 180) / Math.PI;
      const lon = (Math.atan2(p.x, p.z) * 180) / Math.PI;
      expect(surfaceDistanceKm(z.lat, z.lon, lat, lon)).toBeCloseTo(ZONE_RADIUS_KM, 0);
    }
  });
});
