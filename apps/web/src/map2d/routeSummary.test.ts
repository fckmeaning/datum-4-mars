import { describe, it, expect } from "vitest";
import { describeFactors, summariseLimitingFactors } from "./routeSummary";
import type { components } from "../api/schema";

type Segment = components["schemas"]["Segment"];

function seg(i: number, duration_s: number, limiting_factor: Segment["limiting_factor"]): Segment {
  return {
    i,
    length_m: duration_s,
    duration_s,
    slope_deg: 3,
    components: { time: 1, energy: 1, dose: 1, hazard: 1, science_factor: 1 },
    cost: 1,
    limiting_factor,
  };
}

describe("summariseLimitingFactors", () => {
  it("weights by duration, sorts largest first and sums to 1", () => {
    const shares = summariseLimitingFactors([seg(0, 600, "time"), seg(1, 300, "slope"), seg(2, 100, "time"), seg(3, 100, "dose")], 0);
    expect(shares.map((s) => s.factor)).toEqual(["time", "slope", "dose"]);
    expect(shares[0]?.share).toBeCloseTo(700 / 1100, 9); // time: 600 s + 100 s of 1100 s
    expect(shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 9);
  });

  it("drops tiny shares and handles empty or zero-time routes", () => {
    expect(summariseLimitingFactors([seg(0, 970, "time"), seg(1, 30, "dose")]).map((s) => s.factor)).toEqual(["time"]);
    expect(summariseLimitingFactors([])).toEqual([]);
    expect(summariseLimitingFactors([seg(0, 0, "time")])).toEqual([]);
  });

  it("ignores non-finite durations instead of returning NaN shares", () => {
    const shares = summariseLimitingFactors([seg(0, NaN, "time"), seg(1, 100, "slope")], 0);
    expect(shares).toHaveLength(2);
    expect(shares.every((s) => Number.isFinite(s.share))).toBe(true);
    expect(shares[0]?.factor).toBe("slope");
  });

  it("describes the top factors in one line", () => {
    const shares = summariseLimitingFactors([seg(0, 620, "time"), seg(1, 250, "slope"), seg(2, 130, "hazard")]);
    expect(describeFactors(shares)).toBe("62% walking time, 25% slope, 13% terrain hazard");
    expect(describeFactors(shares, 1)).toBe("62% walking time");
  });
});
