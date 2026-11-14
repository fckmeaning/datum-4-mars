import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GlobeScreen } from "../pages/GlobeScreen";
import { useAppStore } from "../state/store";
import { DEFAULT_LANDING_SITES } from "../globe/landingSites";

// the WebGL globe cannot run in jsdom
vi.mock("../globe/MarsGlobe", () => ({
  MarsGlobe: () => <div data-testid="mars-globe-mock" />,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderScreen(url = "/globe") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <GlobeScreen />
    </MemoryRouter>,
  );
}

const screenRoot = () => document.querySelector(".globe-screen") as HTMLElement;

beforeEach(() => {
  mockNavigate.mockClear();
  window.localStorage.clear();
  useAppStore.setState({ viewMode: "globe", autopilotRunning: false, autopilotStep: null, autopilotCaption: null });
});
afterEach(() => {
  window.localStorage.clear();
});

describe("globe <-> flat map switch", () => {
  it("opens on the globe and offers the flat map", () => {
    renderScreen();
    expect(screenRoot().dataset.view).toBe("globe");
    expect(screen.queryByTestId("flat-map")).toBeNull();
    const tile = screen.getByTestId("view-switch");
    expect(tile.dataset.next).toBe("flat");
    expect(tile).toHaveAccessibleName(/flat map/i);
  });

  it("the tile switches to the flat map and back, remembers the choice, and keeps the store in step", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("view-switch"));
    expect(screen.getByTestId("flat-map")).toBeInTheDocument();
    expect(screenRoot().dataset.view).toBe("flat");
    expect(useAppStore.getState().viewMode).toBe("flat");
    expect(window.localStorage.getItem("d4-view")).toBe("flat");
    expect(screen.getByTestId("view-switch").dataset.next).toBe("globe");
    expect(document.querySelector(".view-layer--flat")?.getAttribute("data-active")).toBe("1");
    expect(document.querySelector(".view-layer--globe")?.getAttribute("data-active")).toBe("0");

    fireEvent.click(screen.getByTestId("view-switch"));
    expect(screenRoot().dataset.view).toBe("globe");
    expect(useAppStore.getState().viewMode).toBe("globe");
    expect(window.localStorage.getItem("d4-view")).toBe("globe");
    expect(document.querySelector(".view-layer--globe")?.getAttribute("data-active")).toBe("1");
    // the flat map is taken down once the crossfade is over
    await waitFor(() => expect(screen.queryByTestId("flat-map")).toBeNull(), { timeout: 2000 });
  });

  it("the key M toggles, but not while typing", () => {
    renderScreen();
    fireEvent.keyDown(window, { key: "m" });
    expect(screenRoot().dataset.view).toBe("flat");
    fireEvent.keyDown(window, { key: "M" });
    expect(screenRoot().dataset.view).toBe("globe");

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "m" });
    expect(screenRoot().dataset.view).toBe("globe");
    fireEvent.keyDown(window, { key: "m", ctrlKey: true });
    expect(screenRoot().dataset.view).toBe("globe");
    input.remove();
  });

  it("/globe?view=flat opens the flat map", () => {
    renderScreen("/globe?view=flat");
    expect(screen.getByTestId("flat-map")).toBeInTheDocument();
    expect(screenRoot().dataset.view).toBe("flat");
  });

  it("the remembered choice opens the flat map, and ?view=globe overrides it", () => {
    window.localStorage.setItem("d4-view", "flat");
    const first = renderScreen();
    expect(screenRoot().dataset.view).toBe("flat");
    first.unmount();
    useAppStore.setState({ viewMode: "globe" });
    renderScreen("/globe?view=globe");
    expect(screenRoot().dataset.view).toBe("globe");
  });

  it("the tour runs on the globe: it forces the globe, hides the tile, and does not overwrite the remembered choice", () => {
    window.localStorage.setItem("d4-view", "flat");
    useAppStore.setState({ autopilotRunning: true });
    renderScreen();
    expect(screenRoot().dataset.view).toBe("globe");
    expect(screen.queryByTestId("view-switch")).toBeNull();
    expect(useAppStore.getState().viewMode).toBe("globe");
    expect(window.localStorage.getItem("d4-view")).toBe("flat");
    fireEvent.keyDown(window, { key: "m" });
    expect(screenRoot().dataset.view).toBe("globe");
  });

  it("starting the tour while on the flat map switches to the globe", async () => {
    renderScreen("/globe?view=flat");
    expect(screenRoot().dataset.view).toBe("flat");
    useAppStore.setState({ autopilotRunning: true });
    await waitFor(() => expect(screenRoot().dataset.view).toBe("globe"));
    expect(useAppStore.getState().viewMode).toBe("globe");
  });

  it("keeps the layers and the selected site across the switch", () => {
    renderScreen();
    useAppStore.getState().setLayerState("thermal", { visible: true });
    useAppStore.getState().setLayerState("zones", { visible: true });
    fireEvent.click(document.querySelectorAll(".site-card")[1]!); // Jezero card in the site deck
    fireEvent.keyDown(window, { key: "m" });
    expect(useAppStore.getState().layers.thermal?.visible).toBe(true);
    expect(useAppStore.getState().layers.zones?.visible).toBe(true);
    const pin = document.querySelector('.flatmap__pin[data-site="jezero"]');
    expect(pin?.className).toContain("flatmap__pin--selected");
    fireEvent.keyDown(window, { key: "m" });
    expect(useAppStore.getState().layers.thermal?.visible).toBe(true);
    expect(document.querySelector(".site-card[data-selected=\"true\"]")?.textContent).toContain("Jezero Crater");
  });
});

describe("mounting", () => {
  it("never updates the store while rendering (React would warn)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderScreen("/globe?view=flat");
    renderScreen("/globe");
    const warned = err.mock.calls.some((c) => String(c[0]).includes("Cannot update a component"));
    err.mockRestore();
    expect(warned).toBe(false);
  });
});

describe("the flat map in the page", () => {
  it("has a pin for every landing site, with the expedition year", () => {
    renderScreen("/globe?view=flat");
    const map = screen.getByTestId("flat-map");
    for (const s of DEFAULT_LANDING_SITES) {
      const pin = map.querySelector(`.flatmap__pin[data-site="${s.id}"]`) as HTMLElement;
      expect(pin, s.id).not.toBeNull();
      expect(within(pin).getAllByText(String(s.year)).length).toBeGreaterThanOrEqual(1);
      expect(within(pin).getAllByText(s.name).length).toBeGreaterThanOrEqual(1);
    }
    expect(map.querySelectorAll(".flatmap__pin")).toHaveLength(DEFAULT_LANDING_SITES.length);
  });

  it("a click on a pin opens that expedition (/site/:id) like a click on the globe does", async () => {
    renderScreen("/globe?view=flat");
    const pin = document.querySelector('.flatmap__pin[data-site="meridiani"]') as HTMLElement;
    fireEvent.click(pin);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/site/meridiani"));
  });

  it("Descend to Gale goes straight to the expedition from the flat map", () => {
    renderScreen("/globe?view=flat");
    fireEvent.click(screen.getByRole("button", { name: /Descend to Gale/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/site/gale");
  });

  it("has zoom buttons and the map is an application region", () => {
    renderScreen("/globe?view=flat");
    expect(screen.getByTestId("flat-zoom-in")).toBeInTheDocument();
    expect(screen.getByTestId("flat-zoom-out")).toBeInTheDocument();
    expect(screen.getByTestId("flat-zoom-fit")).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /flat map of mars/i })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("flat-zoom-in")); // must not throw before the first measurement
  });

  it("falls back to the 2D canvas renderer when WebGL is not there", () => {
    renderScreen("/globe?view=flat");
    expect(screen.getByTestId("flat-map").dataset.renderer).toBe("canvas");
  });
});
