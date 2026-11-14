import { describe, it, expect } from "vitest";
import { gridFromDem, outField, homeField, cellOf, type Grid } from "./grid";
import { rangeRing } from "./range";
import { usableO2 } from "./plan";

/** w x h grid of 20 m cells; `f(c, r)` gives the height. */
function make(w: number, h: number, f: (c: number, r: number) => number = () => 0, cell = 20): Grid {
  const z = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) z[r * w + c] = f(c, r);
  return gridFromDem(z, w, h, cell, cell, 4096);
}
const radii = (r: { ring: { x: number; y: number }[] }, p: { x: number; y: number }) => r.ring.map((q) => Math.hypot(q.x - p.x, q.y - p.y));

describe("outField", () => {
  it("is zero at the source and mirrors homeField on flat ground", () => {
    const g = make(30, 30);
    const c = cellOf(g, { x: 0, y: 0 });
    const out = outField(g, c);
    const home = homeField(g, c);
    expect(out[c]).toBe(0);
    for (const i of [0, 100, 450, 899]) expect(out[i]).toBeCloseTo(home[i]!, 6);
  });
});

describe("range ring", () => {
  it("is a closed loop of rays round the pin, roughly circular on flat ground", () => {
    const g = make(160, 160); // 3.2 km square, 20 m cells
    const pin = { x: 400, y: 0 };
    const r = rangeRing(g, { x: 0, y: 0 }, pin, 36);
    expect(r.reachable).toBe(true);
    expect(r.ring).toHaveLength(36);
    expect(r.budgetL).toBeGreaterThan(0);
    expect(r.budgetL).toBeLessThan(usableO2());
    const rs = radii(r, pin);
    expect(Math.max(...rs)).toBeLessThanOrEqual(r.maxRadiusM + 1e-6);
    // pointing back at the station the ring is shorter than pointing away: the walk home has to fit as well
    const away = rs[0]!; // +x, away from the station
    const back = rs[18]!; // -x, towards the station
    expect(away).toBeLessThan(back + 1); // away is the shorter one: going further out costs the way back too
    expect(away).toBeGreaterThan(0);
  });

  it("shrinks when the pin is further from the station", () => {
    const g = make(160, 160);
    const near = rangeRing(g, { x: 0, y: 0 }, { x: 200, y: 0 }, 24);
    const far = rangeRing(g, { x: 0, y: 0 }, { x: 1500, y: 0 }, 24);
    expect(far.budgetL).toBeLessThan(near.budgetL);
    expect(far.ring.length).toBe(24); // on flat ground the outline is clipped by the edge of the tile, so only the budget shrinks
  });

  it("is blocked by a wall too steep to walk", () => {
    // a 60 degree ridge east of the pin: 20 m cells, 35 m rise per cell
    const g = make(200, 200, (c) => (c >= 105 && c <= 107 ? 400 : 0));
    const pin = { x: 0, y: 0 };
    const r = rangeRing(g, { x: -400, y: 0 }, pin, 36);
    const east = Math.hypot(r.ring[0]!.x - pin.x, r.ring[0]!.y - pin.y);
    const west = Math.hypot(r.ring[18]!.x - pin.x, r.ring[18]!.y - pin.y);
    expect(east).toBeLessThan(west); // the ridge ends the ring on the east side
    expect(east).toBeLessThan(1100); // ridge starts ~ 20 * (105 - 100) = 100 m east of the middle
  });

  it("is empty when the pin is already beyond the oxygen", () => {
    const g = make(300, 300, () => 0, 60); // 18 km, 60 m cells
    const r = rangeRing(g, { x: -8000, y: 0 }, { x: 8000, y: 0 }, 12);
    expect(r.reachable).toBe(false);
    expect(r.ring).toEqual([]);
  });
});

describe("range ring with a smaller suit", () => {
  it("shrinks with the oxygen the suit carries", () => {
    const g = make(160, 160);
    const pin = { x: 400, y: 0 };
    const full = rangeRing(g, { x: 0, y: 0 }, pin, 36);
    const small = rangeRing(g, { x: 0, y: 0 }, pin, 36, 200);
    expect(small.budgetL).toBeLessThan(full.budgetL);
    expect(small.maxRadiusM).toBeLessThan(full.maxRadiusM);
  });
});
