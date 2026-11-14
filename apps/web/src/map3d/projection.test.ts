import { describe, it, expect } from "vitest";
import { geoToAoi, aoiToGeo, aoiToScene, sceneToAoi } from "./projection";

describe("projection transformations", () => {
  it("projects AOI center (-4.72 lat, 137.40 lon) to (0, 0)", () => {
    const [x, y] = geoToAoi(-4.72, 137.40);
    expect(x).toBeCloseTo(0, 1);
    expect(y).toBeCloseTo(0, 1);
  });

  it("roundtrips coordinates between geo and aoi", () => {
    const originalLat = -4.5895; // Bradbury Landing
    const originalLon = 137.4417;

    const [aoiX, aoiY] = geoToAoi(originalLat, originalLon);
    expect(aoiX).toBeCloseTo(2463.8, 0);
    expect(aoiY).toBeCloseTo(7735.3, 0);

    const [roundLon, roundLat] = aoiToGeo(aoiX, aoiY);
    expect(roundLat).toBeCloseTo(originalLat, 4);
    expect(roundLon).toBeCloseTo(originalLon, 4);
  });

  it("converts between AOI meters and Three.js scene coordinates", () => {
    const aoiX = 1200;
    const aoiY = 3400;

    const scene = aoiToScene(aoiX, aoiY);
    expect(scene.sceneX).toBe(1200);
    expect(scene.sceneZ).toBe(-3400);

    const backAoi = sceneToAoi(scene.sceneX, scene.sceneZ);
    expect(backAoi.x).toBe(1200);
    expect(backAoi.y).toBe(3400);
  });
});
