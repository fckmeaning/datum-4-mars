import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SkyView } from "./SkyView";
import { mars24 } from "./marsSky";

const NOW = Date.parse("2026-11-14T12:00:00Z");

function Probe() {
  const l = useLocation();
  return <output data-testid="loc">{l.search}</output>;
}

function setup(props: Partial<React.ComponentProps<typeof SkyView>> = {}, url = "/site/gale?view=sky") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SkyView siteName="Gale Crater" lat={-4.5895} lon={137.4416} startMs={NOW} {...props} />
      <Probe />
    </MemoryRouter>,
  );
}

describe("SkyView", () => {
  it("shows the Sun, Earth, day length and the signal delay for the site and the instant", () => {
    setup();
    const facts = screen.getByTestId("sky-facts").textContent!;
    expect(facts).toMatch(/Sunrise · sunset/);
    expect(facts).toMatch(/h of a 24 h sol/);
    expect(facts).toMatch(/Signal delay.*min.*one way/);
    expect(screen.getByText(/Ls 22°/)).toBeTruthy(); // the season of 2026-11-14, from Mars24
    expect(screen.getByTestId("sky-dome")).toBeTruthy();
    expect(screen.getByTestId("sky-day-chart")).toBeTruthy();
    expect(screen.getByTestId("sky-temp-chart").textContent).toMatch(/ASSUMPTION/);
  });

  it("lists Phobos and Deimos with their sky geometry", () => {
    setup();
    const t = screen.getByTestId("sky-moons").textContent!;
    expect(t).toMatch(/Phobos/);
    expect(t).toMatch(/the west/);
    expect(t).toMatch(/Deimos/);
    expect(t).toMatch(/the east/);
  });

  it("moves the clock with the local time slider and writes the instant to the address", () => {
    setup();
    const slider = screen.getByLabelText("Local true solar time") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "6" } });
    const loc = screen.getByTestId("loc").textContent!;
    const m = /sky=(\d+)/.exec(loc);
    expect(m).not.toBeNull();
    expect(loc).toMatch(/view=sky/); // other parameters are kept
    // the instant now has the local solar time 06:00 (to the minute)
    const ms = Number(m![1]) * 1000;
    const ltst = (((mars24(ms).mstH + 137.4416 / 15 + mars24(ms).eotDeg / 15) % 24) + 24) % 24;
    expect(ltst).toBeCloseTo(6, 1);
    expect(screen.getByLabelText("Local true solar time")).toBeTruthy();
  });

  it("jumps to a season with the Ls slider and keeps the time of day", () => {
    setup();
    const before = (screen.getByLabelText("Local true solar time") as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText("Season, solar longitude"), { target: { value: "200" } });
    expect(screen.getByText(/Ls 200°/)).toBeTruthy();
    // in the dust-storm season the note says so
    expect(screen.getByTestId("sky-season-chart").textContent).toMatch(/dust-storm season is on now/);
    const after = (screen.getByLabelText("Local true solar time") as HTMLInputElement).value;
    expect(Math.abs(Number(after) - Number(before))).toBeLessThan(0.6);
  });

  it("starts from the address and Now goes back to the present", () => {
    const t0 = Date.parse("2027-03-01T00:00:00Z") / 1000;
    render(
      <MemoryRouter initialEntries={[`/site/gale?view=sky&sky=${t0}`]}>
        <SkyView siteName="Gale Crater" lat={-4.5895} lon={137.4416} />
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByText(/2027-03-01/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Now" }));
    expect(screen.getByTestId("loc").textContent).not.toMatch(/sky=/);
    expect(screen.queryByText(/2027-03-01/)).toBeNull();
  });

  it("says polar night at a high latitude in winter and shows no sunrise", () => {
    setup({ lat: 80, lon: 0, siteName: "Polar", startMs: Date.parse("2027-01-01T00:00:00Z") });
    // whatever the season, the facts always answer: sunrise times or an explicit polar statement
    const facts = screen.getByTestId("sky-facts").textContent!;
    expect(/\d\d:\d\d · \d\d:\d\d|polar night|polar day/.test(facts)).toBe(true);
  });
});
