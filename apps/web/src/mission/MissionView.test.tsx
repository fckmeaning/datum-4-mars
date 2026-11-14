import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MissionView } from "./MissionView";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const base = { siteName: "Gale Crater", startMs: NOW };

describe("MissionView", () => {
  it("builds the dose budget from the modelled surface rate and says where the number comes from", () => {
    render(<MissionView {...base} surfaceMSvPerDay={0.65} />);
    expect(screen.getByText(/Surface dose here: 0.65 mSv\/day \(modelled layer\)/)).toBeTruthy();
    const stats = screen.getByTestId("dose-stats").textContent!;
    expect(stats).toMatch(/662 mSv/); // 2 x 180 d x 1.84 mSv/d
    expect(stats).toMatch(/325 mSv/); // 500 d x 0.65
    expect(stats).toMatch(/987 mSv/);
    expect(screen.getByTestId("dose-verdict").textContent).toMatch(/165 % of the career limit/);
    expect(screen.getByTestId("max-stay").textContent).toMatch(/cruise alone is over/);
  });

  it("falls back to the reference rate and says so when the layer is missing", () => {
    render(<MissionView {...base} surfaceMSvPerDay={null} />);
    expect(screen.getByText(/reference value 0.64 mSv\/day/)).toBeTruthy();
    expect(screen.getByText(/modelled layer is not available/)).toBeTruthy();
  });

  it("says loading while the layer loads", () => {
    render(<MissionView {...base} surfaceMSvPerDay={null} loading />);
    expect(screen.getByText(/Loading the radiation layer/)).toBeTruthy();
  });

  it("a shorter transit leaves room for a stay, and shielding stretches it", () => {
    render(<MissionView {...base} surfaceMSvPerDay={0.65} />);
    fireEvent.change(screen.getByLabelText("Transit time in days"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Surface stay in days"), { target: { value: "100" } });
    const stay1 = screen.getByTestId("max-stay").textContent!;
    expect(stay1).toMatch(/^\d+ days$/);
    const n1 = parseInt(stay1);
    expect(n1).toBe(Math.floor((600 - 2 * 150 * 1.84) / 0.65));
    fireEvent.change(screen.getByLabelText("Shielding factor"), { target: { value: "0.5" } });
    const n2 = parseInt(screen.getByTestId("max-stay").textContent!);
    expect(n2).toBeGreaterThan(n1 * 1.9);
    expect(screen.getByTestId("dose-verdict").textContent).toMatch(/% of the career limit/);
  });

  it("lists launch windows, oppositions and conjunctions with the season at arrival", () => {
    render(<MissionView {...base} surfaceMSvPerDay={0.65} />);
    const cal = screen.getByTestId("mission-calendar").textContent!;
    expect(cal).toMatch(/Launch window/);
    expect(cal).toMatch(/Opposition/);
    expect(cal).toMatch(/Solar conjunction/);
    expect(cal).toMatch(/2027-02-1\d|2027-02-2\d/); // the opposition of February 2027
    expect(cal).toMatch(/(dust|clear) season/);
    expect(cal).toMatch(/blackout about \d+ days/);
  });

  it("tells the season now and when the next dust-storm season starts", () => {
    render(<MissionView {...base} surfaceMSvPerDay={0.65} />);
    const t = screen.getByTestId("season-now").textContent!;
    expect(t).toMatch(/Ls 22°/);
    expect(t).toMatch(/Outside the dust-storm season/);
    expect(t).toMatch(/2027-1\d-\d\d/);
  });
});
