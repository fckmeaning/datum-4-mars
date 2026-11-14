import { describe, it, expect } from "vitest";
import { SphereGeometry } from "three";
import { latLonToVector3, vector3ToLatLon } from "./orbit";

describe("globe coordinate conventions and equirectangular UV mapping", () => {
  // Gale Crater AOI coordinates
  const GALE_LAT = -4.5895;
  const GALE_LON = 137.4417;

  it("converts Gale Crater lat/lon to 3D Cartesian vector with east-positive convention", () => {
    const v = latLonToVector3(GALE_LAT, GALE_LON, 1.0);

    // Latitude is slightly south of equator: y should be negative
    expect(v.y).toBeLessThan(0);
    expect(v.y).toBeCloseTo(Math.sin((-4.5895 * Math.PI) / 180), 5);

    // Longitude is 137.44 deg East (Quadrant II of x-z plane):
    // sin(137.44) > 0 -> x > 0 (East)
    // cos(137.44) < 0 -> z < 0
    expect(v.x).toBeGreaterThan(0);
    expect(v.z).toBeLessThan(0);

    // Vector magnitude should be exactly 1.0
    const mag = Math.hypot(v.x, v.y, v.z);
    expect(mag).toBeCloseTo(1.0, 5);
  });

  it("performs accurate roundtrip lat/lon <-> vector3 conversion for Gale Crater", () => {
    const v = latLonToVector3(GALE_LAT, GALE_LON, 1.0);
    const roundtrip = vector3ToLatLon(v);

    expect(roundtrip.lat).toBeCloseTo(GALE_LAT, 5);
    expect(roundtrip.lon).toBeCloseTo(GALE_LON, 5);
    expect(roundtrip.r).toBeCloseTo(1.0, 5);
  });

  it("verifies equirectangular texture coordinates for Gale Crater", () => {
    // Equirectangular projection:
    // U in [0, 1] maps longitude [-180, +180] deg: U = (lon + 180) / 360
    // V in [0, 1] maps latitude [-90, +90] deg: V = (lat + 90) / 180
    const expectedU = (GALE_LON + 180) / 360;
    const expectedV = (GALE_LAT + 90) / 180;

    expect(expectedU).toBeCloseTo(0.88178, 4);
    expect(expectedV).toBeCloseTo(0.4745, 4);
  });

  it("verifies SphereGeometry UV offset (+0.25) aligns with equirectangular Gale coordinates", () => {
    const sphereGeo = new SphereGeometry(1.0, 128, 64);
    const pos = sphereGeo.attributes.position;
    const uv = sphereGeo.attributes.uv;

    expect(pos).toBeDefined();
    expect(uv).toBeDefined();
    if (!pos || !uv) return;

    // Find vertex on SphereGeometry closest to Gale Crater
    const target = latLonToVector3(GALE_LAT, GALE_LON, 1.0);
    let bestDist = Infinity;
    let bestIdx = -1;

    for (let i = 0; i < pos.count; i++) {
      const dx = (pos.getX(i) ?? 0) - target.x;
      const dy = (pos.getY(i) ?? 0) - target.y;
      const dz = (pos.getZ(i) ?? 0) - target.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    expect(bestIdx).toBeGreaterThanOrEqual(0);

    const meshU = uv.getX(bestIdx) ?? 0;
    const meshV = uv.getY(bestIdx) ?? 0;

    // In Three.js SphereGeometry, the longitude origin (u=0) is at -90 deg (negative X axis).
    // An equirectangular Mars texture has its left edge at -180 deg and Prime Meridian at u=0.5.
    // The exact offset is +0.25 (i.e. +90 deg):
    const remappedU = (meshU + 0.25) % 1.0;
    const expectedU = (GALE_LON + 180) / 360;
    const expectedV = (GALE_LAT + 90) / 180;

    // Within mesh discretization error (128 lon slices -> 360/128 = 2.8 deg, 64 lat rings -> 180/64 = 2.8 deg):
    expect(Math.abs(remappedU - expectedU)).toBeLessThan(1 / 128);
    expect(Math.abs(meshV - expectedV)).toBeLessThan(1 / 64);

    sphereGeo.dispose();
  });
});
