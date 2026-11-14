import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconButton } from "./IconButton";
import { CompassIcon } from "./Icons";

describe("IconButton", () => {
  it("renders with accessible label and icon", () => {
    render(
      <IconButton
        icon={<CompassIcon data-testid="compass-icon" />}
        label="Orient North"
      />
    );
    const button = screen.getByRole("button", { name: "Orient North" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("title", "Orient North");
    expect(screen.getByTestId("compass-icon")).toBeInTheDocument();
  });

  it("triggers onClick when clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(
      <IconButton
        icon={<CompassIcon />}
        label="Click Me"
        onClick={handleClick}
      />
    );
    await user.click(screen.getByRole("button", { name: "Click Me" }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("supports spacesuit glove size (64px target)", () => {
    render(
      <IconButton
        size="glove"
        variant="primary"
        icon={<CompassIcon />}
        label="Glove Target"
      />
    );
    const button = screen.getByRole("button", { name: "Glove Target" });
    expect(button).toHaveClass("icon-button--glove");
    expect(button).toHaveClass("icon-button--primary");
  });

  it("does not trigger onClick when disabled", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(
      <IconButton
        disabled
        icon={<CompassIcon />}
        label="Disabled Button"
        onClick={handleClick}
      />
    );
    const button = screen.getByRole("button", { name: "Disabled Button" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
