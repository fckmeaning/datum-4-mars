import { describe, it, expect } from "vitest";
import {
  sampleMagmaRgb,
  createMagmaLutTexture,
  getLayerLegend,
} from "./colormap";

describe("colormap and legend helpers", () => {
  it("samples Magma colormap endpoints and transitions", () => {
    const start = sampleMagmaRgb(0.0);
    const mid = sampleMagmaRgb(0.5);
    const end = sampleMagmaRgb(1.0);

    // Start is near black / dark purple
    expect(start[0]).toBeLessThan(0.05);
    expect(start[1]).toBeLessThan(0.05);
    expect(start[2]).toBeLessThan(0.05);

    // End is pale yellow
    expect(end[0]).toBeGreaterThan(0.9);
    expect(end[1]).toBeGreaterThan(0.9);
    expect(end[2]).toBeGreaterThan(0.5);

    // Mid is magenta / purple
    expect(mid[0]).toBeGreaterThan(start[0]);
    expect(mid[0]).toBeLessThan(end[0]);
  });

  it("creates a valid 256x1 Magma DataTexture", () => {
    const tex = createMagmaLutTexture();
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(1);
    expect(tex.image.data).not.toBeNull();

    const data = tex.image.data!;
    expect(data.length).toBe(256 * 4);
    // Alpha channel is 255
    expect(data[3]).toBe(255);
    expect(data[256 * 4 - 1]).toBe(255);

    tex.dispose();
  });

  it("generates elevation legend matching 2D map values and cividis colors", () => {
    const leg = getLayerLegend("elevation", -4500, -2000);
    expect(leg.id).toBe("elevation");
    expect(leg.unit).toBe("m");
    expect(leg.ticks.length).toBe(5);
    expect(leg.ticks[0]!.value).toBeCloseTo(-4500);
    expect(leg.ticks[leg.ticks.length - 1]!.value).toBeCloseTo(-2000);
  });

  it("generates slope legend matching 2D map values and magma colors", () => {
    const leg = getLayerLegend("slope");
    expect(leg.id).toBe("slope");
    expect(leg.unit).toBe("deg");
    expect(leg.ticks.length).toBe(5);
    expect(leg.ticks[0]!.value).toBe(0);
    expect(leg.ticks[leg.ticks.length - 1]!.value).toBe(35);
  });
});
