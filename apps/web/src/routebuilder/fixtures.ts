/** Test fixtures (not imported by the app). */
import type { RouteResult } from "./routeApi";
import type { LimitingFactor } from "./explain";

export function makeRoute(
  profile: RouteResult["profile"],
  over: { time_s?: number; dose?: number; call?: "READY" | "CAUTION" | "NO_GO"; reasons?: string[]; factors?: [LimitingFactor, number][] } = {},
): RouteResult {
  const factors = over.factors ?? [
    ["time", 600],
    ["slope", 400],
  ];
  return {
    route_id: `r-${profile.toLowerCase()}`,
    site_id: "gale",
    profile,
    geometry: { type: "LineString", coordinates: [[137.44, -4.58, -4500], [137.4, -4.7, -4300]] },
    xy: [[0, 0], [100, 100]],
    totals: {
      time_s: over.time_s ?? 3600,
      length_m: 1000,
      ascent_m: 120,
      descent_m: 40,
      max_slope_deg: 11.5,
      dose_mSv: over.dose ?? 0.5,
      energy_kJ: 900,
      o2_l: 42,
      risk: profile === "FASTEST" ? 0.8 : 0.4,
      turnback_distance_m: null,
      sunset_in_s: 5400,
    },
    segments: factors.map(([f, len], i) => ({
      i,
      length_m: len,
      duration_s: len,
      slope_deg: 5,
      components: { time: 1, energy: 1, dose: 1, hazard: 1, science_factor: 1 },
      cost: 1,
      limiting_factor: f,
    })),
    feasibility: { ok: over.call !== "NO_GO", violations: over.call === "NO_GO" ? [{ kind: "BUDGET", message: "Oxygen runs out before the return." }] : [] },
    verdict: { call: over.call ?? "READY", reasons: over.reasons ?? [] },
    assumptions: [],
    data_levels: ["L2"],
    simulated_inputs: [],
  };
}

export function alternativesBody(): { routes: RouteResult[]; best_time_route_id: string; best_risk_route_id: string } {
  return {
    routes: [
      makeRoute("FASTEST", { time_s: 3000, dose: 0.6 }),
      makeRoute("SAFEST", { time_s: 3900, dose: 0.4, call: "CAUTION", reasons: ["Returns with a thin oxygen reserve."] }),
      makeRoute("BALANCED", { time_s: 3400, dose: 0.5 }),
      makeRoute("SCIENCE", { time_s: 4200, dose: 0.5 }),
    ],
    best_time_route_id: "r-fastest",
    best_risk_route_id: "r-safest",
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
