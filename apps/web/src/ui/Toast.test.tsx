import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders title, message, and severity styling", () => {
    render(
      <Toast
        id="test-1"
        title="Weather Alert"
        message="Dust storm warning"
        severity="warning"
      />
    );

    expect(screen.getByText("Weather Alert")).toBeInTheDocument();
    expect(screen.getByText("Dust storm warning")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("toast--warning");
  });

  it("handles action and dismiss button clicks", async () => {
    const handleDismiss = vi.fn();
    const handleAction = vi.fn();
    const user = userEvent.setup();

    render(
      <Toast
        id="toast-sep"
        message="Radiation spike detected"
        severity="danger"
        action={{ label: "Reroute", onClick: handleAction }}
        onDismiss={handleDismiss}
      />
    );

    const actionBtn = screen.getByRole("button", { name: "Reroute" });
    await user.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);

    const dismissBtn = screen.getByRole("button", { name: "Dismiss notification" });
    await user.click(dismissBtn);
    expect(handleDismiss).toHaveBeenCalledWith("toast-sep");
  });
});
