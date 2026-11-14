import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LocationIntro, INTRO_MS } from "./LocationIntro";
import { AccentSwitch } from "../app/AccentSwitch";
import { PinCard } from "./eva/PinCard";
import type { PinInfo } from "./eva/pin";

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-accent");
  window.localStorage.clear();
});

describe("location intro", () => {
  it("shows the place, its coordinates and the station, then removes itself", () => {
    vi.useFakeTimers();
    render(<LocationIntro title="Gale Crater" kicker="Curiosity" lat={-4.5895} lon={137.4416} line="Bradbury Landing" />);
    expect(screen.getByTestId("location-intro")).toBeTruthy();
    expect(screen.getByText("Gale Crater")).toBeTruthy();
    expect(screen.getByText("Bradbury Landing")).toBeTruthy();
    expect(screen.getByText(/4\.5895° S, 137\.4416° E/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(INTRO_MS + 50);
    });
    expect(screen.queryByTestId("location-intro")).toBeNull();
  });

  it("is skipped by a click", () => {
    render(<LocationIntro title="Jezero Crater" kicker="Perseverance" lat={18.4} lon={77.4} />);
    fireEvent.click(screen.getByTestId("location-intro"));
    expect(screen.queryByTestId("location-intro")).toBeNull();
  });
});

describe("accent switch", () => {
  it("sets the accent on the page and remembers it", () => {
    render(<AccentSwitch />);
    fireEvent.click(screen.getByRole("button", { name: "Ice accent" }));
    expect(document.documentElement.dataset["accent"]).toBe("ice");
    expect(window.localStorage.getItem("d4-accent")).toBe("ice");
    expect(screen.getByRole("button", { name: "Ice accent" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Red accent" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("pin card range ring", () => {
  const pin: PinInfo = { x: 0, y: 0, lat: -4.6, lon: 137.4, elevation: -4500, slopeDeg: 1, walkable: true, fromStationM: 2600 };
  const base = { pin, modelLabel: "DEM 10 m", onRoute: () => undefined, onAdd: () => undefined, onStand: () => undefined, onClose: () => undefined };

  it("tells how far one can go and still walk back", () => {
    render(<PinCard {...base} range={{ ring: [], toPinL: 89, budgetL: 249, maxRadiusM: 4800, reachable: true }} />);
    const t = screen.getByTestId("pin-range").textContent!;
    expect(t).toMatch(/4\.8 km/);
    expect(t).toMatch(/249 L/);
    expect(t).toMatch(/89 L/);
  });

  it("says so when the pin is out of reach", () => {
    render(<PinCard {...base} range={{ ring: [], toPinL: 502, budgetL: -165, maxRadiusM: 0, reachable: false }} />);
    expect(screen.getByTestId("pin-range").textContent).toMatch(/not reachable/);
  });
});
