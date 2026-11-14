import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WhatsHereCard } from "./WhatsHereCard";
import type { PointReport } from "../api/client";

const mockReport: PointReport = {
  site_id: "gale",
  point: { lat: -4.755, lon: 137.382 },
  xy: { x: -600.5, y: -2070.3 },
  utc: "2026-10-01T12:00:00Z",
  elevation_m: -4450,
  slope_deg: 8.5,
  roughness_m: 0.25,
  sky_fraction: 0.92,
  shadowed: false,
  surface_temp_K: 270,
  dose_rate_mSv_h: 0.027,
  thermal_inertia: 340,
  samples: [],
  simulated_fields: ["roughness_m"],
};

describe("WhatsHereCard", () => {
  it("renders terrain numbers and displays SIM badge on simulated fields", () => {
    const handleClose = vi.fn();
    const handleFrom = vi.fn();
    const handleTo = vi.fn();

    render(
      <WhatsHereCard
        report={mockReport}
        onClose={handleClose}
        onRouteFrom={handleFrom}
        onRouteTo={handleTo}
      />,
    );

    expect(screen.getByText("What’s here")).toBeInTheDocument();
    expect(screen.getByText("−4,450 m")).toBeInTheDocument();
    expect(screen.getByText("8.5°")).toBeInTheDocument();
    expect(screen.getByText("Sunlit")).toBeInTheDocument();

    // Check SIM badge on roughness_m
    expect(screen.getByText("SIM")).toBeInTheDocument();

    // Test action buttons
    const fromBtn = screen.getByText("Route from here");
    fireEvent.click(fromBtn);
    expect(handleFrom).toHaveBeenCalledWith(-4.755, 137.382);

    const toBtn = screen.getByText("Route to here");
    fireEvent.click(toBtn);
    expect(handleTo).toHaveBeenCalledWith(-4.755, 137.382);
  });
});
