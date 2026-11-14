import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteWhyCard } from "./RouteWhyCard";
import type { components } from "../api/schema";

const MOCK_ROUTE: components["schemas"]["RouteResult"] = {
  route_id: "why-safest",
  site_id: "gale",
  profile: "SAFEST",
  geometry: { type: "LineString", coordinates: [[137.44, -4.59], [137.45, -4.60]] },
  xy: [[0, 0], [500, -500]],
  totals: {
    time_s: 3600,
    length_m: 2400,
    ascent_m: 40,
    descent_m: 10,
    max_slope_deg: 12,
    dose_mSv: 0.05,
    energy_kJ: 950,
    o2_l: 68,
    risk: 0.09,
  },
  segments: [
    {
      i: 0,
      length_m: 1200,
      duration_s: 1800,
      slope_deg: 8.0,
      components: { time: 0.2, energy: 0.2, dose: 0.3, hazard: 0.3, science_factor: 1.0 },
      cost: 1.0,
      limiting_factor: "dose",
    },
    {
      i: 1,
      length_m: 1200,
      duration_s: 1800,
      slope_deg: 9.0,
      components: { time: 0.2, energy: 0.2, dose: 0.3, hazard: 0.3, science_factor: 1.0 },
      cost: 1.0,
      limiting_factor: "hazard",
    },
  ],
  feasibility: { ok: true, violations: [] },
  assumptions: [],
  data_levels: ["L2"],
  simulated_inputs: [],
};

describe("RouteWhyCard", () => {
  it("renders explanation for limiting factor and component breakdown percentages", () => {
    render(<RouteWhyCard route={MOCK_ROUTE} />);

    expect(screen.getByText(/Why this route\?/i)).toBeInTheDocument();
    expect(screen.getByText("SAFEST")).toBeInTheDocument();
    expect(screen.getByText(/Primary Limiting Factor:/i)).toBeInTheDocument();
    expect(screen.getByText(/Cost sum check/i)).toBeInTheDocument();
    expect(screen.getByText(/Risk: 0.09/i)).toBeInTheDocument();
  });
});
