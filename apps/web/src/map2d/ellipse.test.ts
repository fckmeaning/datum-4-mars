import { describe, it, expect } from "vitest";
import { createEllipseCoordinates } from "./ellipse";

describe("createEllipseCoordinates", () => {
  it("generates closed polygon coordinates centered at origin", () => {
    const coords = createEllipseCoordinates(0, 0, 50, 25, 0, 16);
    expect(coords.length).toBe(17);
    // Closed polygon: start equals end
    expect(coords[0]![0]).toBeCloseTo(coords[16]![0], 5);
    expect(coords[0]![1]).toBeCloseTo(coords[16]![1], 5);
  });

  it("handles arbitrary center and rotation", () => {
    const coords = createEllipseCoordinates(1000, 2000, 40, 20, 45, 16);
    expect(coords.length).toBe(17);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThan(950);
      expect(x).toBeLessThan(1050);
      expect(y).toBeGreaterThan(1950);
      expect(y).toBeLessThan(2050);
    }
  });
});
