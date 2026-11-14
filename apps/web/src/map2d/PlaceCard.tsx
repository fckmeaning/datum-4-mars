import type { Place } from "../api/client";
import { useAppStore } from "../state/store";

interface PlaceCardProps {
  place: Place;
  onClose: () => void;
  onRouteFrom?: (place: Place) => void;
  onRouteTo?: (place: Place) => void;
}

export function PlaceCard({ place, onClose, onRouteFrom, onRouteTo }: PlaceCardProps) {
  const waypoints = useAppStore((s) => s.waypoints);
  const setWaypoints = useAppStore((s) => s.setWaypoints);
  const setDirectionsOpen = useAppStore((s) => s.setDirectionsOpen);

  const handleRouteFrom = () => {
    if (onRouteFrom) {
      onRouteFrom(place);
    } else {
      const updated = [...waypoints];
      updated[0] = {
        role: "start",
        dwell_min: 0,
        place_id: place.id,
        lat: place.lat,
        lon: place.lon,
      };
      setWaypoints(updated);
      setDirectionsOpen(true);
      onClose();
    }
  };

  const handleRouteTo = () => {
    if (onRouteTo) {
      onRouteTo(place);
    } else {
      const updated = [...waypoints];
      const lastIndex = Math.max(1, updated.length - 1);
      updated[lastIndex] = {
        role: "goal",
        dwell_min: 0,
        place_id: place.id,
        lat: place.lat,
        lon: place.lon,
      };
      setWaypoints(updated);
      setDirectionsOpen(true);
      onClose();
    }
  };

  return (
    <div
      style={{
        background: "var(--color-surface, rgba(16, 24, 38, 0.94))",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "var(--radius-lg, 14px)",
        overflow: "hidden",
        color: "#E6EDF3",
        boxShadow: "0 16px 40px rgba(0,0,0,0.65)",
        width: "100%",
        maxWidth: "360px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Rover POV Image / Preview Slot */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "160px",
          backgroundColor: "#1F1512",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {place.pov_image?.url ? (
          <img
            src={place.pov_image.url}
            alt={place.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(180deg, #1f110c 0%, #3d1c13 50%, #682c1a 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#C9D1D9",
              padding: "16px",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "28px", marginBottom: "4px" }}>📷</span>
            <span style={{ fontSize: "12px", color: "#E3B341", fontWeight: 600 }}>Curiosity Rover POV</span>
            <span style={{ fontSize: "11px", color: "#8B949E" }}>Mastcam / Hazcam Context</span>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "rgba(0,0,0,0.6)",
            border: "none",
            borderRadius: "50%",
            width: "28px",
            height: "28px",
            color: "#FFFFFF",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>

        <div
          style={{
            position: "absolute",
            bottom: "6px",
            left: "8px",
            fontSize: "10px",
            color: "#FFFFFF",
            background: "rgba(0,0,0,0.7)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {place.source}
        </div>
      </div>

      {/* Place Details */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>{place.name}</h3>
            <span
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: "4px",
                background: place.kind === "base" ? "#56B4E9" : place.science_target ? "#CC79A7" : "#30363D",
                color: place.kind === "base" ? "#080C10" : "#FFFFFF",
                fontWeight: 700,
              }}
            >
              {place.kind}
            </span>
          </div>

          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              color: "var(--color-accent, #56B4E9)",
              marginTop: "4px",
            }}
          >
            {place.lat.toFixed(4)}° S, {place.lon.toFixed(4)}° E
          </div>
        </div>

        {place.description && (
          <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5", color: "#C9D1D9" }}>
            {place.description}
          </p>
        )}

        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          <button
            onClick={handleRouteFrom}
            style={{
              flex: 1,
              padding: "8px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px",
              color: "#FFFFFF",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Route from here
          </button>
          <button
            onClick={handleRouteTo}
            style={{
              flex: 1,
              padding: "8px",
              background: "var(--color-accent, #56B4E9)",
              border: "none",
              borderRadius: "8px",
              color: "#080C10",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Route to here
          </button>
        </div>
      </div>
    </div>
  );
}
