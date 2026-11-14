import { describe, it, expect } from "vitest";
import { MISSION, doseBudget, findMissionEvents, hohmannGeometry, inDustSeason, marsLead, sunEarthMarsDeg } from "./missionMath";

async function yamlNum(key: string): Promise<number> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const yaml = fs.readFileSync(path.resolve(__dirname, "../../../../config/params.yaml"), "utf8");
  const start = yaml.indexOf("\nmission:");
  const rest = yaml.slice(start + 1);
  const m = new RegExp(`\\b${key}:\\s*\\{ value: ([0-9.eE+-]+)`).exec(rest);
  if (!m) throw new Error(`mission.${key} not found`);
  return Number(m[1]);
}

const DAY = 86_400_000;

describe("mission constants against config/params.yaml", () => {
  it("match", async () => {
    for (const k of Object.keys(MISSION) as Array<keyof typeof MISSION>) expect(MISSION[k]).toBe(await yamlNum(k));
  });
});

describe("transfer geometry", () => {
  it("Mars leads Earth by about 44 deg at a minimum-energy launch, the trip takes about 259 days", () => {
    const h = hohmannGeometry();
    expect(h.leadDeg).toBeGreaterThan(43.5);
    expect(h.leadDeg).toBeLessThan(45.5);
    expect(h.transferDays).toBeGreaterThan(255);
    expect(h.transferDays).toBeLessThan(263);
  });
});

describe("launch windows, oppositions and conjunctions", () => {
  const events = findMissionEvents(Date.parse("2025-06-01T00:00:00Z"), Date.parse("2034-01-01T00:00:00Z"));
  const of = (k: string) => events.filter((e) => e.kind === k);

  it("finds the known oppositions (2027-02-19, 2029-03-25, 2031-05-04) within a week", () => {
    const opp = of("opposition").map((e) => e.ms);
    for (const iso of ["2027-02-19", "2029-03-25", "2031-05-04"]) {
      expect(opp.some((ms) => Math.abs(ms - Date.parse(iso)) < 7 * DAY)).toBe(true);
    }
  });
  it("finds the solar conjunction of January 2026 and the next one 26 months later", () => {
    const conj = of("conjunction");
    expect(conj.some((e) => Math.abs(e.ms - Date.parse("2026-01-09")) < 10 * DAY)).toBe(true);
    const gaps = conj.slice(1).map((e, i) => (e.ms - conj[i]!.ms) / DAY);
    for (const g of gaps) expect(g).toBeGreaterThan(760);
    for (const g of gaps) expect(g).toBeLessThan(820); // the synodic period varies between about 764 and 810 days
  });
  it("has a launch window around the turn of 2026 to 2027, then about every 26 months", () => {
    const launches = of("launch");
    expect(launches.some((e) => e.ms > Date.parse("2026-09-01") && e.ms < Date.parse("2027-02-01"))).toBe(true);
    const gaps = launches.slice(1).map((e, i) => (e.ms - launches[i]!.ms) / DAY);
    for (const g of gaps) expect(Math.abs(g - 780)).toBeLessThan(25);
  });
  it("a launch comes before the opposition it leads to, and the arrival falls in a season", () => {
    for (const l of of("launch")) {
      const next = of("opposition").find((o) => o.ms > l.ms);
      if (next) expect(next.ms - l.ms).toBeGreaterThan(60 * DAY);
      expect(l.arrival!.ms - l.ms).toBeGreaterThan(250 * DAY);
      expect(l.arrival!.lsDeg).toBeGreaterThanOrEqual(0);
      expect(l.arrival!.lsDeg).toBeLessThan(360);
      expect(l.arrival!.inDustSeason).toBe(inDustSeason(l.arrival!.lsDeg));
    }
  });
  it("the radio blackout around a conjunction lasts some days to a month", () => {
    for (const c of of("conjunction")) {
      expect(c.blackoutDays!).toBeGreaterThan(3);
      expect(c.blackoutDays!).toBeLessThan(35);
    }
  });
  it("the helper angles are consistent: lead is near 0 at an opposition, Sun-Earth-Mars near 0 at a conjunction", () => {
    const opp = of("opposition")[0]!;
    expect(Math.abs(marsLead(opp.ms))).toBeLessThan(0.7);
    const conj = of("conjunction")[0]!;
    expect(sunEarthMarsDeg(conj.ms)).toBeLessThan(5);
  });
});

describe("dust season", () => {
  it("is Ls 180 to 360", () => {
    expect(inDustSeason(179.9)).toBe(false);
    expect(inDustSeason(180)).toBe(true);
    expect(inDustSeason(359.9)).toBe(true);
    expect(inDustSeason(0)).toBe(false);
  });
});

describe("dose budget", () => {
  it("adds the two transits and the surface stay", () => {
    const b = doseBudget({ surfaceMSvPerDay: 0.64 });
    expect(b.transitMSv).toBeCloseTo(2 * 180 * 1.84, 9);
    expect(b.surfaceMSv).toBeCloseTo(500 * 0.64, 9);
    expect(b.totalMSv).toBeCloseTo(b.transitMSv + b.surfaceMSv, 9);
    expect(b.totalDays).toBe(860);
    expect(b.points.at(-1)!.mSv).toBeCloseTo(b.totalMSv, 9);
    expect(b.points.map((p) => p.phase)).toEqual(["outbound", "outbound", "surface", "return"]);
  });
  it("the transits alone exceed the 600 mSv career limit with the reference numbers, so no surface stay is left", () => {
    const b = doseBudget({ surfaceMSvPerDay: 0.64 });
    expect(b.transitMSv).toBeGreaterThan(600);
    expect(b.maxStayDays).toBe(0);
    // the limit is crossed during the stay: after the outbound cruise plus the rest of the 600 mSv at the surface rate
    expect(b.limitDay).toBeCloseTo(180 + (600 - 180 * 1.84) / 0.64, 6);
  });
  it("a short transit leaves a stay, which shrinks with the dose rate and grows with shielding", () => {
    const base = doseBudget({ surfaceMSvPerDay: 0.64, transitDays: 90, stayDays: 300 });
    expect(base.maxStayDays).toBeCloseTo((600 - 2 * 90 * 1.84) / 0.64, 6);
    const hot = doseBudget({ surfaceMSvPerDay: 1.28, transitDays: 90, stayDays: 300 });
    expect(hot.maxStayDays).toBeCloseTo(base.maxStayDays / 2, 6);
    const shielded = doseBudget({ surfaceMSvPerDay: 0.64, transitDays: 90, stayDays: 300, shielding: 0.5 });
    expect(shielded.maxStayDays).toBeCloseTo(base.maxStayDays * 2, 6);
    expect(shielded.surfaceMSv).toBeCloseTo(base.surfaceMSv / 2, 9);
  });
  it("no limit crossing when the total stays below it", () => {
    const b = doseBudget({ surfaceMSvPerDay: 0.5, transitDays: 60, stayDays: 100 });
    expect(b.totalMSv).toBeLessThan(600);
    expect(b.limitDay).toBeNull();
  });
});
