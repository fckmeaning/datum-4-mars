import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuButton } from "./MenuButton";
import { PlayIcon } from "./Icons";
import { Badge } from "./Badge";

describe("MenuButton", () => {
  it("renders title, subtitle, icon, and badge", () => {
    render(
      <MenuButton
        title="Start Simulation"
        subtitle="Flyby into Gale Crater"
        icon={<PlayIcon data-testid="play-icon" />}
        badge={<Badge variant="LIVE">Ready</Badge>}
        variant="primary"
      />
    );
    expect(screen.getByText("Start Simulation")).toBeInTheDocument();
    expect(screen.getByText("Flyby into Gale Crater")).toBeInTheDocument();
    expect(screen.getByTestId("play-icon")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveClass("menu-button--primary");
  });

  it("handles click and keyboard enter interaction", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(
      <MenuButton
        title="Settings"
        onClick={handleClick}
      />
    );
    const button = screen.getByRole("button", { name: /Settings/i });
    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);

    button.focus();
    await user.keyboard("{Enter}");
    expect(handleClick).toHaveBeenCalledTimes(2);
  });
});
