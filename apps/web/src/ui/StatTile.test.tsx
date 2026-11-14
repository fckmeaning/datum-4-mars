import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatTile } from "./StatTile";
import { OxygenIcon } from "./Icons";

describe("StatTile", () => {
  it("renders label, value, unit, and icon", () => {
    render(
      <StatTile
        label="Oxygen Level"
        value={84}
        unit="%"
        icon={<OxygenIcon data-testid="o2-icon" />}
        status="ok"
        subtitle="378 L remaining"
      />
    );

    expect(screen.getByText("Oxygen Level")).toBeInTheDocument();
    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
    expect(screen.getByTestId("o2-icon")).toBeInTheDocument();
    expect(screen.getByText("378 L remaining")).toBeInTheDocument();
  });

  it("applies status variant classes", () => {
    const { container } = render(
      <StatTile
        label="Radiation"
        value="0.65"
        unit="mSv"
        status="danger"
      />
    );
    expect(container.firstChild).toHaveClass("stat-tile--danger");
  });
});
