import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayerSwitcher, LayerItem } from "./LayerSwitcher";

const MOCK_LAYERS: LayerItem[] = [
  { id: "sat", name: "Satellite Imagery", family: "optical", visible: true, opacity: 1.0, isBase: true },
  { id: "slope", name: "Slope Gradient", family: "topography", visible: true, opacity: 0.8 },
  { id: "dust", name: "Atmospheric Dust", family: "atmosphere", visible: false, opacity: 0.5, simulated: true },
];

describe("LayerSwitcher", () => {
  it("renders base layers and analytical overlay layers", () => {
    render(
      <LayerSwitcher
        layers={MOCK_LAYERS}
        onToggle={vi.fn()}
        onOpacityChange={vi.fn()}
        activeBaseLayer="sat"
      />
    );

    expect(screen.getByText("Satellite Imagery")).toBeInTheDocument();
    expect(screen.getByText("Slope Gradient")).toBeInTheDocument();
    expect(screen.getByText("Atmospheric Dust")).toBeInTheDocument();
    expect(screen.getByText("SIMULATED")).toBeInTheDocument();
  });

  it("handles layer visibility toggle", async () => {
    const handleToggle = vi.fn();
    const user = userEvent.setup();

    render(
      <LayerSwitcher
        layers={MOCK_LAYERS}
        onToggle={handleToggle}
        onOpacityChange={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole("button", { name: "Hide Slope Gradient" });
    await user.click(toggleBtn);
    expect(handleToggle).toHaveBeenCalledWith("slope", false);
  });

  it("handles opacity change slider", () => {
    const handleOpacityChange = vi.fn();

    render(
      <LayerSwitcher
        layers={MOCK_LAYERS}
        onToggle={vi.fn()}
        onOpacityChange={handleOpacityChange}
      />
    );

    const slider = screen.getByLabelText("Slope Gradient opacity");
    fireEvent.change(slider, { target: { value: "0.4" } });
    expect(handleOpacityChange).toHaveBeenCalledWith("slope", 0.4);
  });
});
