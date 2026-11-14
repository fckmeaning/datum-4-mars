import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "./BottomSheet";

describe("BottomSheet", () => {
  it("renders when open with title and children", () => {
    render(
      <BottomSheet isOpen={true} title="Waypoints List">
        <p>Sheet body content</p>
      </BottomSheet>
    );
    expect(screen.getByText("Waypoints List")).toBeInTheDocument();
    expect(screen.getByText("Sheet body content")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <BottomSheet isOpen={false} title="Waypoints List">
        <p>Sheet body content</p>
      </BottomSheet>
    );
    expect(screen.queryByText("Waypoints List")).not.toBeInTheDocument();
  });

  it("triggers onClose on close button click", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <BottomSheet isOpen={true} title="Waypoints" onClose={handleClose}>
        <p>Content</p>
      </BottomSheet>
    );

    const closeBtn = screen.getByRole("button", { name: "Close sheet" });
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("cycles snap points on handle bar click", async () => {
    const handleSnapChange = vi.fn();
    const user = userEvent.setup();

    render(
      <BottomSheet
        isOpen={true}
        snapPoint="half"
        onSnapChange={handleSnapChange}
      >
        <p>Content</p>
      </BottomSheet>
    );

    const handle = screen.getByRole("button", { name: /Current height: half/i });
    await user.click(handle);
    expect(handleSnapChange).toHaveBeenCalledWith("expanded");
  });
});
