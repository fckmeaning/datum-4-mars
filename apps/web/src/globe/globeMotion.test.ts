import { describe, expect, it } from "vitest";
import {
  arcDuration,
  arcStep,
  deckDistance,
  easeInOutCubic,
  framedDistance,
  pulseEnvelope,
} from "./globeMotion";

describe("globeMotion", () => {
  it("deckDistance makes the disc cover the requested share of the height", () => {
    const d = deckDistance(42, 16 / 9, 0.52);
    const frac = 1 / (Math.sqrt(d * d - 1) * Math.tan((42 * Math.PI) / 360));
    expect(frac).toBeCloseTo(0.52, 6);
  });

  it("deckDistance respects a narrow viewport", () => {
    const wide = deckDistance(42, 2, 0.52);
    const narrow = deckDistance(42, 0.5, 0.52);
    expect(narrow).toBeGreaterThan(wide);
  });

  it("framedDistance blends smoothly, keeps user zoom working and never moves closer", () => {
    expect(framedDistance(3.2, 5.1, 0, 3.2)).toBe(3.2);
    expect(framedDistance(3.2, 5.1, 1, 3.2)).toBeCloseTo(5.1);
    expect(framedDistance(3.2, 5.1, 0.5, 3.2)).toBeCloseTo(4.15);
    expect(framedDistance(1.6, 5.1, 1, 3.2)).toBeCloseTo(2.55);
    expect(framedDistance(1.6, 5.1, 1, 3.2)).toBeGreaterThan(1.6);
    expect(framedDistance(3.2, 2, 1, 3.2)).toBe(3.2);
  });

  it("easing is monotonic and hits the ends", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeInOutCubic(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("arc has no bulge, roll or lift at its ends and some in the middle", () => {
    const a0 = arcStep(0, 1.5);
    const a1 = arcStep(1, 1.5);
    const am = arcStep(0.5, 1.5);
    expect(a0.e).toBe(0);
    expect(a1.e).toBe(1);
    expect(Math.abs(a0.bulge) + Math.abs(a0.roll) + a0.lift).toBeLessThan(1e-9);
    expect(Math.abs(a1.bulge) + Math.abs(a1.roll) + a1.lift).toBeLessThan(1e-9);
    expect(am.bulge).toBeGreaterThan(0.1);
    expect(am.roll).toBeGreaterThan(0.05);
  });

  it("short turns bulge less and last less", () => {
    expect(arcStep(0.5, 0.1).bulge).toBeLessThan(arcStep(0.5, 1.5).bulge);
    expect(arcDuration(0.1)).toBeLessThan(arcDuration(2));
    expect(arcDuration(10)).toBeLessThanOrEqual(1.9);
  });

  it("pulse expands and fades out", () => {
    const a = pulseEnvelope(0.1);
    const b = pulseEnvelope(0.8);
    expect(b.radius).toBeGreaterThan(a.radius);
    expect(b.opacity).toBeLessThan(a.opacity);
    expect(pulseEnvelope(1.2).done).toBe(true);
    expect(pulseEnvelope(1.2).opacity).toBe(0);
  });
});
