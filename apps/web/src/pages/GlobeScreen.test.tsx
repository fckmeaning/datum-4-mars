import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { GlobeScreen } from "./GlobeScreen";
import { useAppStore } from "../state/store";

// Mock MarsGlobe WebGL component
vi.mock("../globe/MarsGlobe", () => ({
  MarsGlobe: ({
    flyIn,
    onFlyInComplete,
    onAltitude,
  }: {
    flyIn?: boolean;
    onFlyInComplete?: () => void;
    onAltitude?: (alt: number) => void;
  }) => {
    return (
      <div data-testid="mars-globe-mock">
        <span data-testid="fly-in-state">{flyIn ? "flying-in" : "orbit"}</span>
        <button
          data-testid="trigger-fly-complete"
          onClick={() => onFlyInComplete?.()}
        >
          Complete FlyIn
        </button>
        <button
          data-testid="trigger-altitude-change"
          onClick={() => onAltitude?.(1250.5)}
        >
          Set Alt
        </button>
      </div>
    );
  },
}));

// Mock router navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("GlobeScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useAppStore.setState({
      altitude_km: 1800,
      autopilotRunning: false,
      autopilotStep: null,
      autopilotCaption: null,
    });
  });

  it("renders the target strip", async () => {
    render(
      <MemoryRouter>
        <GlobeScreen />
      </MemoryRouter>,
    );

    expect(screen.getByText("DATUM-4")).toBeDefined();
    expect(screen.getByText("GLOBAL SURVEY MODE")).toBeDefined();
    expect(screen.getAllByText("Gale Crater").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /Descend to Gale/i })).toBeDefined();
  });

  it("triggers flyIn and navigates to planner when Descend to Gale is clicked", async () => {
    render(
      <MemoryRouter>
        <GlobeScreen />
      </MemoryRouter>,
    );

    const descendBtn = screen.getByRole("button", { name: /Descend to Gale/i });
    expect(screen.getByTestId("fly-in-state").textContent).toBe("orbit");

    fireEvent.click(descendBtn);
    expect(screen.getByTestId("fly-in-state").textContent).toBe("flying-in");

    // Trigger complete
    fireEvent.click(screen.getByTestId("trigger-fly-complete"));
    expect(mockNavigate).toHaveBeenCalledWith("/site/gale");
  });

  it("updates camera altitude readout", async () => {
    render(
      <MemoryRouter>
        <GlobeScreen />
      </MemoryRouter>,
    );

    expect(screen.getByText("1800.0 km")).toBeDefined();

    fireEvent.click(screen.getByTestId("trigger-altitude-change"));
    expect(useAppStore.getState().altitude_km).toBe(1250.5);
    await waitFor(() => {
      expect(screen.getByText("1250.5 km")).toBeDefined();
    });
  });

  it("navigates to home when Escape key is pressed", () => {
    render(
      <MemoryRouter>
        <GlobeScreen />
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
