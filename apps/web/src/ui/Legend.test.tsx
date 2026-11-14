import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Legend } from "./Legend";

describe("Legend", () => {
  it("renders continuous legend with gradient, title, unit and ticks", () => {
    render(
      <Legend
        title="Surface Elevation"
        unit="m (MOLA)"
        type="continuous"
        min={-4500}
        max={-3000}
        colormap="cividis"
      />
    );

    expect(screen.getByText("Surface Elevation")).toBeInTheDocument();
    expect(screen.getByText("m (MOLA)")).toBeInTheDocument();
    expect(screen.getByText("-4500")).toBeInTheDocument();
    expect(screen.getByText("-3000")).toBeInTheDocument();
  });

  it("renders categorical legend with category items and colors", () => {
    render(
      <Legend
        title="Mineralogy"
        type="categorical"
        items={[
          { label: "Clay-bearing unit", color: "#56B4E9", value: "CRISM" },
          { label: "Sulfate unit", color: "#E69F00", value: "MSL" },
        ]}
      />
    );

    expect(screen.getByText("Mineralogy")).toBeInTheDocument();
    expect(screen.getByText("Clay-bearing unit")).toBeInTheDocument();
    expect(screen.getByText("Sulfate unit")).toBeInTheDocument();
    expect(screen.getByText("CRISM")).toBeInTheDocument();
  });
});
