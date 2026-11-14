import { useState } from "react";
import { useAppStore, type Waypoint } from "../state/store";
import { apiClient, type AlternativesResult, type Place } from "../api/client";
import { formatMarsDistance } from "./distance";

interface DirectionsPanelProps {
  places: Place[];
  onClose: () => void;
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
  const [error, setError] = useState<string | null>(null);

  // Compute alternative routes
  const handleCalculateRoutes = async () => {
    if (waypoints.length < 2) {
      setError("Please define at least a start point and destination.");
      return;
    }

    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : "Failed to calculate routes");
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
      updated[index] = {
        ...existing,
        place_id: selectedPlace.id,
        lat: selectedPlace.lat,
        lon: selectedPlace.lon,
      };
      setWaypoints(updated);
    }
  };

  const handleAddStop = () => {
    const defaultStop = places.find((p) => p.id === "yellowknife") || places[0];
    if (defaultStop) {
      const updated: Waypoint[] = [
        ...waypoints.slice(0, -1),
        {
          role: "via",
          dwell_min: 10,
          place_id: defaultStop.id,
          lat: defaultStop.lat,
          lon: defaultStop.lon,
        },
        waypoints[waypoints.length - 1] ?? {
          role: "goal",
          dwell_min: 0,
          lat: -4.755,
          lon: 137.382,
        },
      ];
      setWaypoints(updated);
    }
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  };

  const getProfileColor = (profile: string) => {
    switch (profile) {
      case "FASTEST":
        return "#56B4E9";
      case "SAFEST":
        return "#009E73";
      case "BALANCED":
        return "#E69F00";
      case "SCIENCE":
        return "#CC79A7";
      default:
        return "#56B4E9";
    }
  };

  return (
    <div
      style={{
        background: "var(--color-surface, rgba(16, 24, 38, 0.92))",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "var(--radius-lg, 14px)",
        padding: "20px",
        color: "#E6EDF3",
        boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        maxHeight: "85vh",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🧭</span> Directions & Profiles
        </h2>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#8B949E",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Waypoint inputs */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {waypoints.map((wp, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === waypoints.length - 1;
          const label = isFirst ? "From (Base)" : isLast ? "To (Destination)" : `Stop ${idx}`;

          return (
            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#8B949E", fontWeight: 600 }}>
                {label}
              </span>
              <select
                value={wp.place_id ?? ""}
                onChange={(e) => handleUpdateWaypoint(idx, e.target.value)}
                style={{
                  background: "#21262D",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "#FFFFFF",
                  fontSize: "13px",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.kind})
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        <button
          onClick={handleAddStop}
          style={{
            background: "transparent",
            border: "1px dashed rgba(255,255,255,0.2)",
            borderRadius: "8px",
            color: "#56B4E9",
            padding: "8px",
            fontSize: "13px",
            cursor: "pointer",
            marginTop: "4px",
          }}
        >
          + Add stop
        </button>
      </div>

      <button
        onClick={handleCalculateRoutes}
        disabled={loading}
        style={{
          background: "var(--color-accent, #56B4E9)",
          color: "#080C10",
          border: "none",
          borderRadius: "8px",
          padding: "10px",
          fontWeight: 700,
          fontSize: "14px",
          cursor: loading ? "wait" : "pointer",
          boxShadow: "0 4px 12px rgba(86,180,233,0.3)",
        }}
      >
        {loading ? "Calculating (F05–F09)..." : "Calculate Alternatives"}
      </button>

      {error && (
        <div style={{ color: "#F85149", fontSize: "12px", padding: "8px", background: "rgba(248,81,73,0.1)", borderRadius: "6px" }}>
          {error}
        </div>
      )}

      {/* Alternative Route Cards */}
      {routes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#8B949E", textTransform: "uppercase" }}>
            Route Alternatives ({routes.length})
          </span>

          {routes.map((route) => {
            const isSelected = !selectedRouteId || route.route_id === selectedRouteId;
            const color = getProfileColor(route.profile);

            return (
              <div
                key={route.route_id}
                onClick={() => setSelectedRouteId(route.route_id)}
                style={{
                  background: isSelected ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.02)",
                  border: isSelected ? `2px solid ${color}` : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  opacity: isSelected ? 1.0 : 0.65,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: color,
                      }}
                    />
                    <strong style={{ fontSize: "15px", color: "#FFFFFF" }}>{route.profile}</strong>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: route.totals.risk && route.totals.risk < 0.3 ? "#238636" : "#8957E5",
                      color: "#FFFFFF",
                      fontWeight: 600,
                    }}
                  >
                    {route.totals.risk && route.totals.risk < 0.3 ? "LOW RISK" : "MED RISK"}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                    fontSize: "12px",
                    color: "#C9D1D9",
                  }}
                >
                  <div>
                    ⏱️ <span style={{ fontWeight: 600, color: "#FFFFFF" }}>{formatDuration(route.totals.time_s)}</span>
                  </div>
                  <div>
                    📏 <span>{formatMarsDistance(route.totals.length_m)}</span>
                  </div>
                  <div>
                    ☢️ <span>{(route.totals.dose_mSv * 1000).toFixed(1)} µSv</span>
                  </div>
                  <div>
                    ⛰️ <span>Max {route.totals.max_slope_deg.toFixed(1)}°</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
