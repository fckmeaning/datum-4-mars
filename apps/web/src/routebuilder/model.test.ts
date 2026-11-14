import { describe, expect, it } from "vitest";
import {
  GALE_BASE,
  GALE_BBOX,
  addPoint,
  applyOrder,
  formatCoord,
  haversineM,
  insideBBox,
  movePoint,
  normaliseRoles,
  removePoint,
  reorderPoint,
  reversePoints,
  setDwell,
  snapToBase,
  toWaypoints,
  type BuilderPoint,
} from "./model";

function build(n: number): BuilderPoint[] {
  let pts: BuilderPoint[] = [];
  for (let i = 0; i < n; i++) pts = addPoint(pts, { id: `p${i}`, lat: -4.7 + i * 0.01, lon: 137.4 });
  return pts;
}

describe("roles follow position", () => {
  it("first is the start, last of two or more is the goal, the rest are stops", () => {
    expect(build(1).map((p) => p.role)).toEqual(["start"]);
    expect(build(2).map((p) => p.role)).toEqual(["start", "goal"]);
    expect(build(4).map((p) => p.role)).toEqual(["start", "via", "via", "goal"]);
  });

  it("gives stops a default dwell and zeroes the ends", () => {
    const pts = build(3);
    expect(pts[1]?.dwell_min).toBe(10);
    expect(pts[0]?.dwell_min).toBe(0);
    expect(pts[2]?.dwell_min).toBe(0);
  });

  it("keeps a science flag on a middle point", () => {
    const pts = build(3).map((p, i) => (i === 1 ? { ...p, role: "science" as const } : p));
    expect(normaliseRoles(pts)[1]?.role).toBe("science");
  });
});

describe("editing reducers", () => {
  it("removes a point and recomputes the roles", () => {
    const pts = removePoint(build(3), "p2");
    expect(pts.map((p) => [p.id, p.role])).toEqual([
      ["p0", "start"],
      ["p1", "goal"],
    ]);
  });

  it("reorders by dragging and renumbers the roles", () => {
    const pts = reorderPoint(build(3), 2, 0);
    expect(pts.map((p) => p.id)).toEqual(["p2", "p0", "p1"]);
    expect(pts.map((p) => p.role)).toEqual(["start", "via", "goal"]);
  });

  it("ignores impossible and no-op reorders", () => {
    const pts = build(3);
    expect(reorderPoint(pts, 5, 0)).toBe(pts);
    expect(reorderPoint(pts, 1, 1)).toBe(pts);
    expect(reorderPoint(pts, 0, 99).map((p) => p.id)).toEqual(["p1", "p2", "p0"]);
  });

  it("reverses the list and swaps start and goal", () => {
    const pts = reversePoints(build(3));
    expect(pts.map((p) => p.id)).toEqual(["p2", "p1", "p0"]);
    expect(pts.map((p) => p.role)).toEqual(["start", "via", "goal"]);
  });

  it("moves a point and drops its place name unless it snaps to the base", () => {
    const named = build(2).map((p, i) => (i === 1 ? { ...p, name: "Somewhere", placeId: "x" } : p));
    const moved = movePoint(named, "p1", -4.65, 137.35);
    expect(moved[1]).toMatchObject({ lat: -4.65, lon: 137.35 });
    expect(moved[1]?.name).toBeUndefined();
    expect(moved[1]?.placeId).toBeUndefined();
    const snapped = movePoint(named, "p1", GALE_BASE.lat + 0.0005, GALE_BASE.lon, GALE_BASE);
    expect(snapped[1]).toMatchObject({ lat: GALE_BASE.lat, lon: GALE_BASE.lon, placeId: GALE_BASE.id });
  });

  it("clamps dwell to 0..240 whole minutes", () => {
    const pts = build(3);
    expect(setDwell(pts, "p1", 999)[1]?.dwell_min).toBe(240);
    expect(setDwell(pts, "p1", -5)[1]?.dwell_min).toBe(0);
    expect(setDwell(pts, "p1", 12.6)[1]?.dwell_min).toBe(13);
  });

  it("applies a valid permutation and rejects an invalid one", () => {
    const pts = build(3);
    expect(applyOrder(pts, [0, 2, 1]).map((p) => p.id)).toEqual(["p0", "p2", "p1"]);
    expect(applyOrder(pts, [0, 0, 1])).toBe(pts);
    expect(applyOrder(pts, [0, 1])).toBe(pts);
    expect(applyOrder(pts, [0, 1, 7])).toBe(pts);
  });
});

describe("geometry helpers", () => {
  it("snaps within 150 m of the base only", () => {
    const near = snapToBase(GALE_BASE.lat + 0.001, GALE_BASE.lon, GALE_BASE); // about 59 m
    expect(near.placeId).toBe(GALE_BASE.id);
    const far = snapToBase(GALE_BASE.lat + 0.01, GALE_BASE.lon, GALE_BASE); // about 590 m
    expect(far.placeId).toBeUndefined();
    expect(far.lat).toBeCloseTo(GALE_BASE.lat + 0.01, 9);
  });

  it("haversine of one degree of latitude is about 59.27 km", () => {
    expect(haversineM(0, 0, 1, 0)).toBeCloseTo(59274.7, 0);
  });

  it("tests the bounding box inclusively", () => {
    expect(insideBBox(-4.7, 137.4, GALE_BBOX)).toBe(true);
    expect(insideBBox(GALE_BBOX.lat_max, GALE_BBOX.lon_min, GALE_BBOX)).toBe(true);
    expect(insideBBox(-4.0, 137.4, GALE_BBOX)).toBe(false);
    expect(insideBBox(-4.7, 140, GALE_BBOX)).toBe(false);
  });

  it("rounds API waypoints to 6 decimals and keeps place ids", () => {
    const pts = addPoint([], { lat: -4.58947123456, lon: 137.441633999, placeId: "gale.base" });
    const [wp] = toWaypoints(pts);
    expect(wp).toEqual({ role: "start", lat: -4.589471, lon: 137.441634, dwell_min: 0, place_id: "gale.base" });
  });

  it("formats coordinates with hemispheres", () => {
    expect(formatCoord(-4.5895, 137.4417)).toBe("4.5895° S, 137.4417° E");
  });
});
