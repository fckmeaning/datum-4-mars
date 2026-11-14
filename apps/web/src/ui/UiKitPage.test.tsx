import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UiKitPage } from "./UiKitPage";

describe("UiKitPage", () => {
  it("renders without crashing and displays all design system sections", () => {
    render(<UiKitPage />);
    expect(screen.getByRole("heading", { name: /DATUM-4/i })).toBeInTheDocument();
    expect(screen.getByText(/Design Tokens & Contrast/i)).toBeInTheDocument();
    expect(screen.getByText(/Start Menu Controls/i)).toBeInTheDocument();
    expect(screen.getByText(/Route Alternatives/i)).toBeInTheDocument();
    expect(screen.getByText(/Layer Switcher & Map Legends/i)).toBeInTheDocument();
    expect(screen.getByText(/Mission Settings Panel/i)).toBeInTheDocument();
    expect(screen.getByText(/Visor \/ Helmet-HUD Mode/i)).toBeInTheDocument();
  });
});
