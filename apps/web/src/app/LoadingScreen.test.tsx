import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { LoadingScreen } from "./LoadingScreen";

describe("LoadingScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders brand header and loading indicators", async () => {
    render(<LoadingScreen autoDismissMs={0} />);

    expect(screen.getByText("DATUM-4")).toBeDefined();
    expect(screen.getByText("PLANETARY RECONNAISSANCE SYSTEM")).toBeDefined();
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("calls onComplete when Enter Mission button is clicked", async () => {
    const completeMock = vi.fn();
    render(<LoadingScreen onComplete={completeMock} autoDismissMs={0} />);

    await waitFor(() => {
      const enterBtn = screen.getByRole("button", { name: /ENTER MISSION/i });
      expect(enterBtn).toBeDefined();
      fireEvent.click(enterBtn);
      expect(completeMock).toHaveBeenCalled();
    });
  });
});
