import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomBar } from "./BottomBar";
import { AutopilotButton } from "./AutopilotButton";

describe("BottomBar and AutopilotButton", () => {
  it("renders altitude readout and data sources button", async () => {
    const handleOpenSources = vi.fn();
    const user = userEvent.setup();

    render(
      <BottomBar
        altitudeKm={2.4}
        onOpenDataSources={handleOpenSources}
        autopilotRunning={false}
        onToggleAutopilot={vi.fn()}
      />
    );

    expect(screen.getByText("2.4 km")).toBeInTheDocument();
    expect(screen.getByText("DATA SOURCES")).toBeInTheDocument();

    await user.click(screen.getByText("DATA SOURCES"));
    expect(handleOpenSources).toHaveBeenCalledTimes(1);
  });

  it("toggles autopilot state", async () => {
    const handleToggle = vi.fn();
    const user = userEvent.setup();

    render(
      <AutopilotButton
        isRunning={false}
        onToggle={handleToggle}
      />
    );

    const btn = screen.getByRole("switch");
    expect(btn).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("[READY]")).toBeInTheDocument();

    await user.click(btn);
    expect(handleToggle).toHaveBeenCalledWith(true);
  });

  it("has working REC and SOUND buttons", async () => {
    const user = userEvent.setup();
    render(
      <BottomBar
        altitudeKm={1.0}
        onOpenDataSources={vi.fn()}
        autopilotRunning={true}
        onToggleAutopilot={vi.fn()}
      />
    );

    const recBtn = screen.getByRole("button", { name: /record this tab/i });
    const soundBtn = screen.getByRole("button", { name: /sound of mars: on/i }); // on unless switched off
    expect(recBtn).toBeEnabled();
    expect(soundBtn).toBeEnabled();
    expect(soundBtn).toHaveAttribute("aria-pressed", "true");

    await user.click(soundBtn);
    expect(screen.getByRole("button", { name: /sound of mars: off/i })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: /sound of mars: off/i }));
    expect(screen.getByRole("button", { name: /sound of mars: on/i })).toBeInTheDocument();
  });
});
