import { describe, expect, it } from "vitest";
import type { LayerMeta } from "../../api/client";
import { getBestLayer, getOpticalLayer, getWalkabilityLayer } from "../layerLevel";
import { buildLegend, formatMeters, isochroneColor, resolutionNote } from "./legend";
import { classFor, readClasses } from "./classes";
import { parseIsochrones, unpackBits, viewshedRgba } from "./decoders";
import { finestResolution, formatLat, formatLon, niceScale, resolutionChip, slopeDegFromSamples } from "./scale";
import { datedSnapshots, shouldShowTimeline, swipeScissor } from "./timeline";

function meta(over: Partial<LayerMeta> & { id: string }): LayerMeta {
  return {
    site_id: "gale",
    family: "topography",
    name: over.id,
    unit: "m",
    level: "L2",
    time_dependent: false,
    credit: "test",
    simulated: false,
    cog_url: `/data/${over.id}.tif`,
    ...over,
  } as LayerMeta;
}

describe("layer selection", () => {
  const layers = [
    meta({ id: "gale.L1.elevation", level: "L1", resolution_m: 200 }),
    meta({ id: "gale.L3.elevation", level: "L3", resolution_m: 10 }),
    meta({ id: "gale.L3.optical", family: "optical", level: "L3", resolution_m: 2 }),
    meta({ id: "gale.L2.walkability", family: "hazard", level: "L2" }),
    meta({ id: "gale.L3.walkability", family: "hazard", level: "L3" }),
    meta({ id: "gale.timeline.1999", family: "optical", level: "L3", time_dependent: true, valid_time: "1999-06-01T00:00:00Z" }),
  ];
  it("picks the highest level of a family", () => {
    expect(getWalkabilityLayer(layers)?.id).toBe("gale.L3.walkability");
    expect(getBestLayer(layers, (l) => l.id.includes("elevation"))?.level).toBe("L3");
  });
  it("optical basemap excludes dated snapshots; absent optical is undefined (empty state)", () => {
    expect(getOpticalLayer(layers)?.id).toBe("gale.L3.optical");
    expect(getOpticalLayer([meta({ id: "x.elevation" })])).toBeUndefined();
    expect(getWalkabilityLayer([])).toBeUndefined();
  });
});

describe("legend", () => {
  const elev = meta({ id: "gale.L3.elevation", level: "L3", resolution_m: 10 });
  const walk = meta({
    id: "gale.L3.walkability",
    unit: "index 0-100",
    ...({ classes: [{ min: 70, max: 100, label: "Walkable", color: "#3FB950" }, { min: 0, max: 39, label: "Avoid", color: "#F85149" }] } as object),
  });
  it("lists exactly the visible layers in drawing order", () => {
    const entries = buildLegend({ elevation: { visible: true }, slope: { visible: true }, traverse: { visible: false } }, { elevation: elev });
    expect(entries.map((e) => e.id)).toEqual(["elevation", "slope"]);
    expect(buildLegend({ elevation: { visible: false }, traverse: { visible: false } })).toEqual([]);
  });
  it("states the resolution limit from the meta and the no-go grade for slope", () => {
    expect(resolutionNote(elev)).toBe("Hazards smaller than 10 m are not resolved.");
    expect(resolutionNote(undefined)).toBeUndefined();
    const slope = buildLegend({ slope: { visible: true } }, { elevation: elev, noGoDeg: 27 }).find((e) => e.id === "slope")!;
    expect(slope.classes![0]!.label).toContain("27 deg");
    expect(slope.note).toContain("10 m");
  });
  it("walkability legend uses the classes from the meta, highest first; hidden without the layer", () => {
    const e = buildLegend({ walkability: { visible: true } }, { walkability: walk }).find((x) => x.id === "walkability")!;
    expect(e.classes!.map((c) => c.label)).toEqual(["Walkable (70-100)", "Avoid (0-39)"]);
    expect(buildLegend({ walkability: { visible: true } }).some((x) => x.id === "walkability")).toBe(false);
    expect(readClasses(walk)).toHaveLength(2);
    expect(classFor(55, readClasses(walk))?.label).toBe("Avoid");
    expect(readClasses(meta({ id: "z", ...({ classes: [{ min: "x" }] } as object) }))).toEqual([]);
  });
  it("formats and colours helpers", () => {
    expect(formatMeters(1500)).toBe("1.5 km");
    expect(formatMeters(10)).toBe("10 m");
    expect(isochroneColor(0, 5)).not.toBe(isochroneColor(4, 5));
    expect(isochroneColor(0, 1)).toBeTruthy();
  });
});

describe("decoders", () => {
  it("unpacks numpy packbits (MSB first), cropping the padding", () => {
    // 3 x 3 mask 1,0,1 / 0,1,0 / 1,1,1 -> bits 101010111 + padding 0000000 -> 0xAB 0x80
    const b64 = btoa(String.fromCharCode(0xab, 0x80));
    expect(Array.from(unpackBits(b64, 3, 3))).toEqual([1, 0, 1, 0, 1, 0, 1, 1, 1]);
  });
  it("viewshed bitmap: visible teal, shadowed dark, outside transparent", () => {
    const px = viewshedRgba(new Uint8Array([1, 0, 0]), new Uint8Array([1, 1, 0]));
    expect(Array.from(px.slice(0, 4))).toEqual([20, 184, 166, 105]);
    expect(Array.from(px.slice(4, 8))).toEqual([8, 12, 16, 150]);
    expect(px[11]).toBe(0);
  });
  it("parses isochrones (LineString and MultiLineString), sorted, ignoring unknown shapes", () => {
    const fc = {
      features: [
        { properties: { minutes: 60 }, geometry: { type: "MultiLineString", coordinates: [[[137.4, -4.6], [137.41, -4.61]], [[137.5, -4.7]]] } },
        { properties: { minutes: "15", label: "15 min" }, geometry: { type: "LineString", coordinates: [[137.4, -4.6], [137.401, -4.601]] } },
        { properties: {}, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } },
        { properties: { minutes: 30 }, geometry: { type: "Point", coordinates: [0, 0] } },
      ],
    };
    const lines = parseIsochrones(fc);
    expect(lines.map((l) => l.minutes)).toEqual([15, 60]);
    expect(lines[1]!.lines).toHaveLength(1); // the 1-point line is dropped
    expect(parseIsochrones(null)).toEqual([]);
    expect(parseIsochrones({ features: "no" })).toEqual([]);
  });
});

describe("scale and readout helpers", () => {
  it("scale bar rounds to 1-2-5 and never exceeds the max width", () => {
    for (const mpp of [0.3, 1, 3.7, 12, 80, 250]) {
      const s = niceScale(mpp, 140);
      expect(s.px).toBeLessThanOrEqual(140 + 1e-9);
      expect(s.px).toBeGreaterThan(140 / 2.5 - 1e-9);
      expect([1, 2, 5]).toContain(+(s.meters / Math.pow(10, Math.floor(Math.log10(s.meters)))).toFixed(6));
    }
    expect(niceScale(10, 100).label).toBe("1 km");
    expect(niceScale(2, 100).label).toBe("200 m");
  });
  it("formats hemispheres correctly (negative latitude is south)", () => {
    expect(formatLat(-4.72)).toBe("4.7200° S");
    expect(formatLat(10.5)).toBe("10.5000° N");
    expect(formatLon(137.4)).toBe("137.4000° E");
    expect(formatLon(-5)).toBe("5.0000° W");
  });
  it("resolution chip appears only below the data resolution", () => {
    expect(resolutionChip(3, 10)).toContain("10 m");
    expect(resolutionChip(10, 10)).toBeNull();
    expect(resolutionChip(0.1, undefined)).toBeNull();
    expect(finestResolution(10)).toBeCloseTo(3.333, 2);
    expect(finestResolution(0.3)).toBe(0.5);
  });
  it("slope from four samples: 10 m rise over 20 m east-west is 26.6 deg; flat is 0; NaN propagates", () => {
    expect(slopeDegFromSamples(10, 0, 0, 0, 10)).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI, 6);
    expect(slopeDegFromSamples(5, 5, 5, 5, 10)).toBe(0);
    expect(slopeDegFromSamples(Number.NaN, 0, 0, 0, 10)).toBeNaN();
  });
});

describe("TIME-MARS timeline", () => {
  const snap = (id: string, t: string | null) =>
    meta({ id, family: "optical", time_dependent: true, valid_time: t, level: "L3" });
  it("needs at least two dated snapshots, sorted oldest first", () => {
    expect(shouldShowTimeline(datedSnapshots([]))).toBe(false);
    expect(shouldShowTimeline(datedSnapshots([snap("a", "2008-01-01T00:00:00Z")]))).toBe(false);
    const s = datedSnapshots([snap("b", "2016-05-05T00:00:00Z"), snap("a", "1999-01-01T00:00:00Z"), snap("c", null), snap("d", "nope")]);
    expect(s.map((x) => x.year)).toEqual([1999, 2016]);
    expect(shouldShowTimeline(s)).toBe(true);
  });
  it("static optical layers do not count as snapshots", () => {
    expect(datedSnapshots([meta({ id: "o", family: "optical", time_dependent: false })])).toEqual([]);
  });
  it("swipe scissor covers the right-hand side in device pixels", () => {
    expect(swipeScissor(0.25, 800, 600, 2)).toEqual({ x: 400, y: 0, w: 1200, h: 1200 });
    expect(swipeScissor(2, 800, 600, 1)).toEqual({ x: 800, y: 0, w: 0, h: 600 });
    expect(swipeScissor(-1, 800, 600, 1).w).toBe(800);
  });
});
