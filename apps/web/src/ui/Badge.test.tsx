import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders data fidelity badges with appropriate classes", () => {
    const { rerender } = render(<Badge variant="SIMULATED" />);
    expect(screen.getByText("SIMULATED")).toHaveClass("badge--SIMULATED");

    rerender(<Badge variant="APPROXIMATE" />);
    expect(screen.getByText("APPROXIMATE")).toHaveClass("badge--APPROXIMATE");

    rerender(<Badge variant="REPLAY" />);
    expect(screen.getByText("REPLAY")).toHaveClass("badge--REPLAY");

    rerender(<Badge variant="LIVE" />);
    expect(screen.getByText("LIVE")).toHaveClass("badge--LIVE");
  });

  it("renders custom children and status variants", () => {
    render(
      <Badge variant="ok" size="sm">
        Passed Safety Check
      </Badge>
    );
    const badge = screen.getByText("Passed Safety Check");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("badge--ok");
    expect(badge).toHaveClass("badge--sm");
  });
});
