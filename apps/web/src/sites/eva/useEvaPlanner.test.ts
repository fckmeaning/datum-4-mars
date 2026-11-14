import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEvaPlanner } from "./useEvaPlanner";
import type { SiteDem } from "../useSiteDem";

/** 2 x 2 degrees of flat ground around (0, 0): 80 x 80 cells of about 3 km */
function flatDem(): SiteDem {
  const w = 80;
  return {
    meta: { id: "t", centre: { lat: 0, lon: 0 }, bounds: { west: -0.05, east: 0.05, north: 0.05, south: -0.05 }, width: w, height: w, pixel_m: 74, min_m: 0, max_m: 0, offset: 32768 },
    heights: new Float32Array(w * w),
    dir: "/data/sites/t",
  };
}

const station = { lat: 0, lon: 0 };

describe("useEvaPlanner goals and stops", () => {
  it("a goal puts its named places on the plan and clears when the stops are edited by hand", () => {
    const dem = flatDem();
    const { result } = renderHook(() => useEvaPlanner(dem, station));
    act(() => result.current.setStopsFromList([{ id: "a", name: "Alpha", lat: 0.01, lon: 0.01 }, { id: "b", name: "Beta", lat: 0.02, lon: -0.01 }], "g1"));
    expect(result.current.goalId).toBe("g1");
    expect(result.current.stops.map((s) => s.name)).toEqual(["Alpha", "Beta"]);
    expect(result.current.selected).toBe(0);
    expect(result.current.plan).not.toBeNull();
    expect(result.current.plan!.stopNodes).toHaveLength(2);
    expect(result.current.overlay!.names).toEqual(["Alpha", "Beta"]);
    act(() => result.current.addStop(0.03, 0.03));
    expect(result.current.goalId).toBeNull();
    expect(result.current.stops).toHaveLength(3);
    expect(result.current.stops[2]!.name).toBeUndefined();
  });

  it("removing a stop and reset drop the goal; at most six stops", () => {
    const dem = flatDem();
    const { result } = renderHook(() => useEvaPlanner(dem, station));
    act(() => result.current.setStopsFromList([{ id: "a", name: "Alpha", lat: 0.01, lon: 0.01 }, { id: "b", name: "Beta", lat: 0.02, lon: 0 }], "g1"));
    act(() => result.current.removeStop(0));
    expect(result.current.goalId).toBeNull();
    expect(result.current.stops.map((s) => s.name)).toEqual(["Beta"]);
    for (let i = 0; i < 10; i++) act(() => result.current.addStopLocal(100 * i, 100));
    expect(result.current.stops).toHaveLength(6);
    act(() => result.current.reset());
    expect(result.current.stops).toHaveLength(0);
    expect(result.current.plan).toBeNull();
  });

  it("the simulation starts at the airlock and stops when the plan changes", () => {
    const dem = flatDem();
    const { result } = renderHook(() => useEvaPlanner(dem, station));
    act(() => result.current.setStopsFromList([{ id: "a", name: "Alpha", lat: 0.01, lon: 0.01 }], "g1"));
    act(() => result.current.toggleSim());
    expect(result.current.playing).toBe(true);
    expect(result.current.at).not.toBeNull();
    act(() => result.current.addStopLocal(500, 500));
    expect(result.current.playing).toBe(false);
    expect(result.current.at).toBeNull();
  });
});
