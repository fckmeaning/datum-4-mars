import { describe, expect, it } from "vitest";
import {
  CIVIDIS_STOPS,
  DEFAULT_NO_GO_DEG,
  SLOPE_STOPS,
  colourChannels,
  elevationGradientCss,
  elevationStops,
  hillshadeColor,
  opticalColor,
  reliefColor,
  slopeColor,
  terrainTerms,
  walkabilityColor,
} from "./terrainStyle";
import type { ClassBand } from "./classes";

const bands: ClassBand[] = [
  { min: 70, max: 100, label: "Walkable", color: "#3FB950" },
  { min: 40, max: 69, label: "Use caution", color: "#D29922" },
  { min: 0, max: 39, label: "Avoid", color: "#F85149" },
];

describe("terrain style expressions", () => {
  it("elevation stops span the range with the five cividis colours, all 0-255", () => {
    const stops = elevationStops([-4550, -2030]);
    expect(stops).toHaveLength(CIVIDIS_STOPS.length);
    expect(stops[0]!.z).toBe(-4550);
    expect(stops[stops.length - 1]!.z).toBe(-2030);
    for (const s of stops) for (const c of s.rgb) expect(c >= 0 && c <= 255).toBe(true);
    expect(stops.map((s) => s.z)).toEqual([...stops.map((s) => s.z)].sort((a, b) => a - b));
  });

  it("every colour literal in every style is a 0-255 channel (0-1 values render black)", () => {
    const all = [reliefColor(), hillshadeColor(), slopeColor(), opticalColor(), walkabilityColor(bands)];
    for (const expr of all) for (const c of colourChannels(expr)) expect(c >= 0 && c <= 255).toBe(true);
    // relief channels are computed (not literals), but the colour op itself must exist
    expect((reliefColor() as unknown[])[0]).toBe("color");
    // slope ramp literals: RGB 0-255, alpha 0-1
    for (const s of SLOPE_STOPS) {
      expect(Math.max(s.rgba[0], s.rgba[1], s.rgba[2])).toBeGreaterThan(1);
      expect(s.rgba[3]).toBeGreaterThan(0);
      expect(s.rgba[3]).toBeLessThanOrEqual(1);
    }
  });

  it("slope style has a hard no-go branch at the walking limit before the ramp", () => {
    const e = slopeColor(DEFAULT_NO_GO_DEG) as unknown[];
    expect(e[0]).toBe("case");
    const cond = e[1] as unknown[];
    expect(cond[0]).toBe(">");
    expect(cond[2]).toBe(DEFAULT_NO_GO_DEG);
    expect((e[3] as unknown[])[0]).toBe("interpolate");
    expect(JSON.stringify(slopeColor(30))).toContain(",30]");
  });

  it("slope thresholds increase monotonically and start flat", () => {
    const degs = SLOPE_STOPS.map((s) => s.deg);
    expect(degs[0]).toBe(0);
    expect(degs).toEqual([...degs].sort((a, b) => a - b));
    expect(degs[degs.length - 1]).toBeGreaterThan(DEFAULT_NO_GO_DEG);
  });

  it("north is the up-image neighbour (band y offset -1): the north gradient reads band(0,-1) minus band(0,+1)", () => {
    const json = JSON.stringify(terrainTerms().intensity);
    expect(json).toContain('["band",1,0,-1],["band",1,0,1]');
  });

  it("walkability: highest class first, thresholds from the meta, alpha below 1", () => {
    const e = walkabilityColor(bands) as unknown[];
    expect(e[0]).toBe("case");
    expect((e[1] as unknown[])[0]).toBe(">=");
    expect((e[1] as unknown[])[2]).toBe(70);
    expect((e[3] as unknown[])[2]).toBe(40);
    expect(e.length).toBe(6); // case, cond1, col1, cond2, col2, fallback
    const first = e[2] as number[];
    expect(first.slice(0, 4)).toEqual(["color", 0x3f, 0xb9, 0x50]);
    expect(first[4]).toBeLessThan(1);
  });

  it("walkability with no classes degrades to a transparent colour instead of throwing", () => {
    expect(walkabilityColor([])).toEqual(["color", 128, 128, 128, 0]);
  });

  it("optical stretch uses the layer range and clamps", () => {
    const json = JSON.stringify(opticalColor([10, 195]));
    expect(json).toContain('["band",1],10]');
    expect(json).toContain("185");
    expect(json).toContain('"clamp"');
  });

  it("elevation legend gradient lists every stop", () => {
    const css = elevationGradientCss();
    expect(css.startsWith("linear-gradient(90deg")).toBe(true);
    expect((css.match(/rgb\(/g) ?? []).length).toBe(CIVIDIS_STOPS.length);
  });
});
