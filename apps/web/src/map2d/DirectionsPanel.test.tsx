import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DirectionsPanel } from "./DirectionsPanel";
import { useAppStore } from "../state/store";
import { apiClient, type Place, ApiError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    apiClient: {
      routeAlternatives: vi.fn(),
    },
  };
});

describe("DirectionsPanel", () => {
  const mockPlaces: Place[] = [
    {
      id: "base-bradbury",
      name: "Bradbury Landing",
      kind: "base",
      source: "MSL_waypoints.json",
      lat: -4.5895,
      lon: 137.4417,
    },
    {
      id: "yellowknife",
      name: "Yellowknife Bay",
      kind: "mission_informal",
      source: "MSL_waypoints.json",
      lat: -4.59,
      lon: 137.45,
    },
  ];

  beforeEach(() => {
    useAppStore.setState({
      waypoints: [
        { role: "start", dwell_min: 0, place_id: "base-bradbury", lat: -4.5895, lon: 137.4417 },
        { role: "goal", dwell_min: 0, place_id: "yellowknife", lat: -4.59, lon: 137.45 },
      ],
      routes: [],
      selectedRouteId: null,
    });
    vi.clearAllMocks();
  });

  it("calculates alternatives and populates route alternatives", async () => {
    vi.mocked(apiClient.routeAlternatives).mockResolvedValueOnce({
      routes: [
        {
          route_id: "rt-fastest",
          site_id: "gale",
          profile: "FASTEST",
          geometry: { type: "LineString", coordinates: [[137.4417, -4.5895], [137.45, -4.59]] },
          xy: [[0, 0], [100, 100]],
          segments: [],
          totals: {
            length_m: 850,
            time_s: 1800,
            ascent_m: 20,
            descent_m: 10,
            max_slope_deg: 8.5,
            dose_mSv: 0.05,
            energy_kJ: 120,
            o2_l: 30,
            return_margin: 0.4,
            risk: 0.15,
          },
          feasibility: { ok: true, violations: [] },
          assumptions: [],
          data_levels: ["L1"],
          simulated_inputs: [],
        },
        {
          route_id: "rt-safest",
          site_id: "gale",
          profile: "SAFEST",
          geometry: { type: "LineString", coordinates: [[137.4417, -4.5895], [137.45, -4.59]] },
          xy: [[0, 0], [100, 100]],
          segments: [],
          totals: {
            length_m: 920,
            time_s: 2100,
            ascent_m: 15,
            descent_m: 5,
            max_slope_deg: 4.2,
            dose_mSv: 0.03,
            energy_kJ: 140,
            o2_l: 35,
            return_margin: 0.45,
            risk: 0.08,
          },
          feasibility: { ok: true, violations: [] },
          assumptions: [],
          data_levels: ["L1"],
          simulated_inputs: [],
        },
      ],
    });

    const handleClose = vi.fn();
    render(<DirectionsPanel places={mockPlaces} onClose={handleClose} />);

    const calcButton = screen.getByRole("button", { name: /Calculate Alternatives/i });
    fireEvent.click(calcButton);

    await waitFor(() => {
      expect(screen.getByText("FASTEST")).toBeInTheDocument();
      expect(screen.getByText("SAFEST")).toBeInTheDocument();
    });

    expect(useAppStore.getState().routes.length).toBe(2);
    expect(useAppStore.getState().selectedRouteId).toBe("rt-fastest");
  });

  it("renders human-readable ApiError message on routing failure", async () => {
    vi.mocked(apiClient.routeAlternatives).mockRejectedValueOnce(
      new ApiError("No traversable path found between waypoints due to 45° cliff.", 422),
    );

    const handleClose = vi.fn();
    render(<DirectionsPanel places={mockPlaces} onClose={handleClose} />);

    const calcButton = screen.getByRole("button", { name: /Calculate Alternatives/i });
    fireEvent.click(calcButton);

    await waitFor(() => {
      expect(
        screen.getByText(/No traversable path found between waypoints due to 45° cliff/i),
      ).toBeInTheDocument();
    });
  });

  it("renders feasibility violations as a warning Toast", async () => {
    vi.mocked(apiClient.routeAlternatives).mockResolvedValueOnce({
      routes: [
        {
          route_id: "rt-fastest",
          site_id: "gale",
          profile: "FASTEST",
          geometry: { type: "LineString", coordinates: [[137.4417, -4.5895], [137.45, -4.59]] },
          xy: [[0, 0], [100, 100]],
          segments: [],
          totals: {
            length_m: 850,
            time_s: 1800,
            ascent_m: 20,
            descent_m: 10,
            max_slope_deg: 12.0,
            dose_mSv: 0.05,
            energy_kJ: 120,
            o2_l: 30,
            return_margin: 0.1,
            risk: 0.35,
          },
          feasibility: {
            ok: false,
            violations: [
              { kind: "RETURN_RESERVE", message: "Return energy margin below 20% threshold" },
            ],
          },
          assumptions: [],
          data_levels: ["L1"],
          simulated_inputs: [],
        },
      ],
    });

    const handleClose = vi.fn();
    render(<DirectionsPanel places={mockPlaces} onClose={handleClose} />);

    const calcButton = screen.getByRole("button", { name: /Calculate Alternatives/i });
    fireEvent.click(calcButton);

    await waitFor(() => {
      expect(screen.getByText(/Return energy margin below 20% threshold/i)).toBeInTheDocument();
    });
  });
});
