import { describe, it, expect } from "vitest";
import { fetchMissionClock, formatHours, formatLight, solFromMsd, sunriseSunset } from "./missionClock";

describe("mission clock helpers", () => {
  it("counts whole local solar days since the landing day", () => {
    expect(solFromMsd(54343.2, 54343.1, 0)).toBe(0);
    expect(solFromMsd(54344.05, 54343.9, 0)).toBe(1);
    // a longitude shifts both by the same amount, so the count changes when the shift moves one of them across local midnight
    expect(solFromMsd(54344.05, 54343.9, 90)).toBe(0);
    expect(solFromMsd(54344.9, 54343.9, 90)).toBe(1);
  });
  it("sunrise and sunset are symmetric about local noon and the day is 12 h at the equator", () => {
    const eq = sunriseSunset(0, 10)!;
    expect(eq.sunriseH).toBeCloseTo(6, 6);
    expect(eq.sunsetH).toBeCloseTo(18, 6);
    const n = sunriseSunset(60, 20)!;
    expect(n.sunriseH + n.sunsetH).toBeCloseTo(24, 6);
    expect(n.sunsetH - n.sunriseH).toBeGreaterThan(12);
    expect(sunriseSunset(85, 20)).toBeNull(); // polar day
  });
  it("formats", () => {
    expect(formatHours(9.25)).toBe("09:15");
    expect(formatHours(23.999)).toBe("00:00");
    expect(formatLight(658.4)).toBe("10m 58s");
  });
});

describe("fetchMissionClock", () => {
  const sunAt = (msd: number) => ({ msd, ls_deg: 21.9, lmst_h: 8.1, ltst_h: 8.0, declination_deg: 9.2, elevation_deg: 30 });
  const make = (fail = false) =>
    (async (url: string) => {
      if (fail) throw new Error("offline");
      if (url.includes("/earth/light-time")) return { ok: true, json: async () => ({ one_way_s: 659 }) };
      // the landing call carries the 2021 date
      return { ok: true, json: async () => (url.includes("2021-02-18") ? sunAt(52304.4) : sunAt(54343.0)) };
    }) as unknown as typeof fetch;

  it("gives sol, time, season and the Earth link for an active mission", async () => {
    const c = await fetchMissionClock("jezero", { lat: 18.4447, lon: 77.4508 }, new Date("2026-11-14T14:30:00Z"), make());
    expect(c).not.toBeNull();
    expect(c!.sol).toBe(Math.floor(54343.0 + 77.4508 / 360) - Math.floor(52304.4 + 77.4508 / 360));
    expect(c!.lsDeg).toBe(21.9);
    expect(c!.lightS).toBe(659);
  });
  it("has no sol for an ended mission and tolerates a missing API", async () => {
    const ended = await fetchMissionClock("gusev", { lat: -14.57, lon: 175.47 }, new Date(), make());
    expect(ended!.sol).toBeNull();
    expect(await fetchMissionClock("gale", { lat: -4.6, lon: 137.4 }, new Date(), make(true))).toBeNull();
  });
});
