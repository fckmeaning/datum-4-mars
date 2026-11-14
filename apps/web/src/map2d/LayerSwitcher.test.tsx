import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayerSwitcher } from "./LayerSwitcher";
import type { LayerMeta } from "../api/client";
import { useAppStore } from "../state/store";

describe("LayerSwitcher", () => {
  const mockLayers: LayerMeta[] = [
    {
      id: "elev-l1",
      site_id: "gale",
      family: "topography",
      name: "HRSC Elevation",
      unit: "m",
      value_range: [-4500, -1500],
      resolution_m: 200,
      level: "L1",
      time_dependent: false,
      credit: "ESA/DLR/FU Berlin",
      simulated: false,
      uncertainty_note: "±5m vertical accuracy",
      cog_url: "/data/gale/L1/elevation.tif",
    },
    {
      id: "thermal-sim",
      site_id: "gale",
      family: "thermal",
      name: "Simulated Surface Temp",
      unit: "K",
      value_range: [180, 290],
      resolution_m: 200,
      level: "L0",
      time_dependent: true,
      credit: "MCD 6.1 model",
      simulated: true,
      cog_url: "/data/gale/L0/temp.tif",
    },
  ];

  it("renders primary datasets, derived GPU layers, and ground truth overlay", () => {
    const handleClose = vi.fn();
    render(<LayerSwitcher layers={mockLayers} onClose={handleClose} />);

    expect(screen.getByText("HRSC Elevation")).toBeInTheDocument();
    expect(screen.getByText("Simulated Surface Temp")).toBeInTheDocument();
    expect(screen.getByText("Derived Slope")).toBeInTheDocument();
    expect(screen.getByText("Derived Hillshade")).toBeInTheDocument();
    expect(screen.getByText("Curiosity Traverse (real)")).toBeInTheDocument();
  });

  it("displays SIMULATED and APPROXIMATE badges", () => {
    const handleClose = vi.fn();
    render(<LayerSwitcher layers={mockLayers} onClose={handleClose} />);

    expect(screen.getByText("SIMULATED")).toBeInTheDocument();
    expect(screen.getByText("APPROX")).toBeInTheDocument();
    expect(screen.getByText("REPLAY")).toBeInTheDocument();
  });

  it("toggles layer visibility in store", () => {
    const handleClose = vi.fn();
    render(<LayerSwitcher layers={mockLayers} onClose={handleClose} />);

    const slopeCheckbox = screen.getByLabelText(/Derived Slope/i);
    expect(useAppStore.getState().layers.slope?.visible).toBeFalsy();

    fireEvent.click(slopeCheckbox);
    expect(useAppStore.getState().layers.slope?.visible).toBe(true);
  });
});
