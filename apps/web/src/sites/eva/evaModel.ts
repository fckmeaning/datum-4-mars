/**
 * EVA mobility, energy and oxygen: F21-F24 of docs/MATH.md, the same formulas and parameters as
 * packages/marsnav/src/marsnav/routing/mobility.py (the tests compare against values printed by that code and against
 * config/params.yaml).
 */

export const EVA = {
  v_flat: 1.0,
  tobler_a: 3.5,
  tobler_b: 0.05,
  minetti: [280.5, -58.7, -76.8, 51.9, 19.6, 2.5],
  grade_limit: 0.45,
  k_roughness: 1.0,
  mass_astronaut: 80,
  mass_suit: 90,
  mass_payload: 15,
  s_suit: 1.3,
  g_mars: 3.721,
  g_earth: 9.80665,
  o2_energy_kJ_per_L: 20.1,
  met_ml_per_kg_min: 3.5,
  theta_max_deg: 25,
  o2_capacity_l: 450,
  reserve_fraction: 0.25,
  eva_max_h: 7,
} as const;

/**
 * Work at a stop (section `eva` of config/params.yaml) and the unpressurised rover (section `rover`, the same values
 * packages/marsnav/src/marsnav/routing/rover.py reads). All ASSUMPTIONS there; the tests compare these copies with the yaml.
 */
export const EVA_EXTRA = {
  stop_min: 20,
  stop_w: 190,
  rover_ms: 1.3888889,
  rover_theta_max_deg: 30,
  rover_tobler_a: 1.5,
  rover_tobler_b: 0,
  seated_met: 1.5,
} as const;

const DEG = Math.PI / 180;

/** F21: normalised Tobler speed [m/s]; i = rise over run (tan of the slope). v(0) = v_flat. */
export function walkSpeed(i: number, roughnessNorm = 0): number {
  const { v_flat, tobler_a: a, tobler_b: b, k_roughness } = EVA;
  return (v_flat * Math.exp(-a * Math.abs(i + b))) / Math.exp(-a * b) / (1 + k_roughness * roughnessNorm);
}

/** F22: Minetti et al. (2002) walking cost [J/(kg m)] on Earth, grade clipped to the measured range. */
export function metabolicCost(i: number): number {
  const g = Math.max(-EVA.grade_limit, Math.min(EVA.grade_limit, i));
  return EVA.minetti.reduce((acc, c) => acc * g + c, 0); // Horner: coefficients from i^5 down to i^0
}

export function totalMassKg(): number {
  return EVA.mass_astronaut + EVA.mass_suit + EVA.mass_payload;
}

/** F23: energy [J] on Mars to walk d metres at grade i: gravity scales only the grade-dependent part. */
export function edgeEnergyJ(d: number, i: number): number {
  const c0 = EVA.minetti[EVA.minetti.length - 1]!;
  const gRatio = EVA.g_mars / EVA.g_earth;
  return totalMassKg() * d * (c0 * EVA.s_suit + (metabolicCost(i) - c0) * gRatio);
}

/** F24: oxygen [L] for an energy and a duration: E / 20.1 kJ per litre plus the basal 1 MET. */
export function o2UseL(energyJ: number, durationS: number): number {
  return energyJ / (EVA.o2_energy_kJ_per_L * 1000) + (EVA.met_ml_per_kg_min * EVA.mass_astronaut * (durationS / 60)) / 1000;
}

export type Mode = "foot" | "rover";

export interface EdgeTerms {
  /** false when the slope is too steep for this mode */
  ok: boolean;
  dt: number;
  o2: number;
}

/** Time and oxygen to cover `d` metres of horizontal distance with elevation change `dz`, on foot or by rover. */
export function edgeTerms(d: number, dz: number, mode: Mode = "foot"): EdgeTerms {
  if (d <= 0) return { ok: true, dt: 0, o2: 0 };
  const i = dz / d;
  const slopeDeg = Math.atan(Math.abs(i)) / DEG;
  const len = Math.hypot(d, dz); // distance along the ground
  if (mode === "rover") {
    if (slopeDeg > EVA_EXTRA.rover_theta_max_deg) return { ok: false, dt: Infinity, o2: Infinity };
    const { rover_ms: v0, rover_tobler_a: a, rover_tobler_b: b } = EVA_EXTRA;
    const v = (v0 * Math.exp(-a * Math.abs(i + b))) / Math.exp(-a * b); // same law as the Python kernel (no roughness here)
    const dt = len / v;
    return { ok: true, dt, o2: EVA_EXTRA_RIDE_O2_PER_S * dt };
  }
  if (slopeDeg > EVA.theta_max_deg) return { ok: false, dt: Infinity, o2: Infinity };
  const dt = len / walkSpeed(i);
  return { ok: true, dt, o2: o2UseL(edgeEnergyJ(len, i), dt) };
}

/** O2 per second while riding: the seated crew burn `seated_met` times the basal 1 MET (rover.py: o2 = MET * 3.5 mL/(kg min) * m). */
const EVA_EXTRA_RIDE_O2_PER_S = (EVA_EXTRA.seated_met * EVA.met_ml_per_kg_min * EVA.mass_astronaut) / 60 / 1000;

/** O2 and time spent working at a science stop. */
export function stopTerms(): { dt: number; o2: number } {
  const dt = EVA_EXTRA.stop_min * 60;
  return { dt, o2: (EVA_EXTRA.stop_w * dt) / (EVA.o2_energy_kJ_per_L * 1000) };
}
