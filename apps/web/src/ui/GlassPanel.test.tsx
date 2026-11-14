import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GlassPanel } from "./GlassPanel";

describe("GlassPanel", () => {
  it("renders children with default classes", () => {
    render(<GlassPanel>Mission Content</GlassPanel>);
    const element = screen.getByText("Mission Content");
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass("glass-panel");
    expect(element).toHaveClass("glass-panel--default");
    expect(element).toHaveClass("glass-panel--padding-md");
  });

  it("applies variant and custom padding classes", () => {
    render(
      <GlassPanel variant="bordered" padding="lg" className="custom-class">
        Bordered Content
      </GlassPanel>
    );
    const element = screen.getByText("Bordered Content");
    expect(element).toHaveClass("glass-panel--bordered");
    expect(element).toHaveClass("glass-panel--padding-lg");
    expect(element).toHaveClass("custom-class");
  });

  it("renders as a custom polymorphic element", () => {
    render(
      <GlassPanel as="section" data-testid="panel-section">
        Section Content
      </GlassPanel>
    );
    const element = screen.getByTestId("panel-section");
    expect(element.tagName).toBe("SECTION");
  });
});
