import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouteCompareTable, RouteResultData } from "./RouteCompareTable";

const MOCK_ROUTES: RouteResultData[] = [
  {
    route_id: "r-fastest",
    site_id: "gale",
    profile: "FASTEST",
    geometry: { type: "LineString", coordinates: [[137.44, -4.59], [137.45, -4.60]] },
    xy: [[0, 0], [500, -500]],
    totals: {
      time_s: 3000, // best time
      length_m: 2000,
      ascent_m: 50,
      descent_m: 10,
      max_slope_deg: 16.0,
      dose_mSv: 0.08,
      energy_kJ: 1100,
      o2_l: 75,
      min_temp_K: 240,
      shadow_fraction: 0.1,
      risk: 0.20,
      return_margin: 0.25,
    },
    segments: [],
    feasibility: { ok: true, violations: [] },
    assumptions: [],
    data_levels: ["L2"],
    simulated_inputs: [],
  },
  {
    route_id: "r-safest",
    site_id: "gale",
    profile: "SAFEST",
    geometry: { type: "LineString", coordinates: [[137.44, -4.59], [137.46, -4.61]] },
    xy: [[0, 0], [600, -700]],
    totals: {
      time_s: 4200,
      length_m: 2600,
      ascent_m: 30, // best ascent
      descent_m: 5,
      max_slope_deg: 9.0, // best slope
      dose_mSv: 0.04, // best dose
      energy_kJ: 900, // best energy
      o2_l: 65, // best O2
      min_temp_K: 255, // best temp
      shadow_fraction: 0.02, // best shadow
      risk: 0.06, // best risk
      return_margin: 0.40, // best margin
    },
    segments: [],
    feasibility: { ok: true, violations: [] },
    assumptions: [],
    data_levels: ["L2"],
    simulated_inputs: [],
  },
];

describe("RouteCompareTable", () => {
  it("renders table with profile columns and metrics", () => {
    render(
      <RouteCompareTable
        routes={MOCK_ROUTES}
        selectedRouteId="r-fastest"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Route Alternatives Comparison")).toBeInTheDocument();
    expect(screen.getByText("FASTEST")).toBeInTheDocument();
    expect(screen.getByText("SAFEST")).toBeInTheDocument();
    expect(screen.getByText("50m")).toBeInTheDocument(); // 3000s = 50m
  });

  it("highlights best value per column", () => {
    const { container } = render(
      <RouteCompareTable
        routes={MOCK_ROUTES}
        selectedRouteId="r-fastest"
        onSelect={vi.fn()}
      />
    );

    const bestCells = container.querySelectorAll(".route-compare-cell--best");
    expect(bestCells.length).toBeGreaterThan(5);
  });

  it("handles row selection", async () => {
    const handleSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <RouteCompareTable
        routes={MOCK_ROUTES}
        selectedRouteId="r-fastest"
        onSelect={handleSelect}
      />
    );

    const safestRow = screen.getByText("SAFEST").closest("tr");
    if (!safestRow) throw new Error("Row not found");

    await user.click(safestRow);
    expect(handleSelect).toHaveBeenCalledWith("r-safest");
  });
});
