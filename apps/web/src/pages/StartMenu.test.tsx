import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { StartMenu } from "./StartMenu";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.ResizeObserver = MockResizeObserver;
  }
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("StartMenu", () => {
  it("renders menu options and handles keyboard navigation", () => {
    render(
      <BrowserRouter>
        <StartMenu />
      </BrowserRouter>,
    );

    expect(screen.getByText("Start Simulation")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("About / Methods")).toBeInTheDocument();
    expect(screen.getByText("Exit")).toBeInTheDocument();

    // Arrow down moves selection
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });

    // Press Enter to activate selected (About / Methods)
    fireEvent.keyDown(window, { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledWith("/methods");
  });

  it("navigates to globe fly-in or planner when Start Simulation is clicked", () => {
    mockNavigate.mockClear();
    render(
      <BrowserRouter>
        <StartMenu />
      </BrowserRouter>,
    );

    const startBtn = screen.getByText("Start Simulation");
    fireEvent.click(startBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/globe");
  });

  it("opens settings modal when Settings is clicked and closes with Escape", () => {
    render(
      <BrowserRouter>
        <StartMenu />
      </BrowserRouter>,
    );

    const settingsBtn = screen.getByText("Settings");
    fireEvent.click(settingsBtn);

    expect(screen.getByRole("dialog", { name: "Settings modal" })).toBeInTheDocument();

    // Escape closes modal
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Settings modal" })).not.toBeInTheDocument();
  });
});
