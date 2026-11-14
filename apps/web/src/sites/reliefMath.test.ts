import { describe, it, expect } from "vitest";
import { ctxTileRange, ctxZoomFor, decodeDem, groundSizeM, reliefStats, tileDrawRect, trekTileRange } from "./reliefMath";

const bounds = { west: -6.5314, east: -4.5313, north: -0.9453, south: -2.9454 };

describe("relief math", () => {
  it("decodes R*256 + G - offset", () => {
    const rgba = new Uint8ClampedArray([0x7f, 0xff, 0, 255, 0x80, 0x10, 0, 255]);
    const h = decodeDem(rgba, 2, 1);
    expect(h[0]).toBe(0x7fff - 32768);
    expect(h[1]).toBe(0x8010 - 32768);
  });

  it("decodes the 16-bit linear tiers between min and max", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 0xff, 0xff, 0, 255, 0x80, 0x00, 0, 255]);
    const h = decodeDem(rgba, 3, 1, 0, [-100, 100]);
    expect(h[0]).toBeCloseTo(-100, 6);
    expect(h[1]).toBeCloseTo(100, 6);
    expect(h[2]).toBeCloseTo(0.0015, 2); // 0x8000 / 65535 is just above the middle
  });

  it("gives about 118 km for two degrees of latitude and less east-west away from the equator", () => {
    const eq = groundSizeM({ west: 0, east: 2, north: 1, south: -1 }, 0);
    expect(eq.h / 1000).toBeCloseTo(118.5, 0);
    expect(eq.w / 1000).toBeCloseTo(118.5, 0);
    const hi = groundSizeM({ west: 0, east: 2, north: 26, south: 24 }, 25);
    expect(hi.w).toBeLessThan(hi.h);
  });

  it("covers the bounds with whole Trek tiles", () => {
    const r = trekTileRange(bounds, 6);
    expect(r.tileDeg).toBeCloseTo(2.8125, 4);
    expect(-180 + r.col0 * r.tileDeg).toBeLessThanOrEqual(bounds.west);
    expect(-180 + (r.col1 + 1) * r.tileDeg).toBeGreaterThanOrEqual(bounds.east);
    expect(90 - r.row0 * r.tileDeg).toBeGreaterThanOrEqual(bounds.north);
    expect(90 - (r.row1 + 1) * r.tileDeg).toBeLessThanOrEqual(bounds.south);
  });

  it("places tiles on a canvas spanning the bounds", () => {
    const r = trekTileRange(bounds, 6);
    const rect = tileDrawRect(r, r.row0, r.col0, bounds, 1024, 1024);
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.y).toBeLessThanOrEqual(0);
    expect(rect.x + rect.w).toBeGreaterThan(0);
  });

  it("reports min, max and range", () => {
    expect(reliefStats(new Float32Array([5, -3, 10]))).toEqual({ min: -3, max: 10, range: 13 });
  });
  it("covers the bounds with CTX tiles and picks a level that fits the texture", () => {
    const gale = { west: 137.2698, east: 137.5302, north: -4.55, south: -4.89 };
    const z = ctxZoomFor(gale);
    expect(z).toBe(12); // about 5 m per pixel, the finest used
    const r = ctxTileRange(gale, z!);
    expect(-180 + r.col0 * r.tileDeg).toBeLessThanOrEqual(gale.west);
    expect(-180 + (r.col1 + 1) * r.tileDeg).toBeGreaterThanOrEqual(gale.east);
    expect(90 - r.row0 * r.tileDeg).toBeGreaterThanOrEqual(gale.north);
    expect(90 - (r.row1 + 1) * r.tileDeg).toBeLessThanOrEqual(gale.south);
    expect((r.col1 - r.col0 + 1) * (r.row1 - r.row0 + 1)).toBeLessThanOrEqual(81);
  });

  it("does not use CTX for patches too wide for it", () => {
    expect(ctxZoomFor({ west: 100, east: 110, north: 5, south: -5 })).toBeNull();
  });
});
