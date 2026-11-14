import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CommandPalette, ShortcutsOverlay } from "./CommandPalette";
import { PaletteHost } from "./PaletteHost";
import { buildCommands, filterCommands, matchScore, type CommandContext } from "./commands";
import { onSiteViewRequest, requestSiteView, isSiteView, SITE_VIEWS, type SiteView } from "../sites/viewBus";

afterEach(() => {
  document.documentElement.removeAttribute("data-accent");
  window.localStorage.clear();
});

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  return { siteId: null, go: vi.fn(), view: vi.fn(), startTour: vi.fn(), setAccent: vi.fn(), showShortcuts: vi.fn(), copyLink: vi.fn(), ...over };
}

describe("view bus", () => {
  it("delivers a view request to the listener and stops after unsubscribe", () => {
    const got: SiteView[] = [];
    const off = onSiteViewRequest((v) => got.push(v));
    requestSiteView("sky");
    off();
    requestSiteView("mission");
    expect(got).toEqual(["sky"]);
  });
  it("knows the six views", () => {
    expect(SITE_VIEWS).toEqual(["2d", "3d", "fpv", "sky", "profile", "mission"]);
    expect(isSiteView("sky")).toBe(true);
    expect(isSiteView("nope")).toBe(false);
    expect(isSiteView(null)).toBe(false);
  });
});

describe("matching", () => {
  it("ranks a title prefix above a keyword and finds subsequences", () => {
    const gale = { title: "Open Gale Crater", keywords: "Bradbury Landing Curiosity" };
    expect(matchScore("open", gale)).toBeGreaterThan(matchScore("bradbury", gale)!);
    expect(matchScore("curi", gale)).not.toBeNull();
    expect(matchScore("glcr", gale)).not.toBeNull(); // subsequence
    expect(matchScore("zzz", gale)).toBeNull();
    expect(matchScore("gale zzz", gale)).toBeNull(); // every word must match
    expect(matchScore("", gale)).toBe(0);
  });
  it("filters and keeps the original order for an empty query", () => {
    const all = buildCommands(ctx());
    expect(filterCommands(all, "")).toBe(all);
    const hits = filterCommands(all, "jezero");
    expect(hits.length).toBeGreaterThanOrEqual(4); // the site and its three data views
    expect(hits[0]!.id).toBe("site:jezero");
    expect(filterCommands(all, "compare")[0]!.id).toBe("page:compare");
  });
});

describe("commands", () => {
  it("has every site, every view, the pages, the tour and the accents", () => {
    const all = buildCommands(ctx());
    const ids = all.map((c) => c.id);
    for (const s of ["gale", "jezero", "meridiani", "gusev", "elysium", "chryse", "utopia", "ares"]) expect(ids).toContain(`site:${s}`);
    for (const v of SITE_VIEWS) expect(ids).toContain(`view:${v}`);
    for (const id of ["page:globe", "page:compare", "page:methods", "page:about", "act:tour", "act:keys", "act:link", "accent:teal", "accent:ice"]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("runs a site command as navigation", () => {
    const c = ctx();
    buildCommands(c).find((x) => x.id === "site:ares")!.run();
    expect(c.go).toHaveBeenCalledWith("/site/ares");
    buildCommands(c).find((x) => x.id === "site:gusev:sky")!.run();
    expect(c.go).toHaveBeenCalledWith("/site/gusev?view=sky");
  });
  it("on a site page a view command switches the tab, elsewhere it opens Gale on that tab", () => {
    const on = ctx({ siteId: "jezero" });
    buildCommands(on).find((x) => x.id === "view:profile")!.run();
    expect(on.view).toHaveBeenCalledWith("profile");
    expect(on.go).not.toHaveBeenCalled();
    const off = ctx();
    buildCommands(off).find((x) => x.id === "view:mission")!.run();
    expect(off.go).toHaveBeenCalledWith("/site/gale?view=mission");
    expect(buildCommands(on).find((x) => x.id === "view:sky")!.hint).toBe("4");
  });
});

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    render(<CommandPalette open={false} onClose={() => undefined} commands={buildCommands(ctx())} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("filters while typing, moves with the arrows and runs the selected command on Enter, then closes", () => {
    const c = ctx();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={buildCommands(c)} />);
    const input = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(input, { target: { value: "elysium" } });
    const options = screen.getAllByRole("option");
    expect(options[0]!.textContent).toMatch(/Open Elysium Planitia/);
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(c.go).toHaveBeenCalledWith("/site/elysium");
    expect(onClose).toHaveBeenCalled();
  });
  it("runs a command on click and says when nothing matches", () => {
    const c = ctx();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={buildCommands(c)} />);
    fireEvent.click(screen.getByText("Compare all sites"));
    expect(c.go).toHaveBeenCalledWith("/compare");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "qqqqq" } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" }); // nothing selected: no crash, no run
    expect(c.go).toHaveBeenCalledTimes(1);
  });
  it("closes on Escape and on a click outside", () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={buildCommands(ctx())} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("palette-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ShortcutsOverlay", () => {
  it("lists the shortcuts and closes on Escape", () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" }).textContent).toMatch(/Ctrl K/);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}
function host(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PaletteHost />
      <Where />
    </MemoryRouter>,
  );
}

describe("PaletteHost", () => {
  it("opens with Ctrl+K, jumps to a site with Enter and closes", () => {
    host("/globe");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "gusev" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(screen.getByTestId("where").textContent).toBe("/site/gusev");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("also opens from the chip and with the Meta key, and toggles shut", () => {
    host("/");
    fireEvent.click(screen.getByTestId("palette-chip"));
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "K", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("? shows the shortcuts, but not while typing in a field", () => {
    host("/globe");
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.queryByRole("dialog")).toBeNull();
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    fireEvent.keyDown(field, { key: "?" });
    expect(screen.queryByRole("dialog")).toBeNull();
    field.remove();
  });
  it("digits switch the tab on a site page and do nothing elsewhere", () => {
    const got: SiteView[] = [];
    const off = onSiteViewRequest((v) => got.push(v));
    const a = host("/site/gale");
    fireEvent.keyDown(window, { key: "4" });
    fireEvent.keyDown(window, { key: "6" });
    fireEvent.keyDown(window, { key: "9" }); // there is no ninth view
    a.unmount();
    host("/globe");
    fireEvent.keyDown(window, { key: "5" });
    off();
    expect(got).toEqual(["sky", "mission"]);
  });
  it("a view command on a site page asks the page for that tab", () => {
    const got: SiteView[] = [];
    const off = onSiteViewRequest((v) => got.push(v));
    host("/site/jezero?view=2d");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "route profile" } });
    act(() => {
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    });
    off();
    expect(got).toEqual(["profile"]);
    expect(screen.getByTestId("where").textContent).toBe("/site/jezero?view=2d"); // the page itself does the switching
  });
  it("the link command copies the address of the page", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    host("/site/gale?view=sky");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "copy link" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String((writeText.mock.calls as unknown[][])[0]![0])).toMatch(/^https?:\/\//);
  });
  it("the accent command changes the accent of the page", () => {
    host("/globe");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "accent ice" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(document.documentElement.dataset["accent"]).toBe("ice");
  });
});
