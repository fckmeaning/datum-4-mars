import { describe, expect, it } from "vitest";
import { alternativesBody, makeRoute } from "./fixtures";
import { cardFacts, chartBars, factorShares, formatDistance, formatDuration, formatSunset, ribbonPieces, verdictOf, whyRoute } from "./explain";

describe("formatting", () => {
  it("formats durations, distances and sunset", () => {
    expect(formatDuration(20)).toBe("<1 min");
    expect(formatDuration(42 * 60)).toBe("42 min");
    expect(formatDuration(85 * 60)).toBe("1 h 25 min");
    expect(formatDistance(640)).toBe("640 m");
    expect(formatDistance(1240)).toBe("1.24 km");
    expect(formatSunset(null)).toBe("n/a");
    expect(formatSunset(0)).toBe("sun is down");
    expect(formatSunset(5400)).toBe("in 1 h 30 min");
  });

  it("builds the card facts", () => {
    const f = cardFacts(makeRoute("FASTEST", { time_s: 3600 }));
    expect(f).toMatchObject({ time: "1 h 00 min", distance: "1.00 km", dose: "0.50 mSv", maxSlope: "11.5°", turnBack: "no limit hit" });
  });
});

describe("verdict", () => {
  it("uses the first reason, or a violation, or a default", () => {
    expect(verdictOf(makeRoute("SAFEST", { call: "CAUTION", reasons: ["Thin oxygen reserve."] }))).toEqual({ call: "CAUTION", reason: "Thin oxygen reserve." });
    expect(verdictOf(makeRoute("SAFEST", { call: "NO_GO" }))).toEqual({ call: "NO_GO", reason: "Oxygen runs out before the return." });
    expect(verdictOf(makeRoute("FASTEST")).call).toBe("READY");
  });
});

describe("limiting-factor ribbon", () => {
  it("merges adjacent segments with the same factor and sums to 1", () => {
    const r = makeRoute("FASTEST", {
      factors: [
        ["time", 100],
        ["time", 100],
        ["slope", 200],
        ["time", 100],
      ],
    });
    const pieces = ribbonPieces(r);
    expect(pieces.map((p) => p.factor)).toEqual(["time", "slope", "time"]);
    expect(pieces.map((p) => Math.round(p.fraction * 100))).toEqual([40, 40, 20]);
    expect(pieces.reduce((s, p) => s + p.fraction, 0)).toBeCloseTo(1, 9);
  });

  it("returns nothing for a route without length", () => {
    expect(ribbonPieces(makeRoute("FASTEST", { factors: [] }))).toEqual([]);
    expect(factorShares(makeRoute("FASTEST", { factors: [] }))).toEqual([]);
  });

  it("ranks factors by share of the distance", () => {
    const shares = factorShares(makeRoute("SAFEST", { factors: [["dose", 700], ["time", 300]] }));
    expect(shares[0]).toMatchObject({ factor: "dose", label: "radiation dose" });
    expect(shares[0]?.fraction).toBeCloseTo(0.7, 9);
  });
});

describe("why this route", () => {
  const all = alternativesBody().routes;

  it("names the dominant factor and the verdict", () => {
    const text = whyRoute(all[1]!, all).join(" ");
    expect(text).toContain("Minimises risk");
    expect(text).toContain("walking time");
    expect(text).toContain("Verdict CAUTION: Returns with a thin oxygen reserve.");
  });

  it("compares with FASTEST in plain numbers", () => {
    const text = whyRoute(all[1]!, all).join(" ");
    // SAFEST 3900 s vs FASTEST 3000 s = +15 min (+30 %), dose 0.4 vs 0.6 = -33 %
    expect(text).toContain("+15 min (+30 %) versus FASTEST");
    expect(text).toContain("-33 % dose");
  });

  it("does not compare FASTEST with itself", () => {
    expect(whyRoute(all[0]!, all).join(" ")).not.toContain("Compared with FASTEST");
  });

  it("works without the other alternatives", () => {
    expect(whyRoute(all[2]!).length).toBeGreaterThanOrEqual(3);
  });
});

describe("comparison chart", () => {
  it("normalises time and risk against the largest value", () => {
    const bars = chartBars(alternativesBody().routes);
    expect(Math.max(...bars.map((b) => b.time))).toBe(1);
    expect(Math.max(...bars.map((b) => b.risk))).toBe(1);
    expect(bars.find((b) => b.profile === "FASTEST")?.time).toBeCloseTo(3000 / 4200, 9);
  });
});
