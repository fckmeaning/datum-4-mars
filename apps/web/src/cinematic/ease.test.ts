import { describe, it, expect } from "vitest";
import { CINE_EASE, clamp01, cubicBezier, pchip, smootherstep, smoothstep, wrapPi } from "./ease";

describe("ease curves", () => {
  it("smoothstep/smootherstep are 0 below, 1 above, and symmetric", () => {
    expect(smoothstep(2, 4, 1)).toBe(0);
    expect(smoothstep(2, 4, 5)).toBe(1);
    expect(smoothstep(2, 4, 3)).toBeCloseTo(0.5, 12);
    expect(smootherstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(3)).toBe(1);
  });

  it("CINE_EASE: endpoints, strictly increasing, and not linear (slow start, soft end)", () => {
    expect(CINE_EASE(0)).toBe(0);
    expect(CINE_EASE(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 200; i++) {
      const y = CINE_EASE(i / 200);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
    expect(CINE_EASE(0.1)).toBeLessThan(0.05);
    expect(CINE_EASE(0.95)).toBeGreaterThan(0.97);
    expect(Math.abs(CINE_EASE(0.5) - 0.5)).toBeGreaterThan(0.02);
  });

  it("cubicBezier matches the CSS 'ease' control points at known samples and rejects x outside [0, 1]", () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1); // CSS ease
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
    expect(() => cubicBezier(1.5, 0, 0, 1)).toThrow(RangeError);
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.37)).toBeCloseTo(0.37, 5);
  });

  it("pchip passes through the points, never overshoots monotone data, and holds the ends", () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [10, 9, 4, 1, 0.5];
    const f = pchip(xs, ys);
    xs.forEach((x, i) => expect(f(x)).toBeCloseTo(ys[i]!, 10));
    let prev = f(0);
    for (let i = 1; i <= 400; i++) {
      const v = f(i / 100);
      expect(v).toBeLessThanOrEqual(prev + 1e-12); // monotone decreasing data stay monotone
      expect(v).toBeGreaterThanOrEqual(0.5 - 1e-12);
      prev = v;
    }
    expect(f(-5)).toBe(10);
    expect(f(99)).toBe(0.5);
  });

  it("pchip validates its input; wrapPi wraps into (-pi, pi]", () => {
    expect(() => pchip([0, 0], [1, 2])).toThrow(RangeError);
    expect(() => pchip([0], [1])).toThrow(RangeError);
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapPi(-3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapPi(0.3)).toBeCloseTo(0.3, 12);
  });
});
