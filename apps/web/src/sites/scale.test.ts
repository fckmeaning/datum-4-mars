import { describe, it, expect } from "vitest";
import { MARS_KM_PER_DEG, formatMetres, resolutionToMetres } from "./scale";

describe("Mars map scale", () => {
  it("is 59.27 km per degree", () => {
    expect(MARS_KM_PER_DEG).toBeCloseTo(59.2747, 3);
  });
  it("CTX level 12 is about 5 m per pixel at the equator", () => {
    expect(resolutionToMetres(0.3515625 / 2 ** 12, 0)).toBeCloseTo(5.09, 1);
  });
  it("shrinks east-west with latitude", () => {
    expect(resolutionToMetres(0.001, 60)).toBeCloseTo(resolutionToMetres(0.001, 0) / 2, 3);
  });
  it("formats metres and kilometres", () => {
    expect(formatMetres(5.2)).toBe("5 m");
    expect(formatMetres(2400)).toBe("2.4 km");
    expect(formatMetres(45000)).toBe("45 km");
  });
});
