import { useState, useEffect, type ReactElement } from "react";
import { useAppStore, type Waypoint } from "../state/store";
import { apiClient, type AlternativesResult, type Place, ApiError } from "../api/client";
import { RouteCard } from "../ui/RouteCard";
import { Button, Chip, Panel, PanelSection, Skeleton } from "../ui/Panel";
import { DirectionsIcon, InfoIcon, PlusIcon, RouteIcon, WarningIcon, ChevronDownIcon } from "../icons";
import { VERDICT_LABEL } from "../ui/format";
import { summariseLimitingFactors } from "./routeSummary";
import "./DirectionsPanel.css";

interface DirectionsPanelProps {
  places: Place[];
  onClose: () => void;
}

/** Seconds since `active` became true (0 when inactive); drives the "first run is slow" hint. */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

function stopLabel(index: number, count: number): string {
  if (index === 0) return "From";
  if (index === count - 1) return "To";
  return `Via ${index}`;
}

function stopMarker(index: number, count: number): string {
  if (index === 0) return "A";
  if (index === count - 1) return "B";
  return String(index);
}

export function DirectionsPanel({ places, onClose }: DirectionsPanelProps) {
  const siteId = useAppStore((s) => s.siteId);
  const waypoints = useAppStore((s) => s.waypoints);
  const setWaypoints = useAppStore((s) => s.setWaypoints);
  const routes = useAppStore((s) => s.routes);
  const setRoutes = useAppStore((s) => s.setRoutes);
  const selectedRouteId = useAppStore((s) => s.selectedRouteId);
  const setSelectedRouteId = useAppStore((s) => s.setSelectedRouteId);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const elapsed = useElapsedSeconds(loading);

  // Ensure From defaults to base place and To defaults to destination place
  useEffect(() => {
    if (places.length === 0) return;
    const basePlace = places.find((p) => p.kind === "base") || places[0];
    const destinationPlace = places.find((p) => p.id === "yellowknife") || places[1] || basePlace;

    if (waypoints.length < 2 && basePlace && destinationPlace) {
      setWaypoints([
        { role: "start", dwell_min: 0, place_id: basePlace.id, lat: basePlace.lat, lon: basePlace.lon },
        { role: "goal", dwell_min: 0, place_id: destinationPlace.id, lat: destinationPlace.lat, lon: destinationPlace.lon },
      ]);
    }
  }, [places]);

  // Compute alternative routes
  const handleCalculateRoutes = async () => {
    if (waypoints.length < 2) {
      setErrorMessage("Please define at least a start point and destination.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const res: AlternativesResult = await apiClient.routeAlternatives({
        site_id: siteId,
        waypoints,
        profiles: ["FASTEST", "SAFEST", "BALANCED", "SCIENCE"],
        algorithm: "astar",
        optimize_order: false,
        return_to_start: false,
      });

      setRoutes(res.routes);
      if (res.routes[0]) {
        setSelectedRouteId(res.routes[0].route_id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Failed to calculate routes");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateWaypoint = (index: number, placeId: string) => {
    const selectedPlace = places.find((p) => p.id === placeId);
    if (!selectedPlace) return;

    const updated = [...waypoints];
    const existing = updated[index];
    if (existing) {
      updated[index] = { ...existing, place_id: selectedPlace.id, lat: selectedPlace.lat, lon: selectedPlace.lon };
      setWaypoints(updated);
    }
  };

  const handleAddStop = () => {
    const defaultStop = places.find((p) => p.id === "yellowknife") || places[0];
    if (defaultStop) {
      const updated: Waypoint[] = [
        ...waypoints.slice(0, -1),
        { role: "via", dwell_min: 10, place_id: defaultStop.id, lat: defaultStop.lat, lon: defaultStop.lon },
        waypoints[waypoints.length - 1] ?? { role: "goal", dwell_min: 0, lat: -4.755, lon: 137.382 },
      ];
      setWaypoints(updated);
    }
  };

  // Find violations in selected route
  const activeRoute = routes.find((r) => r.route_id === selectedRouteId) ?? routes[0];
  const violations = activeRoute?.feasibility?.violations ?? [];
  const factors = activeRoute ? summariseLimitingFactors(activeRoute.segments ?? []) : [];

  let results: ReactElement | null = null;
  if (loading && routes.length === 0) {
    results = (
      <div className="dir__skeletons" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="dir__skeleton-card">
            <Skeleton width="38%" height={16} />
            <Skeleton width="100%" height={12} />
            <Skeleton width="72%" height={12} />
          </div>
        ))}
      </div>
    );
  } else if (routes.length > 0) {
    results = (
      <PanelSection title="Alternatives" aside={routes.length}>
        <div className="dir__routes">
          {routes.map((route) => (
            <RouteCard key={route.route_id} route={route} selected={selectedRouteId === route.route_id} onSelect={(id) => setSelectedRouteId(id)} />
          ))}
        </div>

        {activeRoute ? (
          <details className="dir__why">
            <summary>
              <span>Why this route</span>
              <ChevronDownIcon size={16} />
            </summary>
            <div className="dir__why-body">
              {activeRoute.verdict ? (
                <p className="dir__why-verdict">
                  <strong>{VERDICT_LABEL[activeRoute.verdict.call]}.</strong>{" "}
                  {activeRoute.verdict.reasons.length > 0 ? activeRoute.verdict.reasons.join(" ") : "Every margin is inside its limit."}
                </p>
              ) : null}
              {factors.length > 0 ? (
                <ul className="dir__factors" aria-label="What limits this route, by share of walking time">
                  {factors.map((f) => (
                    <li key={f.factor}>
                      <span className="dir__factor-label">{f.label}</span>
                      <span className="dir__factor-bar" aria-hidden="true">
                        <span style={{ width: `${Math.round(f.share * 100)}%` }} />
                      </span>
                      <span className="dir__factor-value u-num">{Math.round(f.share * 100)}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dir__muted">No per-segment breakdown for this route.</p>
              )}
              <div className="dir__chips">
                {activeRoute.data_levels.map((lv) => (
                  <Chip key={lv} tone="slate" title="Terrain data level used">
                    {lv}
                  </Chip>
                ))}
                {activeRoute.simulated_inputs.length > 0 ? (
                  <Chip tone="warning" title={`Simulated inputs: ${activeRoute.simulated_inputs.join(", ")}`}>
                    SIMULATED INPUTS
                  </Chip>
                ) : null}
              </div>
            </div>
          </details>
        ) : null}
      </PanelSection>
    );
  } else if (!loading) {
    results = (
      <p className="dir__hint">
        <InfoIcon size={16} />
        <span>Pick a start and a destination, then calculate four alternatives: fastest, safest, balanced and science.</span>
      </p>
    );
  }

  return (
    <Panel label="Directions and alternatives panel" className="dir" icon={<DirectionsIcon size={20} />} title="Directions" subtitle="Fastest, safest, balanced and science routes" onClose={onClose}>
      <ol className="dir__stops">
        {waypoints.map((wp, idx) => {
          const label = stopLabel(idx, waypoints.length);
          return (
            <li key={idx} className="dir__stop">
              <span className="dir__marker u-num" aria-hidden="true">
                {stopMarker(idx, waypoints.length)}
              </span>
              <label className="dir__field">
                <span className="dir__field-label u-caps">{label}</span>
                <span className="dir__select-wrap">
                  <select className="dir__select" value={wp.place_id ?? ""} onChange={(e) => handleUpdateWaypoint(idx, e.target.value)} aria-label={`${label} place`}>
                    {wp.place_id ? null : <option value="">Custom point</option>}
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.kind})
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon size={16} className="dir__select-caret" />
                </span>
              </label>
            </li>
          );
        })}
      </ol>

      <Button variant="ghost" icon={<PlusIcon size={16} />} onClick={handleAddStop} className="dir__add">
        Add stop
      </Button>

      <Button variant="primary" block loading={loading} icon={<RouteIcon size={16} />} onClick={handleCalculateRoutes}>
        {loading ? "Calculating…" : "Calculate Alternatives"}
      </Button>

      {loading && elapsed >= 6 ? (
        <p className="dir__hint" role="status">
          <InfoIcon size={16} />
          <span>The first calculation compiles the math kernels and can take up to 30 s ({elapsed} s so far). Later ones take a few seconds.</span>
        </p>
      ) : null}

      {errorMessage ? (
        <div className="dir__alert dir__alert--danger" role="alert">
          <WarningIcon size={16} />
          <div>
            <p className="dir__alert-title">Routing request failed</p>
            <p className="dir__alert-text">{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {violations.length > 0 ? (
        <div className="dir__alert dir__alert--warning" role="status">
          <WarningIcon size={16} />
          <div>
            <p className="dir__alert-title">Route feasibility warning</p>
            <p className="dir__alert-text">{violations.map((v) => `${v.kind}: ${v.message}`).join("; ")}</p>
          </div>
        </div>
      ) : null}

      {results}
    </Panel>
  );
}
