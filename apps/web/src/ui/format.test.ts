import { describe, it, expect } from "vitest";
import {
  DASH,
  bearingMars,
  coordForClipboard,
  distanceMars,
  formatBearing,
  formatCoord,
  formatDistance,
  formatDose,
  formatDuration,
  formatElevation,
  formatLat,
  formatLon,
  formatOxygen,
  formatSlope,
  formatSunset,
  formatTemperatureK,
  placeKindLabel,
} from "./format";

describe("coordinates", () => {
  it("puts the hemisphere letter from the sign", () => {
    expect(formatLat(-4.5895)).toBe("4.5895° S");
    expect(formatLat(18.4447)).toBe("18.4447° N");
    expect(formatLon(137.4417)).toBe("137.4417° E");
    expect(formatLon(-77.58)).toBe("77.5800° W");
    expect(formatCoord(-4.72, 137.4, 2)).toBe("4.72° S, 137.40° E");
  });

  it("copies signed decimal degrees", () => {
    expect(coordForClipboard(-4.5895, 137.4417)).toBe("-4.58950, 137.44170");
  });
});

describe("quantities", () => {
  it("formats durations and distances like the route cards", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(95 * 60)).toBe("1h 35m");
    expect(formatDuration(3600)).toBe("1h 00m");
    expect(formatDuration(undefined)).toBe(DASH);
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(12_345)).toBe("12.3 km");
    expect(formatDistance(null)).toBe(DASH);
  });

  it("formats dose, oxygen, slope, elevation, temperature", () => {
    expect(formatDose(0.004)).toBe("<0.01 mSv");
    expect(formatDose(1.234)).toBe("1.23 mSv");
    expect(formatOxygen(4.26)).toBe("4.3 L");
    expect(formatOxygen(132.4)).toBe("132 L");
    expect(formatSlope(8.54)).toBe("8.5°");
    expect(formatElevation(-4501.2)).toBe("−4,501 m");
    expect(formatTemperatureK(270)).toBe("270 K (−3°C)");
    expect(formatTemperatureK(300)).toBe("300 K (27°C)");
    expect(formatTemperatureK(NaN)).toBe(DASH);
  });

  it("describes the sunset", () => {
    expect(formatSunset(0)).toBe("Sun is down");
    expect(formatSunset(3 * 3600 + 20 * 60)).toBe("Sets in 3h 20m");
    expect(formatSunset(null)).toBe(DASH);
  });
});

describe("bearing and distance on the Mars sphere", () => {
  it("matches F01/F02 reference values", () => {
    expect(bearingMars(0, 0, 0, 1)).toBeCloseTo(90, 6);
    expect(bearingMars(0, 0, 1, 0)).toBeCloseTo(0, 6);
    expect(bearingMars(0, 0, -1, 0)).toBeCloseTo(180, 6);
    expect(bearingMars(0, 0, 0, -1)).toBeCloseTo(270, 6);
    expect(distanceMars(0, 0, 90, 0)).toBeCloseTo((Math.PI / 2) * 3_396_190, 3);
    expect(distanceMars(-4.7, 137.4, -4.7, 137.4)).toBe(0);
  });

  it("formats compass bearings with three digits and a wind", () => {
    expect(formatBearing(0)).toBe("000° N");
    expect(formatBearing(42)).toBe("042° NE");
    expect(formatBearing(359.6)).toBe("360° N");
    expect(formatBearing(-90)).toBe("270° W");
    expect(formatBearing(undefined)).toBe(DASH);
  });
});

describe("labels", () => {
  it("names place kinds for people", () => {
    expect(placeKindLabel("base")).toBe("Base");
    expect(placeKindLabel("mission_informal", true)).toBe("Science");
    expect(placeKindLabel("mission_informal")).toBe("Traverse");
    expect(placeKindLabel("gazetteer")).toBe("Landmark");
    expect(placeKindLabel("coordinate")).toBe("Coordinate");
  });
});
