import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../state/store";
import { alternativesBody, jsonResponse } from "./fixtures";
import { RoutePlanner } from "./planner";
import { RouteBuilderPanel } from "./RouteBuilderPanel";
import { useRouteBuilderStore } from "./routeBuilderStore";

const S = () => useRouteBuilderStore.getState();
type FetchFn = typeof fetch;

function setup(fetchImpl: FetchFn) {
  const planner = new RoutePlanner({ fetchImpl, debounceMs: 20, getUtc: () => "2026-11-14T15:30:00Z" });
  const utils = render(<RouteBuilderPanel planner={planner} />);
  return { planner, ...utils };
}

beforeEach(() => {
  S().reset();
  useAppStore.setState({ routes: [], selectedRouteId: null, waypoints: [] });
});

describe("RouteBuilderPanel", () => {
  it("explains what to do when there are no points and disables planning", () => {
    setup(vi.fn() as unknown as FetchFn);
    expect(screen.getByText(/No points yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plan routes/i })).toBeDisabled();
  });

  it("toggles planning mode", () => {
    setup(vi.fn() as unknown as FetchFn);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(S().active).toBe(true);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("lists the points, plans four alternatives and shows verdicts and the explanation", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(alternativesBody()));
    setup(fetchImpl as unknown as FetchFn);
    act(() => {
      S().addPointAt(-4.7, 137.4);
      S().addPointAt(-4.65, 137.35);
    });
    expect(within(screen.getByRole("list", { name: "Route points" })).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Plan routes/i }));
    const group = await screen.findByRole("group", { name: "Route alternatives" });
    const cards = within(group).getAllByRole("button");
    expect(cards).toHaveLength(4);
    expect(within(group).getByText("CAUTION")).toBeInTheDocument();
    expect(within(group).getAllByText("READY").length).toBeGreaterThan(0);
    expect(screen.getByText("Why this route")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Limiting factor/i })).toBeInTheDocument();

    // BALANCED is preselected, a click on SAFEST moves the shared selection (map and charts follow it)
    expect(useAppStore.getState().selectedRouteId).toBe("r-balanced");
    fireEvent.click(within(group).getByRole("button", { name: /SAFEST/ }));
    expect(useAppStore.getState().selectedRouteId).toBe("r-safest");
  });

  it("shows a readable error with a retry button when the service is unreachable", async () => {
    let up = false;
    const fetchImpl = vi.fn(async () => {
      if (!up) throw new TypeError("Failed to fetch");
      return jsonResponse(alternativesBody());
    });
    setup(fetchImpl as unknown as FetchFn);
    act(() => {
      S().addPointAt(-4.7, 137.4);
      S().addPointAt(-4.65, 137.35);
    });
    fireEvent.click(screen.getByRole("button", { name: /Plan routes/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Cannot reach the route service/i);

    up = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await screen.findByRole("group", { name: "Route alternatives" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows NO_ROUTE without a retry button", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: "NO_ROUTE", message: "No feasible route: cliff. Try other points." }, 422));
    setup(fetchImpl as unknown as FetchFn);
    act(() => {
      S().addPointAt(-4.7, 137.4);
      S().addPointAt(-4.65, 137.35);
    });
    fireEvent.click(screen.getByRole("button", { name: /Plan routes/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No walkable route");
    expect(within(alert).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("re-plans by itself after an edit once a plan exists", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(alternativesBody()));
    setup(fetchImpl as unknown as FetchFn);
    act(() => {
      S().addPointAt(-4.7, 137.4);
      S().addPointAt(-4.65, 137.35);
    });
    fireEvent.click(screen.getByRole("button", { name: /Plan routes/i }));
    await screen.findByRole("group", { name: "Route alternatives" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    act(() => {
      S().addPointAt(-4.6, 137.3);
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  });

  it("keyboard: Enter plans, Z undoes, Esc leaves planning mode", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(alternativesBody()));
    setup(fetchImpl as unknown as FetchFn);
    act(() => {
      S().setActive(true);
      S().addPointAt(-4.7, 137.4);
      S().addPointAt(-4.65, 137.35);
    });
    fireEvent.keyDown(window, { key: "Enter" });
    await screen.findByRole("group", { name: "Route alternatives" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "z" });
    expect(S().points).toHaveLength(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(S().active).toBe(false);
  });

  it("removes a point from the list and keeps the others", () => {
    setup(vi.fn() as unknown as FetchFn);
    act(() => {
      S().addPointAt(-4.7, 137.4);
      S().addPointAt(-4.65, 137.35);
      S().addPointAt(-4.6, 137.3);
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove point 2" }));
    expect(S().points).toHaveLength(2);
    expect(S().points.map((p) => p.role)).toEqual(["start", "goal"]);
  });
});
