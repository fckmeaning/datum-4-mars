import { describe, it, expect } from "vitest";
import { aStar, cellOf, cellPoint, descendHome, gridFromDem, homeField, type Grid } from "./grid";
import { evaAt, planEva, usableO2, verdictFor } from "./plan";

/** w x h grid of 20 m cells; `f(c, r)` gives the height. */
function make(w: number, h: number, f: (c: number, r: number) => number = () => 0, cell = 20): Grid {
  const z = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) z[r * w + c] = f(c, r);
  return gridFromDem(z, w, h, cell, cell, 4096);
}

describe("grid", () => {
  it("averages blocks when the tile is bigger than maxCells and keeps ground size", () => {
    const z = new Float32Array(16 * 16).fill(10);
    const g = gridFromDem(z, 16, 16, 5, 5, 8);
    expect(g.w).toBe(8);
    expect(g.cellX).toBe(10);
    expect(g.z[0]).toBe(10);
  });
  it("cellOf is the inverse of cellPoint", () => {
    const g = make(40, 30);
    for (const idx of [0, 5, 400, 1199]) expect(cellOf(g, cellPoint(g, idx))).toBe(idx);
  });
});

describe("A*", () => {
  it("goes straight on flat ground", () => {
    const g = make(60, 60);
    const p = aStar(g, 30 * 60 + 5, 30 * 60 + 55)!;
    expect(p).toHaveLength(51);
    expect(p.every((i) => Math.floor(i / 60) === 30)).toBe(true);
  });
  it("goes round a wall through the gap and returns null when sealed", () => {
    const wall = (c: number, r: number) => (c === 30 && r !== 50 ? 2000 : 0);
    const g = make(60, 60, wall);
    const p = aStar(g, 30 * 60 + 5, 30 * 60 + 55)!;
    expect(p.some((i) => i % 60 === 30 && Math.floor(i / 60) === 50)).toBe(true);
    const sealed = make(60, 60, (c) => (c === 30 ? 2000 : 0));
    expect(aStar(sealed, 30 * 60 + 5, 30 * 60 + 55)).toBeNull();
  });
  it("prefers a gentle detour over a steep climb when that is faster", () => {
    // a ridge across the way with a low saddle at row 10
    const ridge = (c: number, r: number) => (c === 30 ? 60 * Math.min(1, Math.abs(r - 10) / 10) : 0);
    const g = make(60, 40, ridge);
    const p = aStar(g, 30 * 60 + 5 - 20 * 60, 30 * 60 + 55 - 20 * 60)!; // row 10 start -> row 10 goal, so the saddle is on the way
    expect(p.length).toBeGreaterThan(50);
  });
});

describe("home field", () => {
  const g = make(80, 80);
  const home = cellOf(g, { x: 0, y: 0 });
  const field = homeField(g, home);
  it("is zero at home and grows with distance", () => {
    expect(field[home]).toBe(0);
    const near = field[cellOf(g, { x: 200, y: 0 })]!;
    const far = field[cellOf(g, { x: 600, y: 0 })]!;
    expect(far).toBeGreaterThan(near);
    expect(far / near).toBeGreaterThan(2.5);
  });
  it("walking down the field reaches home", () => {
    const from = cellOf(g, { x: 500, y: 300 });
    const path = descendHome(g, field, from);
    expect(path[path.length - 1]).toBe(home);
  });
});

describe("EVA plan", () => {
  const g = make(400, 400, () => 0, 30); // 12 km square of flat ground
  it("a short loop is READY and the oxygen matches the model", () => {
    const plan = planEva(g, { x: 0, y: 0 }, [{ x: 1000, y: 0 }], "foot");
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.verdict).toBe("READY");
    expect(plan.stats.distanceM).toBeGreaterThan(1900);
    expect(plan.stats.distanceM).toBeLessThan(2300);
    expect(plan.stats.o2L).toBeGreaterThan(60);
    expect(plan.stats.o2L).toBeLessThan(110);
    expect(plan.noReturn).toBeNull();
    expect(plan.stopNodes).toHaveLength(1);
  });
  it("a far stop is NO_GO and has a point of no return near half the oxygen", () => {
    const plan = planEva(g, { x: 0, y: 0 }, [{ x: 5000, y: 0 }], "foot");
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.verdict).toBe("NO_GO");
    expect(plan.noReturn).not.toBeNull();
    const n = plan.nodes[plan.noReturn!]!;
    expect(n.cumD).toBeGreaterThan(4000);
    expect(n.cumD).toBeLessThan(5000);
  });
  it("the rover covers the same trip with less oxygen", () => {
    const foot = planEva(g, { x: 0, y: 0 }, [{ x: 2000, y: 0 }], "foot");
    const rover = planEva(g, { x: 0, y: 0 }, [{ x: 2000, y: 0 }], "rover");
    if ("error" in foot || "error" in rover) throw new Error("plan failed");
    expect(rover.stats.o2L).toBeLessThan(foot.stats.o2L);
    expect(rover.stats.timeS).toBeLessThan(foot.stats.timeS);
  });
  it("the rover breaks the walkback rule when it goes too far to walk home", () => {
    const big = make(350, 350, () => 0, 60); // 21 km: far enough that the walk home no longer fits in the oxygen
    const rover = planEva(big, { x: 0, y: 0 }, [{ x: 9800, y: 0 }], "rover");
    if ("error" in rover) throw new Error(rover.error);
    expect(rover.verdict).toBe("NO_GO");
    expect(rover.reason).toMatch(/walkback/i);
  });
  it("reports an error when a stop is sealed off", () => {
    const wall = make(100, 100, (c) => (c === 50 ? 5000 : 0));
    const r = planEva(wall, { x: -500, y: 0 }, [{ x: 500, y: 0 }], "foot");
    expect("error" in r).toBe(true);
  });
});

describe("verdict thresholds", () => {
  const u = usableO2();
  it("READY, CAUTION and NO_GO by oxygen and time", () => {
    expect(verdictFor({ o2L: 0.5 * u, timeS: 3600, walkbackBroken: false }).verdict).toBe("READY");
    expect(verdictFor({ o2L: 0.9 * u, timeS: 3600, walkbackBroken: false }).verdict).toBe("CAUTION");
    expect(verdictFor({ o2L: 1.01 * u, timeS: 3600, walkbackBroken: false }).verdict).toBe("NO_GO");
    expect(verdictFor({ o2L: 0.1 * u, timeS: 8 * 3600, walkbackBroken: false }).verdict).toBe("NO_GO");
    expect(verdictFor({ o2L: 0.1 * u, timeS: 6.5 * 3600, walkbackBroken: false }).verdict).toBe("CAUTION");
    expect(verdictFor({ o2L: 0.1 * u, timeS: 600, walkbackBroken: true }).verdict).toBe("NO_GO");
  });
});

describe("evaAt", () => {
  const g = make(400, 400, () => 0, 30);
  const plan = (() => {
    const p = planEva(g, { x: 0, y: 0 }, [{ x: 1500, y: 0 }], "foot");
    if ("error" in p) throw new Error(p.error);
    return p;
  })();
  const total = plan.nodes[plan.nodes.length - 1]!.cumT;
  it("starts at home and ends at home with all the oxygen used", async () => {
    const { evaAt } = await import("./plan");
    const s = evaAt(plan, 0);
    expect(Math.hypot(s.x, s.y)).toBeLessThan(40);
    expect(s.o2L).toBe(0);
    const e = evaAt(plan, total + 100);
    expect(e.phase).toBe("done");
    expect(e.o2L).toBeCloseTo(plan.stats.o2L, 6);
    expect(Math.hypot(e.x, e.y)).toBeLessThan(40);
  });
  it("goes out, works at the stop, comes back, and oxygen only grows", async () => {
    const { evaAt } = await import("./plan");
    const phases = new Set<string>();
    let prev = -1;
    for (let t = 0; t <= total; t += total / 200) {
      const s = evaAt(plan, t);
      phases.add(s.phase);
      expect(s.o2L).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s.o2L;
    }
    expect(phases.has("outbound")).toBe(true);
    expect(phases.has("working")).toBe(true);
    expect(phases.has("returning")).toBe(true);
  });
  it("flags the reserve when the plan uses more than the usable oxygen", async () => {
    const { evaAt } = await import("./plan");
    const far = planEva(g, { x: 0, y: 0 }, [{ x: 5000, y: 0 }], "foot");
    if ("error" in far) throw new Error(far.error);
    const t = far.nodes[far.nodes.length - 1]!.cumT;
    expect(evaAt(far, t * 0.99).state).toBe("reserve");
    const mid = far.nodes[far.noReturn! + 3]!.cumT;
    expect(["past-no-return", "reserve"]).toContain(evaAt(far, mid).state);
  });
});

describe("planToFpvRoute", () => {
  const g2 = make(400, 400, () => 0, 30);
  it("keeps the path, drops the pauses from the walking time and matches the plan's oxygen", async () => {
    const { planToFpvRoute } = await import("./plan");
    const p = planEva(g2, { x: 0, y: 0 }, [{ x: 1200, y: 0 }, { x: 1200, y: 900 }], "foot");
    if ("error" in p) throw new Error(p.error);
    const r = planToFpvRoute(p);
    expect(r.segments).toHaveLength(r.xy.length - 1);
    const t = r.segments.reduce((a, s) => a + s.duration_s, 0);
    expect(t).toBeCloseTo(p.stats.timeS - 2 * 1200, 3); // two stops of 20 minutes
    const dist = r.segments.reduce((a, s) => a + s.length_m, 0);
    expect(dist).toBeCloseTo(p.stats.distanceM, 3);
    expect(r.xy[0]).toEqual([p.nodes[0]!.x, p.nodes[0]!.y]);
    expect(r.xy.length).toBe(p.nodes.filter((n) => n.kind === "path").length);
  });
});

describe("return option, shelter time and daylight", () => {
  const g3 = make(400, 400, () => 0, 30);
  it("without the return the route ends at the last stop and costs about half", async () => {
    const both = planEva(g3, { x: 0, y: 0 }, [{ x: 2000, y: 0 }], "foot", { returnHome: true });
    const one = planEva(g3, { x: 0, y: 0 }, [{ x: 2000, y: 0 }], "foot", { returnHome: false });
    if ("error" in both || "error" in one) throw new Error("plan failed");
    expect(one.returnHome).toBe(false);
    expect(one.stats.distanceM).toBeLessThan(both.stats.distanceM * 0.6);
    expect(one.stats.o2L).toBeLessThan(both.stats.o2L);
    const last = one.nodes[one.nodes.length - 1]!;
    expect(Math.hypot(last.x - 2000, last.y)).toBeLessThan(40);
  });
  it("the storm shelter time is the walk home from the farthest point", () => {
    const p = planEva(g3, { x: 0, y: 0 }, [{ x: 2000, y: 0 }], "foot");
    if ("error" in p) throw new Error(p.error);
    // 2 km at about 1 m/s
    expect(p.stats.shelterWalkS).toBeGreaterThan(1700);
    expect(p.stats.shelterWalkS).toBeLessThan(2500);
  });
  it("an EVA that ends after sunset is NO_GO, one that ends just before is CAUTION", async () => {
    const { adjustForDaylight } = await import("./plan");
    const p = planEva(g3, { x: 0, y: 0 }, [{ x: 1000, y: 0 }], "foot");
    if ("error" in p) throw new Error(p.error);
    expect(p.verdict).toBe("READY");
    const hours = p.stats.timeS / 3698.97;
    const fine = adjustForDaylight(p, { sunriseH: 6, sunsetH: 18 }, 9)!;
    expect(fine.verdict).toBe("READY");
    const late = adjustForDaylight(p, { sunriseH: 6, sunsetH: 9 + hours - 0.1 }, 9)!;
    expect(late.verdict).toBe("NO_GO");
    expect(late.reason).toMatch(/after sunset/);
    const tight = adjustForDaylight(p, { sunriseH: 6, sunsetH: 9 + hours + 0.2 }, 9)!;
    expect(tight.verdict).toBe("CAUTION");
    expect(adjustForDaylight(p, null)).toBeNull();
  });
});

describe("what if the suit carries less oxygen", () => {
  const g = make(200, 200, () => 0, 20);
  const stop = [{ x: 1500, y: 0 }];
  it("a smaller capacity lowers the usable oxygen, keeps the used oxygen and turns the verdict", () => {
    const full = planEva(g, { x: 0, y: 0 }, stop, "foot");
    const small = planEva(g, { x: 0, y: 0 }, stop, "foot", { o2CapacityL: 40 });
    if ("error" in full || "error" in small) throw new Error("plan failed");
    expect(small.stats.capacityL).toBe(40);
    expect(small.stats.usableL).toBeCloseTo(usableO2(40), 6);
    expect(small.stats.o2L).toBeCloseTo(full.stats.o2L, 6); // the walk costs the same
    expect(full.verdict).not.toBe("NO_GO");
    expect(small.verdict).toBe("NO_GO");
    expect(small.margin).toBeLessThan(full.margin);
    expect(small.noReturn).not.toBeNull(); // the point of no return comes into the outbound leg
  });
  it("evaAt reports the oxygen left against the capacity of the plan", () => {
    const small = planEva(g, { x: 0, y: 0 }, stop, "foot", { o2CapacityL: 40 });
    if ("error" in small) throw new Error("plan failed");
    const at = evaAt(small, 0);
    expect(at.remainingL).toBeCloseTo(40, 6);
  });
});
