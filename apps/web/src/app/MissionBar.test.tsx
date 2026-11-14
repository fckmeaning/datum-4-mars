import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MissionBar, formatEarthLinkDelay, formatLmst } from "./MissionBar";
import { apiClient } from "../api/client";

describe("MissionBar utilities", () => {
  it("formats Earth link delays correctly", () => {
    expect(formatEarthLinkDelay(0)).toBe("0s");
    expect(formatEarthLinkDelay(45)).toBe("45s");
    expect(formatEarthLinkDelay(659)).toBe("10m 59s");
    expect(formatEarthLinkDelay(1205)).toBe("20m 05s");
  });

  it("formats LMST fractional hours to HH:MM:SS", () => {
    expect(formatLmst(0)).toBe("00:00:00");
    expect(formatLmst(12)).toBe("12:00:00");
    expect(formatLmst(14.524)).toBe("14:31:26");
  });
});

describe("MissionBar Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders mission status bar with sol, LMST, season, and Earth link delay", async () => {
    vi.spyOn(apiClient, "getSiteClock").mockResolvedValue({
      utc: "2026-10-01T12:00:00Z",
      mission_name: "Curiosity (MSL)",
      mission_sol: 4362,
      lmst_h: 14.5, // 14:30:00
      ltst_h: 14.7,
      ls_deg: 142.3,
      earth_link_one_way_s: 659.0, // 10m 59s
      earth_link_accuracy: "spice",
    });

    render(<MissionBar />);

    // Fast-forward initial promise resolution
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("SOL 4362")).toBeInTheDocument();
    expect(screen.getByText("14:30:00")).toBeInTheDocument();
    expect(screen.getByText("Ls 142.3°")).toBeInTheDocument();
    expect(screen.getByText("10m 59s")).toBeInTheDocument();

    // Advance fake timers by 10 seconds
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // LMST should tick forward (10 seconds)
    const updatedLmst = screen.getByText(/14:30:09|14:30:10/);
    expect(updatedLmst).toBeInTheDocument();
  });
});
