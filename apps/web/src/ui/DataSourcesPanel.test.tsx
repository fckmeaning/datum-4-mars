import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataSourcesPanel, SourceEntryData } from "./DataSourcesPanel";

const MOCK_SOURCES: SourceEntryData[] = [
  {
    id: "hirise-dtm",
    family: "topography",
    product_id: "DTEEC_002149_1755",
    source_url: "https://www.uahirise.org/dtm/",
    resolution_m: 1.0,
    level: "L3",
    credit: "NASA/JPL/University of Arizona",
    license: "NASA Open Data Policy",
    simulated: false,
    retrieved_at: "2026-03-01",
    notes: "High-resolution DEM of Gale crater boxwork",
  },
  {
    id: "sim-dust",
    family: "atmosphere",
    product_id: "SIM_DUST_TAU",
    source_url: "https://example.com/simulated-dust",
    resolution_m: 50.0,
    level: "L0",
    credit: "DATUM-4 Synthetic Atmosphere Team",
    license: "CC-BY-4.0",
    simulated: true,
  },
];

describe("DataSourcesPanel", () => {
  it("renders sources grouped by family with credit, resolution and simulated badge", () => {
    render(
      <DataSourcesPanel
        isOpen={true}
        onClose={vi.fn()}
        sources={MOCK_SOURCES}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Data Sources & Scientific Attribution/i)).toBeInTheDocument();
    expect(screen.getByText("topography")).toBeInTheDocument();
    expect(screen.getByText("atmosphere")).toBeInTheDocument();
    expect(screen.getByText(/DTEEC_002149_1755/i)).toBeInTheDocument();
    expect(screen.getByText(/NASA\/JPL\/University of Arizona/i)).toBeInTheDocument();
    expect(screen.getByText("SIMULATED")).toBeInTheDocument();
    expect(screen.getByText(/RESEARCH PROTOTYPE — NOT FOR OPERATIONAL USE/i)).toBeInTheDocument();
  });

  it("handles close button click and Esc key", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <DataSourcesPanel
        isOpen={true}
        onClose={handleClose}
        sources={MOCK_SOURCES}
      />
    );

    const closeBtn = screen.getByRole("button", { name: "Close data sources panel" });
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
