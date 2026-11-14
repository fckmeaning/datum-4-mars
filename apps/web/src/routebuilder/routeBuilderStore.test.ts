import { beforeEach, describe, expect, it } from "vitest";
import { GALE_BASE, MAX_HISTORY, OUT_OF_AOI_MESSAGE } from "./model";
import { useRouteBuilderStore } from "./routeBuilderStore";

const S = () => useRouteBuilderStore.getState();

beforeEach(() => S().reset());

describe("point editing with undo", () => {
  it("adds points inside the AOI and assigns roles", () => {
    expect(S().addPointAt(-4.7, 137.4).ok).toBe(true);
    expect(S().addPointAt(-4.65, 137.35).ok).toBe(true);
    expect(S().addPointAt(-4.6, 137.3).ok).toBe(true);
    expect(S().points.map((p) => p.role)).toEqual(["start", "via", "goal"]);
  });

  it("refuses a point outside the AOI with the human message and leaves the list alone", () => {
    const r = S().addPointAt(-3, 137.4);
    expect(r).toMatchObject({ ok: false, message: OUT_OF_AOI_MESSAGE });
    expect(S().points).toHaveLength(0);
    expect(S().notice).toBe(OUT_OF_AOI_MESSAGE);
  });

  it("snaps a first click near the habitat onto it", () => {
    S().addPointAt(GALE_BASE.lat + 0.0006, GALE_BASE.lon);
    expect(S().points[0]).toMatchObject({ lat: GALE_BASE.lat, lon: GALE_BASE.lon, placeId: GALE_BASE.id });
  });

  it("moves, removes, reorders, reverses and undoes step by step", () => {
    S().addPointAt(-4.7, 137.4);
    S().addPointAt(-4.65, 137.35);
    S().addPointAt(-4.6, 137.3);
    const [a, b, c] = S().points.map((p) => p.id) as [string, string, string];

    expect(S().movePointTo(b, -4.66, 137.36).ok).toBe(true);
    expect(S().points[1]).toMatchObject({ lat: -4.66, lon: 137.36 });

    S().reorder(2, 0);
    expect(S().points.map((p) => p.id)).toEqual([c, a, b]);

    S().reverse();
    expect(S().points.map((p) => p.id)).toEqual([b, a, c]);

    S().removePointById(a);
    expect(S().points.map((p) => p.id)).toEqual([b, c]);

    S().undo(); // remove
    expect(S().points).toHaveLength(3);
    S().undo(); // reverse
    expect(S().points.map((p) => p.id)).toEqual([c, a, b]);
    S().undo(); // reorder
    expect(S().points.map((p) => p.id)).toEqual([a, b, c]);
    S().undo(); // move
    expect(S().points[1]).toMatchObject({ lat: -4.65, lon: 137.35 });
  });

  it("refuses to drag a marker outside the AOI", () => {
    S().addPointAt(-4.7, 137.4);
    const id = S().points[0]!.id;
    expect(S().movePointTo(id, 10, 10).ok).toBe(false);
    expect(S().points[0]).toMatchObject({ lat: -4.7, lon: 137.4 });
  });

  it("clear empties everything and can be undone", () => {
    S().addPointAt(-4.7, 137.4);
    S().addPointAt(-4.6, 137.3);
    S().clear();
    expect(S().points).toHaveLength(0);
    expect(S().hasPlanned).toBe(false);
    S().undo();
    expect(S().points).toHaveLength(2);
  });

  it("bounds the undo history", () => {
    S().addPointAt(-4.7, 137.4);
    const id = S().points[0]!.id;
    for (let i = 0; i < MAX_HISTORY + 20; i++) S().movePointTo(id, -4.7 + (i % 5) * 0.001, 137.4);
    expect(S().history.length).toBeLessThanOrEqual(MAX_HISTORY);
  });

  it("marks user edits and system edits differently so that only user edits re-plan", () => {
    S().addPointAt(-4.7, 137.4);
    S().addPointAt(-4.6, 137.3);
    expect(S().change.source).toBe("user");
    S().replacePoints(S().points, "system");
    expect(S().change.source).toBe("user"); // same array: no change recorded
    S().replacePoints([...S().points].reverse(), "system");
    expect(S().change.source).toBe("system");
  });

  it("clears the selection when the selected point is removed", () => {
    S().addPointAt(-4.7, 137.4);
    const id = S().points[0]!.id;
    S().selectPoint(id);
    S().removePointById(id);
    expect(S().selectedPointId).toBeNull();
  });
});
