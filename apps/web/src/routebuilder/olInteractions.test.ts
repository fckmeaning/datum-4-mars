import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureMarsAoiProjection, fromMarsAoi, toMarsAoi } from "../map2d/projection";
import { GALE_BBOX, addPoint, type BuilderPoint } from "./model";
import { addFromMapCoordinate, applyModifiedFeatures, isPointFeature, pointIdOf, syncFeatures } from "./olInteractions";
import { useRouteBuilderStore } from "./routeBuilderStore";

const S = () => useRouteBuilderStore.getState();

function list(n: number): BuilderPoint[] {
  let pts: BuilderPoint[] = [];
  for (let i = 0; i < n; i++) pts = addPoint(pts, { id: `p${i}`, lat: -4.7 + i * 0.01, lon: 137.4 });
  return pts;
}

beforeEach(() => {
  ensureMarsAoiProjection();
  S().reset();
});

describe("syncFeatures", () => {
  it("draws one marker per point, a preview line from two points, and the AOI frame only in planning mode", () => {
    const source = new VectorSource();
    const markers = syncFeatures(source, list(3), GALE_BBOX, null, true);
    expect(markers).toHaveLength(3);
    const kinds = source.getFeatures().map((f) => f.get("rb-kind") as string);
    expect(kinds.filter((k) => k === "point")).toHaveLength(3);
    expect(kinds).toContain("preview");
    expect(kinds).toContain("aoi");

    syncFeatures(source, list(1), GALE_BBOX, null, false);
    const k2 = source.getFeatures().map((f) => f.get("rb-kind") as string);
    expect(k2).toEqual(["point"]);
  });

  it("replaces the previous content instead of piling up features", () => {
    const source = new VectorSource();
    syncFeatures(source, list(3), GALE_BBOX, null, true);
    syncFeatures(source, list(2), GALE_BBOX, null, true);
    expect(source.getFeatures().filter(isPointFeature)).toHaveLength(2);
  });

  it("places markers at the projected coordinates and keeps the point id", () => {
    const source = new VectorSource();
    const [m] = syncFeatures(source, list(1), GALE_BBOX, "p0", false);
    const coord = m!.getGeometry()!.getCoordinates() as [number, number];
    const [lon, lat] = fromMarsAoi(coord);
    expect(lat).toBeCloseTo(-4.7, 6);
    expect(lon).toBeCloseTo(137.4, 6);
    expect(pointIdOf(m!)).toBe("p0");
  });
});

describe("map events to store", () => {
  it("adds a point from a map coordinate and reports success", () => {
    expect(addFromMapCoordinate(toMarsAoi([137.4, -4.7]))).toBe(true);
    expect(S().points).toHaveLength(1);
    expect(S().points[0]?.lat).toBeCloseTo(-4.7, 6);
  });

  it("refuses a coordinate outside the AOI", () => {
    expect(addFromMapCoordinate(toMarsAoi([140, -4.7]))).toBe(false);
    expect(S().points).toHaveLength(0);
    expect(S().notice).toContain("outside");
  });

  it("applies a dragged marker to the store", () => {
    S().addPointAt(-4.7, 137.4);
    const id = S().points[0]!.id;
    const f = new Feature(new Point(toMarsAoi([137.42, -4.68])));
    f.set("rb-kind", "point");
    f.set("rb-id", id);
    applyModifiedFeatures([f]);
    expect(S().points[0]?.lat).toBeCloseTo(-4.68, 5);
    expect(S().points[0]?.lon).toBeCloseTo(137.42, 5);
  });

  it("ignores modified features that are not markers", () => {
    S().addPointAt(-4.7, 137.4);
    const f = new Feature(new Point(toMarsAoi([137.45, -4.6])));
    f.set("rb-kind", "aoi");
    applyModifiedFeatures([f]);
    expect(S().points[0]?.lat).toBeCloseTo(-4.7, 6);
  });
});
