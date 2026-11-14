import { useMemo } from "react";
import type { Place } from "../api/client";
import { haversineMars, formatMarsDistance } from "./distance";
import { useAppStore } from "../state/store";

interface PoiMenuProps {
  places: Place[];
  basePlace?: Place;
  onSelectPlace: (place: Place) => void;
  onClose: () => void;
}

export function PoiMenu({ places, basePlace, onSelectPlace, onClose }: PoiMenuProps) {
  const triggerFlyTo = useAppStore((s) => s.triggerFlyTo);
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId);

  const baseLat = basePlace?.lat ?? -4.5895;
  const baseLon = basePlace?.lon ?? 137.4417;

  // Group places by kind and compute distance from base
  const groupedPlaces = useMemo(() => {
    const groups: Record<string, (Place & { distFromBaseM: number })[]> = {
      base: [],
      science: [],
      mission_informal: [],
      gazetteer: [],
    };

    for (const p of places) {
      const dist = haversineMars(baseLat, baseLon, p.lat, p.lon);
      const enhanced = { ...p, distFromBaseM: dist };

      if (p.kind === "base") {
        groups.base?.push(enhanced);
      } else if (p.science_target) {
        groups.science?.push(enhanced);
      } else if (p.kind === "mission_informal") {
        groups.mission_informal?.push(enhanced);
      } else {
        groups.gazetteer?.push(enhanced);
      }
    }

    // Sort each group by distance from base
    for (const key of Object.keys(groups)) {
      groups[key]?.sort((a, b) => a.distFromBaseM - b.distFromBaseM);
    }

    return groups;
  }, [places, baseLat, baseLon]);

  const handleItemClick = (place: Place) => {
    triggerFlyTo({ lat: place.lat, lon: place.lon }, 14);
    setSelectedPlaceId(place.id);
    onSelectPlace(place);
  };

  const groupLabels: Record<string, { label: string; icon: string }> = {
    base: { label: "Base Camp & Habitat", icon: "🏕️" },
    science: { label: "Primary Science Targets", icon: "🔬" },
    mission_informal: { label: "Curiosity Traverse Landmarks", icon: "🤖" },
    gazetteer: { label: "Planetary Gazetteer Landmarks", icon: "🪐" },
  };

  return (
    <div
      style={{
        background: "var(--color-surface, rgba(16, 24, 38, 0.94))",
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
        width: "100%",
        maxWidth: "380px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📍</span> Points of Interest
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

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {Object.entries(groupedPlaces).map(([groupKey, items]) => {
          if (!items || items.length === 0) return null;
          const meta = groupLabels[groupKey] ?? { label: groupKey, icon: "📌" };

          return (
            <div key={groupKey}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#8B949E",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "8px",
                }}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#FFFFFF",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      outline: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(86, 180, 233, 0.15)";
                      e.currentTarget.style.borderColor = "var(--color-accent, #56B4E9)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "#E6EDF3" }}>
                        {item.name}
                      </div>
                      {item.description && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#8B949E",
                            marginTop: "2px",
                            maxWidth: "240px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.description}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "12px",
                        color: "var(--color-accent, #56B4E9)",
                        textAlign: "right",
                        marginLeft: "8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatMarsDistance(item.distFromBaseM)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
