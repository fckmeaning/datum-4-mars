import { describe, it, expect } from "vitest";
import { describeUnit } from "./geology";
import { unitIdAt } from "./geologyLookup";

describe("describeUnit", () => {
  it("names a Noachian-Hesperian transition unit", () => {
    const u = describeUnit("HNt");
    expect(u.name).toBe("Hesperian and Noachian transition unit");
    expect(u.group).toBe("transition");
    expect(u.text).toMatch(/breccias/);
  });
  it("gives an age range for an early epoch unit", () => {
    expect(describeUnit("eHv").age).toBe("3.56–3.39 billion years ago");
    expect(describeUnit("lHl").age).toBe("3.39–3.24 billion years ago");
  });
  it("tolerates unknown symbols", () => {
    expect(describeUnit("???")).toEqual({ sym: "???", name: "???", age: "", group: "", text: "" });
  });
});

describe("unitIdAt", () => {
  // 4x2 raster: lon -180..180 → x 0..3, lat 90..-90 → y 0..1
  const ids = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  it("maps lat/lon to the right pixel", () => {
    expect(unitIdAt(ids, 4, 2, 45, -170)).toBe(1);
    expect(unitIdAt(ids, 4, 2, 45, 170)).toBe(4);
    expect(unitIdAt(ids, 4, 2, -45, 0)).toBe(7);
  });
  it("wraps longitudes beyond 180", () => {
    expect(unitIdAt(ids, 4, 2, 45, 190)).toBe(unitIdAt(ids, 4, 2, 45, -170));
  });
});
