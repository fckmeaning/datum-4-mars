import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouteCard } from "./RouteCard";
import type { components } from "../api/schema";

const MOCK_ROUTE: components["schemas"]["RouteResult"] = {
  route_id: "test-fastest",
  site_id: "gale",
  profile: "FASTEST",
  geometry: { type: "LineString", coordinates: [[137.44, -4.59], [137.46, -4.61]] },
  xy: [[0, 0], [400, -600]],
  totals: {
    time_s: 3600, // 1h 00m
    length_m: 2500, // 2.5 km
    ascent_m: 45,
    descent_m: 10,
    max_slope_deg: 14.2,
    dose_mSv: 0.07,
    energy_kJ: 1100,
    o2_l: 70,
    risk: 0.12,
  },
  segments: [],
  feasibility: { ok: true, violations: [] },
  assumptions: [],
  data_levels: ["L2"],
  simulated_inputs: [],
};

describe("RouteCard", () => {
  it("renders profile, time, distance, dose and slope", () => {
    render(<RouteCard route={MOCK_ROUTE} />);
    expect(screen.getByText("FASTEST")).toBeInTheDocument();
    expect(screen.getByText("1h 00m")).toBeInTheDocument();
    expect(screen.getByText("2.5 km")).toBeInTheDocument();
    expect(screen.getByText("0.07 mSv")).toBeInTheDocument();
    expect(screen.getByText("14.2°")).toBeInTheDocument();
  });

  it("handles selection on click and keyboard", async () => {
    const handleSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <RouteCard
        route={MOCK_ROUTE}
        selected={false}
        onSelect={handleSelect}
      />
    );

    const card = screen.getByRole("button");
    await user.click(card);
    expect(handleSelect).toHaveBeenCalledWith("test-fastest");

    card.focus();
    await user.keyboard("{Enter}");
    expect(handleSelect).toHaveBeenCalledTimes(2);
  });

  it("applies selected styling and shows violation warnings", () => {
    const routeWithViolation: components["schemas"]["RouteResult"] = {
      ...MOCK_ROUTE,
      feasibility: {
        ok: false,
        violations: [{ kind: "SLOPE_LIMIT", message: "Slope exceeds 25°" }],
      },
    };

    render(<RouteCard route={routeWithViolation} selected={true} />);
    const card = screen.getByRole("button");
    expect(card).toHaveClass("route-card--selected");
    expect(screen.getByText("SLOPE_LIMIT")).toBeInTheDocument();
  });
});
