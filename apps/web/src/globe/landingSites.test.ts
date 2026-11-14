import { describe, it, expect } from "vitest";
import {
  DEFAULT_LANDING_SITES,
  isSiteVisible,
  getSiteVector,
} from "./landingSites";
import { latLonToVector3 } from "./orbit";

describe("landing sites catalog and visibility math", () => {
  it("opens every site; Gale and Jezero have local terrain, the rest orbital imagery", () => {
    const gale = DEFAULT_LANDING_SITES.find((s) => s.id === "gale");
    expect(gale).toBeDefined();
    expect(gale?.status).toBe("open");

    const jezero = DEFAULT_LANDING_SITES.find((s) => s.id === "jezero");
    expect(jezero).toBeDefined();
    expect(jezero?.status).toBe("open");
    expect(jezero?.detail).toBe("local");

    const meridiani = DEFAULT_LANDING_SITES.find((s) => s.id === "meridiani");
    expect(meridiani?.status).toBe("open");
    expect(meridiani?.detail).toBe("orbital");
  });

  describe("isSiteVisible horizon and limb culling", () => {
    // Camera at [0, 0, 3.2] looking at origin [0, 0, 0]
    const cameraPos = { x: 0, y: 0, z: 3.2 };

    it("returns true for a site facing directly at the camera (sub-camera point)", () => {
      // Sub-camera point at [0, 0, 1]
      const sitePos = { x: 0, y: 0, z: 1 };
      expect(isSiteVisible(sitePos, cameraPos)).toBe(true);
    });

    it("returns false for a site on the far side of Mars (negative Z)", () => {
      // Opposite side at [0, 0, -1]
      const sitePos = { x: 0, y: 0, z: -1 };
      expect(isSiteVisible(sitePos, cameraPos)).toBe(false);
    });

    it("returns false for a site on the limb (tangent horizon boundary)", () => {
      // For camera at distance 3.2, horizon angle beta has cos(beta) = 1.0 / 3.2 = 0.3125
      // Point at 90 deg (cos = 0) is well past the horizon:
      const sitePosEquator90 = { x: 1, y: 0, z: 0 };
      expect(isSiteVisible(sitePosEquator90, cameraPos)).toBe(false);
    });

    it("returns false when site is within the limb margin to avoid overlapping the limb", () => {
      // Threshold is 1.0/3.2 + 0.08 = 0.3925
      // cos(theta) = 0.35 is geometrically visible, but inside the limb margin (close to edge)
      const cosTheta = 0.35;
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const nearLimbSite = { x: sinTheta, y: 0, z: cosTheta };
      expect(isSiteVisible(nearLimbSite, cameraPos, 1.0, 0.08)).toBe(false);

      // cos(theta) = 0.707 (45 deg) is comfortably inside disk
      const innerSite = { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 };
      expect(isSiteVisible(innerSite, cameraPos, 1.0, 0.08)).toBe(true);
    });

    it("returns false if camera is inside the planet", () => {
      const insideCam = { x: 0, y: 0, z: 0.5 };
      const sitePos = { x: 0, y: 0, z: 1 };
      expect(isSiteVisible(sitePos, insideCam)).toBe(false);
    });

    it("computes site 3D vector matching latLonToVector3", () => {
      const gale = DEFAULT_LANDING_SITES.find((s) => s.id === "gale")!;
      const v = getSiteVector(gale, 1.002);
      const expected = latLonToVector3(gale.lat, gale.lon, 1.002);
      expect(v.x).toBeCloseTo(expected.x, 5);
      expect(v.y).toBeCloseTo(expected.y, 5);
      expect(v.z).toBeCloseTo(expected.z, 5);
    });
  });
});
