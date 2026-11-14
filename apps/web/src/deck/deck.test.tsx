import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SiteDeck } from "./SiteDeck";
import { LayerDeck } from "./LayerDeck";
import type { LandingSite } from "../globe/landingSites";
import type { DockLayerItem } from "../ui/LayerDock";

const sites: LandingSite[] = [
  { id: "gale", name: "Gale Crater", mission: "MSL Curiosity", year: 2012, lat: -4.59, lon: 137.44, status: "open", detail: "local" },
  { id: "jezero", name: "Jezero Crater", mission: "Mars 2020", year: 2021, lat: 18.38, lon: 77.58, status: "open", detail: "local" },
  { id: "far", name: "Far Plains", mission: "Future", year: 2030, lat: 40, lon: 10, status: "locked" },
];

const layers: DockLayerItem[] = [
  { id: "topo", shortcutNumber: 1, name: "Topography", family: "relief", source: "MOLA", visible: true, opacity: 0.8 },
  { id: "haz", shortcutNumber: 5, name: "Hazard index", family: "hazard", source: "slope + rad", visible: false, opacity: 0.5, modeled: true },
];

describe("SiteDeck", () => {
  it("renders cards, badges and marks the selected one", () => {
    render(<SiteDeck open sites={sites} selectedId="jezero" onSelect={() => {}} onOpen={() => {}} />);
    expect(screen.getByText("Gale Crater")).toBeInTheDocument();
    expect(screen.getByText("Phase 2", { selector: ".deck__badge" })).toBeInTheDocument();
    const sel = document.querySelector('[data-site-id="jezero"]');
    expect(sel).toHaveAttribute("data-selected", "true");
    expect(document.querySelector('[data-site-id="gale"]')).toHaveAttribute("data-selected", "false");
  });

  it("arrow keys move the selection", () => {
    const onSelect = vi.fn();
    render(<SiteDeck open sites={sites} selectedId="gale" onSelect={onSelect} onOpen={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("jezero");
  });

  it("does not react to keys when closed, and is inert", () => {
    const onSelect = vi.fn();
    render(<SiteDeck open={false} sites={sites} selectedId="gale" onSelect={onSelect} onOpen={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.querySelector(".site-deck")).toHaveAttribute("data-open", "false");
  });

  it("click selects, Open button opens, locked button is disabled", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(<SiteDeck open sites={sites} selectedId="gale" onSelect={onSelect} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("Jezero Crater"));
    expect(onSelect).toHaveBeenCalledWith("jezero");
    fireEvent.click(screen.getByRole("button", { name: "Open Jezero Crater" }));
    expect(onOpen).toHaveBeenCalledWith("jezero");
    expect(screen.getByRole("button", { name: "Far Plains: Phase 2" })).toBeDisabled();
  });
});

describe("LayerDeck", () => {
  it("renders layers with MODELED tag, key hints and opacity", () => {
    render(<LayerDeck open layers={layers} onToggle={() => {}} onOpacity={() => {}} />);
    expect(screen.getByText("MODELED")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    const card = document.querySelector('[data-layer-id="haz"]') as HTMLElement;
    expect(within(card).getByText("5")).toBeInTheDocument();
  });

  it("switch and digit keys call onToggle; slider calls onOpacity", () => {
    const onToggle = vi.fn();
    const onOpacity = vi.fn();
    render(<LayerDeck open layers={layers} onToggle={onToggle} onOpacity={onOpacity} />);
    fireEvent.click(screen.getByRole("switch", { name: "Hazard index visibility" }));
    expect(onToggle).toHaveBeenLastCalledWith("haz", true);
    fireEvent.keyDown(window, { key: "1" });
    expect(onToggle).toHaveBeenLastCalledWith("topo", false);
    fireEvent.change(screen.getByLabelText("Topography opacity"), { target: { value: "30" } });
    expect(onOpacity).toHaveBeenLastCalledWith("topo", 0.3);
  });

  it("ignores digit keys while closed", () => {
    const onToggle = vi.fn();
    render(<LayerDeck open={false} layers={layers} onToggle={onToggle} onOpacity={() => {}} />);
    fireEvent.keyDown(window, { key: "1" });
    expect(onToggle).not.toHaveBeenCalled();
  });
});
