import { describe, it, expect } from "vitest";
import { formatLatLon, isInsideCoverage } from "./coords";

describe("formatLatLon", () => {
  it("uses S for negative and N for positive latitude", () => {
    expect(formatLatLon(-4.5895, 137.4417)).toBe("4.59° S, 137.44° E");
    expect(formatLatLon(18.4, 77.6)).toBe("18.40° N, 77.60° E");
  });
  it("wraps negative longitude into east-positive 0..360", () => {
    expect(formatLatLon(0, -90)).toBe("0.00° N, 270.00° E");
  });
});

describe("isInsideCoverage", () => {
  it("accepts Gale and rejects Jezero", () => {
    expect(isInsideCoverage(-4.59, 137.44)).toBe(true);
    expect(isInsideCoverage(18.4, 77.6)).toBe(false);
  });
});
