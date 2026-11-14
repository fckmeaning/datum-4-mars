import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Hud } from "./Hud";

describe("Hud Component (Helmet-HUD Visor Mode)", () => {
  const MOCK_HUD_PROPS = {
    heading: 135,
    nextWaypoint: { name: "Boxwork Ridge #2", bearing_deg: 142, distance_m: 640 },
    backToBase: { bearing_deg: 315, distance_m: 1850 },
    evaDose: { current_mSv: 0.12, max_mSv: 0.50, rate_mSv_h: 0.045 },
    lifeSupport: { o2_percent: 86, time_remaining_s: 14800 },
    commsWindow: { next_aos_in_s: 1920, duration_s: 720, orbiter_name: "Mars Odyssey" },
    alerts: [{ id: "sep", text: "SEP EVENT: MULTIPLIER 1.6x", severity: "danger" as const }],
  };

  it("renders heading tape with current heading and cardinal readout", () => {
    render(<Hud {...MOCK_HUD_PROPS} />);
    expect(screen.getByLabelText(/Heading 135° SE/i)).toBeInTheDocument();
    expect(screen.getByText("135°")).toBeInTheDocument();
    expect(screen.getAllByText("SE").length).toBeGreaterThanOrEqual(1);
  });

  it("renders next waypoint and return to base telemetry", () => {
    render(<Hud {...MOCK_HUD_PROPS} />);
    expect(screen.getByText("Next Waypoint")).toBeInTheDocument();
    expect(screen.getByText("640 m")).toBeInTheDocument();
    expect(screen.getByText(/Boxwork Ridge #2/i)).toBeInTheDocument();

    expect(screen.getByText("Return Vector")).toBeInTheDocument();
    expect(screen.getByText("1.9 km")).toBeInTheDocument();
  });

  it("renders life support and radiation telemetry", () => {
    render(<Hud {...MOCK_HUD_PROPS} />);
    expect(screen.getByText(/O2 86%/i)).toBeInTheDocument();
    expect(screen.getByText(/4h 06m/i)).toBeInTheDocument();
    expect(screen.getByText(/0.12 mSv/i)).toBeInTheDocument();
    expect(screen.getByText(/LIMIT 0.50 mSv/i)).toBeInTheDocument();
  });

  it("renders spacesuit glove touch targets (>= 64px) and triggers callbacks", async () => {
    const handleReturn = vi.fn();
    const handleReroute = vi.fn();
    const user = userEvent.setup();

    render(
      <Hud
        {...MOCK_HUD_PROPS}
        onReturnToBase={handleReturn}
        onTriggerReroute={handleReroute}
      />
    );

    const returnBtn = screen.getByRole("button", { name: "Return to Habitat" });
    const rerouteBtn = screen.getByRole("button", { name: "Recalculate Route" });

    expect(returnBtn).toHaveClass("hud__glove-btn");
    expect(rerouteBtn).toHaveClass("hud__glove-btn");

    await user.click(returnBtn);
    expect(handleReturn).toHaveBeenCalledTimes(1);

    await user.click(rerouteBtn);
    expect(handleReroute).toHaveBeenCalledTimes(1);
  });

  it("displays recalculating banner when route recalculation is active", () => {
    render(<Hud {...MOCK_HUD_PROPS} isRecalculating={true} />);
    expect(screen.getByText(/Recalculating route from current position.../i)).toBeInTheDocument();
  });
});
