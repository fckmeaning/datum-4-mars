import { describe, it, expect } from "vitest";
import { toMarsAoi, fromMarsAoi, ensureMarsAoiProjection } from "./projection";

describe("MARS:AOI projection", () => {
  it("registers and initializes correctly", () => {
    const proj = ensureMarsAoiProjection();
    expect(proj.getCode()).toBe("MARS:AOI");
  });

  it("projects AOI origin to approximately (0, 0)", () => {
    // Gale center: lon = 137.40, lat = -4.72
    const [x, y] = toMarsAoi([137.40, -4.72]);
    expect(Math.abs(x)).toBeLessThan(1e-3);
    expect(Math.abs(y)).toBeLessThan(1e-3);
  });

  it("satisfies round-trip lat/lon -> MARS:AOI -> lat/lon with error < 1e-6 deg", () => {
    const testPoints: [number, number][] = [
      [137.40, -4.72],
      [137.4417, -4.5895], // Bradbury Landing
      [137.3820, -4.7550], // Boxwork outcrops
      [137.28, -4.88],    // BBox SW
      [137.52, -4.56],    // BBox NE
    ];

    for (const [lon, lat] of testPoints) {
      const [x, y] = toMarsAoi([lon, lat]);
      const [lonBack, latBack] = fromMarsAoi([x, y]);

      expect(Math.abs(lonBack - lon)).toBeLessThan(1e-6);
      expect(Math.abs(latBack - lat)).toBeLessThan(1e-6);
    }
  });
});
