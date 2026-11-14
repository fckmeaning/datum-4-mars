import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayerDock, DockLayerItem } from "./LayerDock";

const MOCK_DOCK_LAYERS: DockLayerItem[] = [
  { id: "sat", shortcutNumber: 1, name: "CTX / HiRISE Optical", family: "optical", source: "NASA/JPL/MSSS", visible: true, opacity: 1.0 },
  { id: "elev", shortcutNumber: 2, name: "Surface Topography", family: "topography", source: "USGS Astropedia", visible: true, opacity: 0.85 },
  { id: "themis", shortcutNumber: 3, name: "Thermal Inertia", family: "thermal", source: "THEMIS / ASU", visible: false, opacity: 0.7, approximate: true },
  { id: "dust", shortcutNumber: 4, name: "Dust Optical Depth", family: "atmosphere", source: "REMS / MCD", visible: false, opacity: 0.5, simulated: true },
];

describe("LayerDock", () => {
  it("renders layer entries with shortcut numbers, names, and badges", () => {
    render(
      <LayerDock
        layers={MOCK_DOCK_LAYERS}
        onToggle={vi.fn()}
        onOpacity={vi.fn()}
      />
    );

    expect(screen.getByText("Orbital Data Layers")).toBeInTheDocument();
    expect(screen.getByText("CTX / HiRISE Optical")).toBeInTheDocument();
    expect(screen.getByText("Surface Topography")).toBeInTheDocument();
    expect(screen.getByText("SIMULATED")).toBeInTheDocument();
    expect(screen.getByText("APPROXIMATE")).toBeInTheDocument();
  });

  it("handles checkbox toggle", async () => {
    const handleToggle = vi.fn();
    const user = userEvent.setup();

    render(
      <LayerDock
        layers={MOCK_DOCK_LAYERS}
        onToggle={handleToggle}
        onOpacity={vi.fn()}
      />
    );

    const checkbox = screen.getByLabelText("Toggle Surface Topography");
    await user.click(checkbox);
    expect(handleToggle).toHaveBeenCalledWith("elev", false);
  });

  it("handles number key shortcuts 1-6", async () => {
    const handleToggle = vi.fn();
    const user = userEvent.setup();

    render(
      <LayerDock
        layers={MOCK_DOCK_LAYERS}
        onToggle={handleToggle}
        onOpacity={vi.fn()}
      />
    );

    await user.keyboard("2");
    expect(handleToggle).toHaveBeenCalledWith("elev", false);

    await user.keyboard("3");
    expect(handleToggle).toHaveBeenCalledWith("themis", true);
  });
});
