import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FpvHud, type FpvTelemetry } from "./fpvHud";

function telemetry(over: Partial<FpvTelemetry> = {}): FpvTelemetry {
  return {
    headingDeg: 57,
    pitchDeg: 0,
    elevationM: -4501.4,
    slopeDeg: 3.44,
    speedMps: 0.78,
    distanceWalkedM: 412,
    distanceRemainingM: 1240,
    etaS: 3725,
    o2LeftL: 90,
    o2TotalL: 120,
    energyLeftKJ: 800,
    energyTotalKJ: 4000,
    sunAzimuthDeg: 270.2,
    sunElevationDeg: 38.6,
    missionUtc: "2026-11-14T09:05:07.000Z",
    baseBearingDeg: 187,
    baseDistanceM: 1240,
    terrainHorizonDeg: 1.24,
    playbackSpeed: 4,
    paused: false,
    freeRoam: false,
    ...over,
  };
}

const view = { fovDeg: 70, viewportHeight: 800, viewportWidth: 1280 };

describe("FpvHud", () => {
  it("shows heading, compass point, position and progress", () => {
    render(<FpvHud telemetry={telemetry()} hudVisible {...view} />);
    const hud = screen.getByRole("group", { name: /helmet hud/i });
    expect(within(hud).getByText("057°")).toBeInTheDocument();
    expect(within(hud).getByText("ENE")).toBeInTheDocument();
    expect(within(hud).getByText("-4 501 m")).toBeInTheDocument();
    expect(within(hud).getByText("+3.4°")).toBeInTheDocument();
    expect(within(hud).getByText("0.78 m/s")).toBeInTheDocument();
    expect(within(hud).getByText("412 m")).toBeInTheDocument();
    expect(within(hud).getAllByText("1.24 km").length).toBeGreaterThanOrEqual(1);
    expect(within(hud).getByText("1:02:05")).toBeInTheDocument();
    expect(within(hud).getByText("09:05:07")).toBeInTheDocument();
    expect(within(hud).getByText("4x")).toBeInTheDocument();
  });

  it("shows consumables as meters with the remaining percentage", () => {
    render(<FpvHud telemetry={telemetry()} hudVisible {...view} />);
    expect(screen.getByRole("meter", { name: "O2" })).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByRole("meter", { name: "ENERGY" })).toHaveAttribute("aria-valuenow", "20");
  });

  it("omits meters and the base arrow when the data is missing", () => {
    render(<FpvHud telemetry={telemetry({ o2LeftL: null, o2TotalL: null, energyLeftKJ: null, energyTotalKJ: null, baseBearingDeg: null, baseDistanceM: null })} hudVisible {...view} />);
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.queryByLabelText(/back to base/i)).toBeNull();
  });

  it("marks the terrain horizon on the elevation ruler and the base bearing", () => {
    render(<FpvHud telemetry={telemetry()} hudVisible {...view} />);
    expect(screen.getByText(/HORIZON \+1\.2°/)).toBeInTheDocument();
    const base = screen.getByLabelText(/back to base/i);
    expect(within(base).getByText("187° S")).toBeInTheDocument();
  });

  it("labels the playback mode: paused and free roam", () => {
    const { rerender } = render(<FpvHud telemetry={telemetry({ paused: true })} hudVisible {...view} />);
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    rerender(<FpvHud telemetry={telemetry({ freeRoam: true })} hudVisible {...view} />);
    expect(screen.getByText("FREE ROAM")).toBeInTheDocument();
  });

  it("hides every instrument when hudVisible is false but keeps the visor", () => {
    const { container } = render(<FpvHud telemetry={telemetry()} hudVisible={false} {...view} />);
    expect(screen.getByRole("group", { name: /helmet hud/i })).toBeInTheDocument();
    expect(screen.queryByText("ENE")).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
    expect(container.querySelector(".fpv-vignette")).not.toBeNull();
  });
});
