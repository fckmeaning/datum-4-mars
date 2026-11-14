import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel, DEFAULT_SETTINGS } from "./SettingsPanel";

describe("SettingsPanel", () => {
  it("renders metric units, language select, 3D vertical exaggeration slider, and astronaut fields", () => {
    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: /Settings/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Units")).toHaveValue("metric");
    expect(screen.getByLabelText("Language")).toHaveValue("en");
    expect(screen.getByLabelText("3D Vertical Exaggeration")).toHaveValue("1.5");
    expect(screen.getByLabelText("Astronaut Body Mass")).toHaveValue(80);
    expect(screen.getByLabelText("Suit Mass (Apollo-class)")).toHaveValue(90);
    expect(screen.getByLabelText("Nominal Flat Speed")).toHaveValue(1.0);
  });

  it("triggers onUpdate when changing language or vertical exaggeration", async () => {
    const handleUpdate = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onUpdate={handleUpdate}
      />
    );

    const langSelect = screen.getByLabelText("Language");
    await user.selectOptions(langSelect, "ru");
    expect(handleUpdate).toHaveBeenCalledWith({ language: "ru" });

    const slider = screen.getByLabelText("3D Vertical Exaggeration");
    fireEvent.change(slider, { target: { value: "2.5" } });
    expect(handleUpdate).toHaveBeenCalledWith({ verticalExaggeration: 2.5 });
  });

  it("triggers onUpdateAstronaut when changing astronaut numeric inputs", () => {
    const handleUpdateAstronaut = vi.fn();

    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onUpdateAstronaut={handleUpdateAstronaut}
      />
    );

    const massInput = screen.getByLabelText("Astronaut Body Mass");
    fireEvent.change(massInput, { target: { value: "85" } });
    expect(handleUpdateAstronaut).toHaveBeenCalledWith({ mass_astronaut_kg: 85 });
  });

  it("handles reset button click", async () => {
    const handleReset = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onReset={handleReset}
      />
    );

    const resetBtn = screen.getByRole("button", { name: "Reset to Defaults" });
    await user.click(resetBtn);
    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});
