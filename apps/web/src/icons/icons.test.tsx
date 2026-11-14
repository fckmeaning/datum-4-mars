import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ICONS, Icon, SearchIcon, type IconName } from "./index";

const names = Object.keys(ICONS) as IconName[];

describe("icon set", () => {
  it("has a useful number of icons with unique names", () => {
    expect(names.length).toBeGreaterThanOrEqual(35);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(names)("%s renders a decorative svg by default", (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.hasAttribute("role")).toBe(false);
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.childElementCount).toBeGreaterThan(0);
  });

  it.each(names)("%s is exposed with role=img when titled", (name) => {
    const { container } = render(<Icon name={name} title={`${name} icon`} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe(`${name} icon`);
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
    expect(svg?.querySelector("title")?.textContent).toBe(`${name} icon`);
  });

  it("honours size and passes through attributes", () => {
    const { container } = render(<SearchIcon size={24} className="x" data-testid="s" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("class")).toBe("x");
    expect(svg?.getAttribute("data-testid")).toBe("s");
  });

  it("treats an empty title as decorative", () => {
    const { container } = render(<SearchIcon title="" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
