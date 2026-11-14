import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LayerMeta } from "../../api/client";
import { stateKeyFor } from "../layerLevel";
import { LayerSwitcher } from "../LayerSwitcher";
import { buildLegend } from "../layers/legend";
import { datedSnapshots } from "../layers/timeline";
import { LegendCard } from "./LegendCard";
import { MapContextMenu } from "./MapContextMenu";
import { MapStatusBar } from "./MapStatusBar";
import { TimeSlider } from "./TimeSlider";

function meta(over: Partial<LayerMeta> & { id: string }): LayerMeta {
  return { site_id: "gale", family: "optical", name: over.id, unit: "DN", level: "L3", time_dependent: false, credit: "t", simulated: false, cog_url: `/d/${over.id}.tif`, ...over } as LayerMeta;
}

describe("MapStatusBar", () => {
  it("shows hemispheres, elevation, slope and the walkability class; dashes without a cursor", () => {
    const { rerender } = render(<MapStatusBar metersPerPixel={10} cursor={null} cellM={10} />);
    expect(screen.getByTestId("cursor-readout").textContent).toContain("—");
    rerender(<MapStatusBar metersPerPixel={10} cursor={{ lat: -4.72, lon: 137.4, elevationM: -3512.4, slopeDeg: 7.26, walkability: { value: 83, label: "Walkable", color: "#3FB950" } }} cellM={10} />);
    const t = screen.getByTestId("cursor-readout").textContent ?? "";
    expect(t).toContain("4.7200° S");
    expect(t).toContain("137.4000° E");
    expect(t).toContain("-3512 m");
    expect(t).toContain("7.3°");
    expect(t).toContain("W 83");
  });
  it("shows the resolution chip only when zoomed past the data resolution", () => {
    const { rerender } = render(<MapStatusBar metersPerPixel={2} cursor={null} cellM={10} />);
    expect(screen.getByRole("status").textContent).toContain("Data resolution 10 m");
    rerender(<MapStatusBar metersPerPixel={20} cursor={null} cellM={10} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("scale bar label follows the resolution (1-2-5)", () => {
    render(<MapStatusBar metersPerPixel={10} cursor={null} cellM={10} />);
    expect(screen.getByLabelText(/Scale 1 km/)).toBeInTheDocument();
  });
});

describe("LegendCard", () => {
  it("renders nothing without entries, and entries with swatches and notes", () => {
    const { container, rerender } = render(<LegendCard entries={[]} />);
    expect(container.firstChild).toBeNull();
    rerender(
      <LegendCard
        entries={buildLegend({ elevation: { visible: false }, traverse: { visible: false }, slope: { visible: true } }, { elevation: meta({ id: "e", family: "topography", resolution_m: 10 }) })}
      />,
    );
    expect(screen.getByText(/No-go above 25 deg/)).toBeInTheDocument();
    expect(screen.getByText(/Hazards smaller than 10 m are not resolved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /legend/i }));
    expect(screen.queryByText(/No-go above/)).toBeNull();
  });
});

describe("TimeSlider", () => {
  const snaps = datedSnapshots([
    meta({ id: "a", time_dependent: true, valid_time: "1999-01-01T00:00:00Z" }),
    meta({ id: "b", time_dependent: true, valid_time: "2016-01-01T00:00:00Z" }),
  ]);
  const base = { activeId: "a", compareId: "b", mode: "single" as const, swipe: 0.5, onActive: vi.fn(), onCompare: vi.fn(), onMode: vi.fn(), onSwipe: vi.fn() };
  it("is hidden with fewer than two dated snapshots", () => {
    const { container } = render(<TimeSlider {...base} snapshots={snaps.slice(0, 1)} />);
    expect(container.firstChild).toBeNull();
  });
  it("shows a tab per year and calls back", () => {
    render(<TimeSlider {...base} snapshots={snaps} />);
    fireEvent.click(screen.getByRole("tab", { name: "2016" }));
    expect(base.onActive).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByLabelText("Compare with"));
    expect(base.onMode).toHaveBeenCalledWith("swipe");
    expect((screen.getByLabelText("Swipe position") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("MapContextMenu", () => {
  it("offers the three actions with the clicked coordinates and closes", () => {
    const onWhatsHere = vi.fn();
    const onViewshed = vi.fn();
    const onCopy = vi.fn();
    const onClose = vi.fn();
    render(<MapContextMenu state={{ x: 10, y: 20, lat: -4.7, lon: 137.4 }} onClose={onClose} onWhatsHere={onWhatsHere} onViewshed={onViewshed} onCopy={onCopy} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /what can i see from here/i }));
    expect(onViewshed).toHaveBeenCalledWith(-4.7, 137.4);
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: /^what.s here/i }));
    expect(onWhatsHere).toHaveBeenCalledWith(-4.7, 137.4);
  });
  it("renders nothing when closed", () => {
    const { container } = render(<MapContextMenu state={null} onClose={vi.fn()} onWhatsHere={vi.fn()} onViewshed={vi.fn()} onCopy={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("LayerSwitcher integration with the new layers", () => {
  it("shows honest empty states when optical and walkability are missing, and hides them when present", () => {
    const { container, rerender } = render(<LayerSwitcher layers={[meta({ id: "gale.L3.elevation", family: "topography", unit: "m" })]} onClose={vi.fn()} />);
    expect(container.querySelector('[data-empty="optical"]')).not.toBeNull();
    expect(container.querySelector('[data-empty="walkability"]')).not.toBeNull();
    rerender(<LayerSwitcher layers={[meta({ id: "gale.L3.optical" }), meta({ id: "gale.L3.walkability", family: "hazard" })]} onClose={vi.fn()} />);
    expect(container.querySelector('[data-empty="optical"]')).toBeNull();
    expect(container.querySelector('[data-empty="walkability"]')).toBeNull();
  });
  it("API layers write to the canonical store keys the map reads", () => {
    expect(stateKeyFor(meta({ id: "gale.L3.elevation", family: "topography" }))).toBe("elevation");
    expect(stateKeyFor(meta({ id: "gale.L3.optical" }))).toBe("optical");
    expect(stateKeyFor(meta({ id: "gale.L3.walkability", family: "hazard" }))).toBe("walkability");
    expect(stateKeyFor(meta({ id: "gale.timeline.1999", time_dependent: true }))).toBe("gale.timeline.1999");
  });
  it("has toggles for the isochrone and line-of-sight overlays", () => {
    render(<LayerSwitcher layers={[]} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Return-time isochrones/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Line of sight/)).toBeInTheDocument();
  });
});
