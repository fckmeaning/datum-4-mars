import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LineChart, ViewCard, hhmm, niceScale } from "./charts";

describe("niceScale", () => {
  it("widens the domain to round steps", () => {
    const s = niceScale(-4530, -4447, 4);
    expect(s.domain[0]).toBeLessThanOrEqual(-4530);
    expect(s.domain[1]).toBeGreaterThanOrEqual(-4447);
    expect(s.ticks.length).toBeGreaterThanOrEqual(3);
    for (const t of s.ticks) expect(Math.abs(t) % 10).toBeCloseTo(0, 6);
    expect(niceScale(0, 750, 4).ticks).toEqual([0, 200, 400, 600, 800]);
  });
  it("does not break on a flat range", () => {
    const s = niceScale(5, 5, 4);
    expect(s.domain[0]).toBeLessThanOrEqual(5);
    expect(s.domain[1]).toBeGreaterThanOrEqual(5);
  });
});

describe("hhmm", () => {
  it("formats and wraps hours", () => {
    expect(hhmm(6.5)).toBe("06:30");
    expect(hhmm(24)).toBe("00:00");
    expect(hhmm(-0.25)).toBe("23:45");
  });
});

describe("LineChart", () => {
  const props = {
    label: "test chart",
    series: [
      { id: "a", label: "A", color: "red", points: [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 4 }] },
      { id: "b", label: "B", color: "blue", points: [{ x: 0, y: 2 }, { x: 10, y: 8 }], dashed: true },
    ],
    xDomain: [0, 10] as [number, number],
    yDomain: [0, 12] as [number, number],
    xLabel: "x axis",
    yLabel: "y axis",
    marks: [{ x: 5, label: "mid" }],
    hlines: [{ y: 6, label: "limit" }],
    bands: [{ from: 0, to: 2, color: "grey", label: "band" }],
  };
  it("draws one path per series with the labels, marks, limits and bands", () => {
    const { container } = render(<LineChart {...props} />);
    expect(screen.getByRole("img", { name: "test chart" })).toBeTruthy();
    expect(container.querySelectorAll("path.vchart__line").length).toBe(2);
    expect(container.querySelector('path[data-series="b"]')!.getAttribute("stroke-dasharray")).toBe("5 4");
    for (const t of ["x axis", "y axis", "mid", "limit", "band"]) expect(screen.getByText(t)).toBeTruthy();
  });
  it("reads the values under the pointer", () => {
    const { container } = render(<LineChart {...props} xFormat={(x) => `x=${x}`} yFormat={(y) => `${y}u`} />);
    expect(screen.getByText(/move over the chart/)).toBeTruthy();
    const svg = container.querySelector("svg")!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 210, right: 640, bottom: 210, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(svg, { clientX: 76 + (640 - 76 - 28) / 2, clientY: 50 });
    expect(container.querySelector(".vchart__readout")!.textContent).toMatch(/x=5/);
    expect(container.querySelector(".vchart__readout")!.textContent).toMatch(/A 10u/);
    fireEvent.pointerLeave(svg);
    expect(screen.getByText(/move over the chart/)).toBeTruthy();
  });
  it("fills an area and draws steps", () => {
    const { container } = render(<LineChart {...props} series={[{ ...props.series[0]!, area: true, step: true }]} />);
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector("path.vchart__line")!.getAttribute("d")).toMatch(/H/);
  });
});

describe("ViewCard", () => {
  it("shows the title, the badge and the note", () => {
    render(
      <ViewCard title="Card" badge="ASSUMPTION" note="where it comes from">
        <p>body</p>
      </ViewCard>,
    );
    expect(screen.getByText("Card")).toBeTruthy();
    expect(screen.getByText("ASSUMPTION")).toBeTruthy();
    expect(screen.getByText("where it comes from")).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });
});
