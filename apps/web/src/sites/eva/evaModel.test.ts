import { describe, it, expect } from "vitest";
import { EVA, EVA_EXTRA, edgeEnergyJ, edgeTerms, metabolicCost, o2UseL, stopTerms, walkSpeed } from "./evaModel";


/** value of `key` inside the top-level section `section` of config/params.yaml */
async function yamlNum(section: string, key: string): Promise<number> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const yaml = fs.readFileSync(path.resolve(__dirname, "../../../../../config/params.yaml"), "utf8");
  const start = yaml.indexOf(`\n${section}:`);
  if (start < 0) throw new Error(`section ${section} not found`);
  const rest = yaml.slice(start + 1);
  const next = rest.slice(section.length + 1).search(/\n[a-z_]+:/); // next top-level section
  const body = next < 0 ? rest : rest.slice(0, section.length + 1 + next);
  const m = new RegExp(`\\b${key}:\\s*\\{ value: ([0-9.]+)`).exec(body);
  if (!m) throw new Error(`${section}.${key} not found`);
  return Number(m[1]);
}

// values printed by packages/marsnav/src/marsnav/routing/mobility.py (walk_speed, metabolic_cost, edge_energy(100 m), o2_use)
const GOLDEN = [
  { i: -0.3, v: 0.496585, c: 2.207515, e: 58071.8801, o2: 3.8289 },
  { i: -0.1, v: 1.0, c: 1.127125, e: 50488.0031, o2: 2.978508 },
  { i: 0.0, v: 1.0, c: 2.5, e: 60125.0, o2: 3.45796 },
  { i: 0.1, v: 0.704688, c: 4.899135, e: 76965.9044, o2: 4.491381 },
  { i: 0.3, v: 0.349938, c: 11.183545, e: 121079.782, o2: 7.35744 },
];

describe("F21-F24 against the Python implementation", () => {
  for (const g of GOLDEN) {
    it(`grade ${g.i}`, () => {
      expect(walkSpeed(g.i)).toBeCloseTo(g.v, 5);
      expect(metabolicCost(g.i)).toBeCloseTo(g.c, 5);
      const e = edgeEnergyJ(100, g.i);
      expect(e).toBeCloseTo(g.e, 2);
      expect(o2UseL(e, 100 / walkSpeed(g.i))).toBeCloseTo(g.o2, 4);
    });
  }
});

describe("parameters match config/params.yaml", () => {
  it("reads the same values", async () => {
    expect(await yamlNum("astronaut", "v_flat")).toBe(EVA.v_flat);
    expect(await yamlNum("mobility", "tobler_a")).toBe(EVA.tobler_a);
    expect(await yamlNum("mobility", "tobler_b")).toBe(EVA.tobler_b);
    expect(await yamlNum("astronaut", "mass_astronaut")).toBe(EVA.mass_astronaut);
    expect(await yamlNum("astronaut", "mass_suit")).toBe(EVA.mass_suit);
    expect(await yamlNum("astronaut", "mass_payload")).toBe(EVA.mass_payload);
    expect(await yamlNum("astronaut", "s_suit")).toBe(EVA.s_suit);
    expect(await yamlNum("astronaut", "theta_max_walk_deg")).toBe(EVA.theta_max_deg);
    expect(await yamlNum("astronaut", "o2_capacity_l")).toBe(EVA.o2_capacity_l);
    expect(await yamlNum("astronaut", "reserve_fraction")).toBe(EVA.reserve_fraction);
    expect(await yamlNum("astronaut", "eva_max_h")).toBe(EVA.eva_max_h);
    expect(await yamlNum("physiology", "o2_energy_equiv")).toBe(EVA.o2_energy_kJ_per_L);
    expect(await yamlNum("physiology", "met_o2")).toBe(EVA.met_ml_per_kg_min);
  });
});

describe("rover and stop parameters match config/params.yaml", () => {
  it("reads the same values", async () => {
    expect(await yamlNum("eva", "stop_min")).toBe(EVA_EXTRA.stop_min);
    expect(await yamlNum("eva", "stop_w")).toBe(EVA_EXTRA.stop_w);
    expect(await yamlNum("rover", "speed_m_s")).toBeCloseTo(EVA_EXTRA.rover_ms, 6);
    expect(await yamlNum("rover", "theta_max_deg")).toBe(EVA_EXTRA.rover_theta_max_deg);
    expect(await yamlNum("rover", "tobler_a")).toBe(EVA_EXTRA.rover_tobler_a);
    expect(await yamlNum("rover", "tobler_b")).toBe(EVA_EXTRA.rover_tobler_b);
    expect(await yamlNum("rover", "seated_met")).toBe(EVA_EXTRA.seated_met);
  });
});

describe("edge terms", () => {
  it("blocks slopes steeper than the walking limit and costs more uphill than downhill", () => {
    expect(edgeTerms(100, 100).ok).toBe(false); // 45 deg
    expect(edgeTerms(100, 10).o2).toBeGreaterThan(edgeTerms(100, -10).o2);
  });
  it("a rover covers flat ground faster and with less oxygen than walking", () => {
    const foot = edgeTerms(1000, 0, "foot");
    const rover = edgeTerms(1000, 0, "rover");
    expect(rover.dt).toBeLessThan(foot.dt);
    expect(rover.o2).toBeLessThan(foot.o2);
    expect(edgeTerms(100, 70, "rover").ok).toBe(false); // 35 deg, beyond the 30 deg limit
    expect(edgeTerms(100, 40, "rover").ok).toBe(true); // 21.8 deg is drivable
  });
  it("the rover slows on grades with the Python law v0 * exp(-a |i|)", () => {
    const flat = edgeTerms(100, 0, "rover");
    const hill = edgeTerms(100, 15, "rover");
    const len = Math.hypot(100, 15);
    expect(flat.dt).toBeCloseTo(100 / EVA_EXTRA.rover_ms, 6);
    expect(hill.dt).toBeCloseTo(len / (EVA_EXTRA.rover_ms * Math.exp(-1.5 * 0.15)), 6);
  });
  it("working at a stop costs time and oxygen", () => {
    const s = stopTerms();
    expect(s.dt).toBe(1200);
    expect(s.o2).toBeGreaterThan(0);
  });
});
