import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBox } from "./SearchBox";

const MOCK_SUGGESTIONS = [
  { id: "1", title: "Bradbury Landing", subtitle: "Habitat", kind: "base" },
  { id: "2", title: "Boxwork Outcrop", subtitle: "Science Goal", kind: "science" },
];

describe("SearchBox", () => {
  it("renders input with placeholder and search icon", () => {
    render(<SearchBox placeholder="Search Gale Crater..." />);
    const input = screen.getByRole("combobox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "Search Gale Crater...");
  });

  it("handles text input, displays clear button, and clears query", async () => {
    const handleChange = vi.fn();
    const handleClear = vi.fn();
    const user = userEvent.setup();

    render(
      <SearchBox
        onChange={handleChange}
        onClear={handleClear}
      />
    );
    const input = screen.getByRole("combobox");
    await user.type(input, "Mount Sharp");

    expect(handleChange).toHaveBeenCalled();
    expect(input).toHaveValue("Mount Sharp");

    const clearBtn = screen.getByRole("button", { name: "Clear search" });
    expect(clearBtn).toBeInTheDocument();

    await user.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("");
  });

  it("navigates suggestions with keyboard and selects", async () => {
    const handleSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <SearchBox
        suggestions={MOCK_SUGGESTIONS}
        onSelectSuggestion={handleSelect}
      />
    );
    const input = screen.getByRole("combobox");
    await user.click(input);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Bradbury Landing")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(handleSelect).toHaveBeenCalledWith(MOCK_SUGGESTIONS[0]);
  });
});
