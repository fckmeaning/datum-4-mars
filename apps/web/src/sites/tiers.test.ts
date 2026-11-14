import { describe, it, expect } from "vitest";
import { bestTier, tiersFor, zoomForBounds } from "./tiers";

describe("site tiers", () => {
  it("every site has the regional patch; Gale and Jezero have more", () => {
    expect(tiersFor("meridiani")).toHaveLength(1);
    expect(tiersFor("meridiani")[0]!.id).toBeUndefined();
    expect(tiersFor("gale").map((t) => t.id)).toEqual([undefined, "aoi"]);
    expect(tiersFor("jezero").map((t) => t.id)).toEqual([undefined, "crater", "site"]);
  });
  it("opens with the most detailed tier", () => {
    expect(bestTier("jezero").id).toBe("site");
    expect(bestTier("gale").id).toBe("aoi");
    expect(bestTier("gusev").id).toBeUndefined();
  });
  it("fits a patch to the view: smaller patches zoom in further", () => {
    const regional = zoomForBounds(0, 2); // 2 degrees (MOLA patch)
    const site = zoomForBounds(77.39, 77.4967); // 6 km
    expect(site).toBeGreaterThan(regional);
    expect(zoomForBounds(0, 0.0001)).toBeLessThanOrEqual(14);
    expect(zoomForBounds(-180, 180)).toBe(0);
  });
});

import { parentTier, zoneChild } from "./tiers";
describe("zones between tiers", () => {
  it("Jezero goes regional -> crater -> site and back", () => {
    expect(zoneChild("jezero", undefined)).toEqual({ to: "crater", name: "Crater overview" });
    expect(zoneChild("jezero", "crater")).toEqual({ to: "site", name: "Close-up area" });
    expect(zoneChild("jezero", "site")).toBeNull();
    expect(parentTier("jezero", "site")!.id).toBe("crater");
    expect(parentTier("jezero", "crater")!.id).toBeUndefined();
    expect(parentTier("jezero", undefined)).toBeNull();
  });
  it("Gale has its planner area inside the regional tile; other sites have none", () => {
    expect(zoneChild("gale", undefined)!.to).toBe("aoi");
    expect(parentTier("gale", "aoi")!.id).toBeUndefined();
    expect(zoneChild("gusev", undefined)).toBeNull();
  });
});
