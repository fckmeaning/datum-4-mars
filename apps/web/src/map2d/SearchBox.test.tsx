import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SearchBox } from "./SearchBox";

describe("SearchBox", () => {
  it("renders input and allows typing", () => {
    const handleSelect = vi.fn();
    render(<SearchBox onSelectPlace={handleSelect} />);

    const input = screen.getByRole("textbox", { name: "Search places" });
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "boxwork" } });
    expect(input).toHaveValue("boxwork");
  });

  it("shows suggestions and triggers onSelectPlace when clicked", async () => {
    const handleSelect = vi.fn();
    render(<SearchBox onSelectPlace={handleSelect} />);

    const input = screen.getByRole("textbox", { name: "Search places" });
    fireEvent.change(input, { target: { value: "box" } });

    await waitFor(() => {
      const option = screen.getByText("Boxwork Outcrops");
      expect(option).toBeInTheDocument();
      fireEvent.click(option);
    });

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Boxwork Outcrops" }),
    );
  });
});
