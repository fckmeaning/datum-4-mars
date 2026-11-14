import { describe, it, expect } from "vitest";
import { BREAKPOINTS, STAT_PRIORITY, computeMissionBarLayout, seasonName } from "./missionBarLayout";

describe("computeMissionBarLayout", () => {
  it("shows everything when the width is unknown", () => {
    for (const w of [0, NaN, -5]) {
      const l = computeMissionBarLayout(w);
      expect(l.stats).toEqual([...STAT_PRIORITY]);
      expect(l.showSiteName && l.showBadge).toBe(true);
    }
  });

  it("drops chrome first, then stats from the end of the priority list", () => {
    const steps = [
      [BREAKPOINTS.full, ["sol", "lmst", "link", "ls"], true, true],
      [BREAKPOINTS.siteName, ["sol", "lmst", "link", "ls"], true, false],
      [BREAKPOINTS.fourStats, ["sol", "lmst", "link", "ls"], false, false],
      [BREAKPOINTS.threeStats, ["sol", "lmst", "link"], false, false],
      [BREAKPOINTS.twoStats, ["sol", "lmst"], false, false],
      [BREAKPOINTS.twoStats - 1, ["sol"], false, false],
    ] as const;
    for (const [width, stats, site, badge] of steps) {
      const l = computeMissionBarLayout(width);
      expect(l.stats).toEqual([...stats]);
      expect(l.showSiteName).toBe(site);
      expect(l.showBadge).toBe(badge);
    }
  });

  it("never needs more width than it is given (tile 104 px, gap 4 px, padding 24 px)", () => {
    const need = (n: number, extra = 0) => n * 104 + (n - 1) * 4 + 24 + extra;
    // a layout is allowed at width W only if its stats fit in W (the site name and badge are given ~170 and ~90 px)
    expect(need(4, 170 + 90 + 24)).toBeLessThanOrEqual(BREAKPOINTS.full);
    expect(need(4, 170 + 12)).toBeLessThanOrEqual(BREAKPOINTS.siteName);
    expect(need(4)).toBeLessThanOrEqual(BREAKPOINTS.fourStats);
    expect(need(3)).toBeLessThanOrEqual(BREAKPOINTS.threeStats);
    expect(need(2)).toBeLessThanOrEqual(BREAKPOINTS.twoStats);
  });

  it("is monotone: a narrower bar never shows more", () => {
    let prev = Infinity;
    for (let w = 900; w >= 100; w -= 10) {
      const l = computeMissionBarLayout(w);
      const score = l.stats.length * 10 + (l.showSiteName ? 2 : 0) + (l.showBadge ? 1 : 0);
      expect(score).toBeLessThanOrEqual(prev);
      prev = score;
    }
  });

  it("keeps SOL then LMST at the narrowest widths (priority order)", () => {
    expect(computeMissionBarLayout(300).stats).toEqual(["sol", "lmst"]);
    expect(computeMissionBarLayout(200).stats).toEqual(["sol"]);
  });
});

describe("seasonName", () => {
  it("follows the solar longitude quadrants", () => {
    expect(seasonName(0.6)).toBe("Northern spring");
    expect(seasonName(142.3)).toBe("Northern summer");
    expect(seasonName(200)).toBe("Northern autumn");
    expect(seasonName(277.2)).toBe("Northern winter");
    expect(seasonName(-10)).toBe("Northern winter");
    expect(seasonName(360)).toBe("Northern spring");
  });
});
