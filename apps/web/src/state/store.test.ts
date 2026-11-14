import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./store";

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState({
      mode: "2d",
      siteId: "gale",
      level: "L0",
      layers: {
        elevation: { visible: true, opacity: 1.0 },
      },
      waypoints: [{ role: "start", dwell_min: 0, lat: -4.5895, lon: 137.4417 }],
      routes: [],
      selectedRouteId: null,
      poiOpen: false,
      selectedPlaceId: null,
      directionsOpen: false,
      flyTo: null,
    });
  });

  it("updates mode and siteId", () => {
    useAppStore.getState().setMode("3d");
    expect(useAppStore.getState().mode).toBe("3d");

    useAppStore.getState().setSiteId("jezero");
    expect(useAppStore.getState().siteId).toBe("jezero");
  });

  it("manages layer visibility and opacity", () => {
    useAppStore.getState().setLayerState("elevation", { visible: false, opacity: 0.5 });
    const layer = useAppStore.getState().layers["elevation"];
    expect(layer?.visible).toBe(false);
    expect(layer?.opacity).toBe(0.5);

    // Partial update
    useAppStore.getState().setLayerState("elevation", { visible: true });
    expect(useAppStore.getState().layers["elevation"]?.visible).toBe(true);
    expect(useAppStore.getState().layers["elevation"]?.opacity).toBe(0.5);
  });

  it("adds and removes waypoints", () => {
    expect(useAppStore.getState().waypoints.length).toBe(1);

    useAppStore.getState().addWaypoint({
      role: "goal",
      dwell_min: 15,
      lat: -4.7550,
      lon: 137.3820,
    });
    expect(useAppStore.getState().waypoints.length).toBe(2);
    expect(useAppStore.getState().waypoints[1]?.role).toBe("goal");

    useAppStore.getState().removeWaypoint(0);
    expect(useAppStore.getState().waypoints.length).toBe(1);
    expect(useAppStore.getState().waypoints[0]?.role).toBe("goal");
  });

  it("triggers flyTo animation with sequential nonces", () => {
    useAppStore.getState().triggerFlyTo({ lat: -4.72, lon: 137.40 }, 14);
    const fly1 = useAppStore.getState().flyTo;
    expect(fly1).not.toBeNull();
    expect(fly1?.target).toEqual({ lat: -4.72, lon: 137.40 });
    expect(fly1?.zoomHint).toBe(14);
    const nonce1 = fly1?.nonce;

    useAppStore.getState().triggerFlyTo({ lat: -4.72, lon: 137.40 }, 14);
    const fly2 = useAppStore.getState().flyTo;
    expect(fly2?.nonce).toBeGreaterThan(nonce1!);

    useAppStore.getState().clearFlyTo();
    expect(useAppStore.getState().flyTo).toBeNull();
  });

  it("toggles POI, directions, and place selection", () => {
    useAppStore.getState().setPoiOpen(true);
    expect(useAppStore.getState().poiOpen).toBe(true);

    useAppStore.getState().setDirectionsOpen(true);
    expect(useAppStore.getState().directionsOpen).toBe(true);

    useAppStore.getState().setSelectedPlaceId("boxwork");
    expect(useAppStore.getState().selectedPlaceId).toBe("boxwork");
  });
});
