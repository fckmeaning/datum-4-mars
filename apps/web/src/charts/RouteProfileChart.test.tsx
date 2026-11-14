import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  transformRouteSegments,
  RouteProfileChart,
  SegmentData,
} from "./RouteProfileChart";

const MOCK_SEGMENTS: SegmentData[] = [
  {
    i: 0,
    length_m: 1000,
    duration_s: 1200, // 20 min = 0.333 h
    slope_deg: 5.71, // sin(5.71°) ≈ 0.0995 -> ~99.5m ascent
    ascent_m: 100,
    components: { time: 0.4, energy: 0.2, dose: 0.2, hazard: 0.2, science_factor: 1.0 },
    cost: 1.0,
    limiting_factor: "time",
    dose_rate_mSv_h: 0.03, // 0.03 * (1200/3600) = 0.01 mSv
    energy_kJ: 250,
  },
  {
    i: 1,
    length_m: 500,
    duration_s: 900,
    slope_deg: 18.0,
    ascent_m: 154,
    components: { time: 0.1, energy: 0.3, dose: 0.2, hazard: 0.4, science_factor: 1.0 },
    cost: 1.4,
    limiting_factor: "slope",
    dose_rate_mSv_h: 0.02,
    energy_kJ: 180,
  },
];

describe("RouteProfileChart and Data Transformation", () => {
  it("pure function transformRouteSegments correctly calculates cumulative distance, elevation, dose, and energy", () => {
    const initialElev = -4500;
    const res = transformRouteSegments(MOCK_SEGMENTS, initialElev);

    // Initial point + 2 segments = 3 points
    expect(res.points).toHaveLength(3);

    // Point 0 (Start)
    expect(res.points[0]?.distance_km).toBe(0);
    expect(res.points[0]?.elevation_m).toBe(-4500);
    expect(res.points[0]?.cum_dose_mSv).toBe(0);
    expect(res.points[0]?.cum_energy_kJ).toBe(0);

    // Point 1 (After Segment 0: 1000m, +100m ascent)
    expect(res.points[1]?.distance_km).toBe(1.0);
    expect(res.points[1]?.elevation_m).toBe(-4400);
    expect(res.points[1]?.cum_dose_mSv).toBe(0.01);
    expect(res.points[1]?.cum_energy_kJ).toBe(250);
    expect(res.points[1]?.limiting_factor).toBe("time");

    // Point 2 (After Segment 1: +500m -> 1.5km, +154m ascent -> -4246m)
    expect(res.points[2]?.distance_km).toBe(1.5);
    expect(res.points[2]?.elevation_m).toBe(-4246);
    expect(res.points[2]?.cum_energy_kJ).toBe(430); // 250 + 180
    expect(res.points[2]?.limiting_factor).toBe("slope");

    // Limiting factor bands
    expect(res.limitingBands).toHaveLength(2);
    expect(res.limitingBands[0]?.factor).toBe("time");
    expect(res.limitingBands[1]?.factor).toBe("slope");

    // uPlot data shape: 5 series arrays of equal length
    expect(res.uPlotData).toHaveLength(5);
    expect(res.uPlotData[0]).toHaveLength(3);
    expect(res.uPlotData[1]).toHaveLength(3);
  });

  it("handles elevation integration when ascent_m is omitted (integrates length * sin(slope))", () => {
    const segmentWithoutAscent: SegmentData[] = [
      {
        i: 0,
        length_m: 1000,
        duration_s: 1000,
        slope_deg: 30, // sin(30°) = 0.5 -> 500m ascent
        components: { time: 0.5, energy: 0.5, dose: 0, hazard: 0, science_factor: 1.0 },
        cost: 1.0,
        limiting_factor: "time",
      },
    ];

    const res = transformRouteSegments(segmentWithoutAscent, 0);
    expect(res.points[1]?.elevation_m).toBe(500); // 1000 * 0.5
  });

  it("renders chart container and screen-reader accessible table", () => {
    render(<RouteProfileChart segments={MOCK_SEGMENTS} initialElevation_m={-4500} />);

    expect(screen.getByText("Along-Route Profile")).toBeInTheDocument();
    // Appears in both the legend and the accessible table header.
    expect(screen.getAllByText("Elevation (m)").length).toBeGreaterThan(0);
    expect(screen.getByText("Slope (°)")).toBeInTheDocument();
    expect(screen.getAllByRole("table", { hidden: true }).length).toBeGreaterThan(0);
  });
});
