import { describe, it, expect } from "vitest";
import { sampleCividisRgb, createCividisLutTexture } from "./cividis";

describe("cividis colormap LUT", () => {
  it("samples endpoints and midpoints within [0, 1]", () => {
    const start = sampleCividisRgb(0);
    const mid = sampleCividisRgb(0.5);
    const end = sampleCividisRgb(1);

    // Start is dark blue/purple (low red, high blue relative to red)
    expect(start[0]).toBeLessThan(0.1);
    expect(start[2]).toBeGreaterThan(0.25);

    // End is bright yellow (high red, high green)
    expect(end[0]).toBeGreaterThan(0.9);
    expect(end[1]).toBeGreaterThan(0.85);

    // Midpoint is in between
    expect(mid[0]).toBeGreaterThan(start[0]);
    expect(mid[0]).toBeLessThan(end[0]);
  });

  it("clamps out of range sample inputs", () => {
    const under = sampleCividisRgb(-1.0);
    const zero = sampleCividisRgb(0.0);
    expect(under).toEqual(zero);

    const over = sampleCividisRgb(2.0);
    const one = sampleCividisRgb(1.0);
    expect(over).toEqual(one);
  });

  it("creates a valid 256x1 DataTexture", () => {
    const tex = createCividisLutTexture();
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(1);
    expect(tex.image.data).not.toBeNull();

    const data = tex.image.data!;
    expect(data.length).toBe(256 * 4);

    // First pixel alpha is 255
    expect(data[3]).toBe(255);
    // Last pixel alpha is 255
    expect(data[256 * 4 - 1]).toBe(255);

    tex.dispose();
  });
});
