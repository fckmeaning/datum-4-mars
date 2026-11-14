import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, type Place, type LayerMeta } from "../api/client";
import { useAppStore } from "../state/store";
import { Map2D } from "../map2d/Map2D";
import { SearchBox } from "../map2d/SearchBox";
import { DirectionsPanel } from "../map2d/DirectionsPanel";
import { PoiMenu } from "../map2d/PoiMenu";
import { LayerSwitcher } from "../map2d/LayerSwitcher";
import { PlaceCard } from "../map2d/PlaceCard";
import { MapControls } from "../map2d/MapControls";

export function MissionPlanner() {
  const navigate = useNavigate();
  const siteId = useAppStore((s) => s.siteId);
  const selectedPlaceId = useAppStore((s) => s.selectedPlaceId);
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId);
  const poiOpen = useAppStore((s) => s.poiOpen);
  const setPoiOpen = useAppStore((s) => s.setPoiOpen);
  const directionsOpen = useAppStore((s) => s.directionsOpen);
  const setDirectionsOpen = useAppStore((s) => s.setDirectionsOpen);

  const [places, setPlaces] = useState<Place[]>([]);
  const [layers, setLayers] = useState<LayerMeta[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  // Resize listener for mobile responsive layout
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch initial site data
  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const [placesData, layersData] = await Promise.all([
          apiClient.listSitePlaces(siteId),
          apiClient.listLayers(siteId),
        ]);
        if (active) {
          setPlaces(placesData);
          setLayers(layersData);
        }
      } catch (err) {
        console.warn("Failed to load initial site data:", err);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [siteId]);

  const activePlace = places.find((p) => p.id === selectedPlaceId);
  const basePlace = places.find((p) => p.kind === "base");

  const handleSelectPlace = (place: Place) => {
    setSelectedPlaceId(place.id);
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "var(--color-bg, #080C10)",
        color: "var(--color-text, #E6EDF3)",
        fontFamily: "var(--font-ui, system-ui, sans-serif)",
      }}
    >
      {/* Full-bleed 2D Map */}
      <Map2D
        places={places}
        onSelectPlace={handleSelectPlace}
        onCursorMove={setCursorCoords}
      />

      {/* Floating HUD Controls */}
      <MapControls cursorCoords={cursorCoords} />

      {/* Top Bar / Navigation Overlay */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          right: isMobile ? "16px" : "auto",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
          {/* Logo / Home Button */}
          <button
            onClick={() => navigate("/")}
            title="Return to Start Menu"
            style={{
              height: "44px",
              padding: "0 14px",
              borderRadius: "var(--radius-lg, 12px)",
              background: "var(--color-surface, rgba(16, 24, 38, 0.85))",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: "15px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
          >
            <span style={{ color: "#D45D39" }}>🪐</span>
            <span>AreoNav</span>
          </button>

          {/* Search Box */}
          <div style={{ flex: 1 }}>
            <SearchBox onSelectPlace={handleSelectPlace} />
          </div>
        </div>

        {/* Quick Action Pills */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto" }}>
          <button
            onClick={() => {
              setDirectionsOpen(!directionsOpen);
              if (!directionsOpen) {
                setPoiOpen(false);
                setLayersOpen(false);
              }
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "20px",
              background: directionsOpen
                ? "var(--color-accent, #56B4E9)"
                : "var(--color-surface, rgba(16, 24, 38, 0.85))",
              color: directionsOpen ? "#080C10" : "#E6EDF3",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(12px)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              whiteSpace: "nowrap",
            }}
          >
            <span>🧭</span>
            <span>Directions</span>
          </button>

          <button
            onClick={() => {
              setPoiOpen(!poiOpen);
              if (!poiOpen) {
                setDirectionsOpen(false);
                setLayersOpen(false);
              }
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "20px",
              background: poiOpen
                ? "var(--color-accent, #56B4E9)"
                : "var(--color-surface, rgba(16, 24, 38, 0.85))",
              color: poiOpen ? "#080C10" : "#E6EDF3",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(12px)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              whiteSpace: "nowrap",
            }}
          >
            <span>📍</span>
            <span>Points of Interest</span>
          </button>

          <button
            onClick={() => {
              setLayersOpen(!layersOpen);
              if (!layersOpen) {
                setDirectionsOpen(false);
                setPoiOpen(false);
              }
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "20px",
              background: layersOpen
                ? "var(--color-accent, #56B4E9)"
                : "var(--color-surface, rgba(16, 24, 38, 0.85))",
              color: layersOpen ? "#080C10" : "#E6EDF3",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(12px)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              whiteSpace: "nowrap",
            }}
          >
            <span>🥞</span>
            <span>Layers</span>
          </button>
        </div>
      </div>

      {/* Floating Side Panels (Desktop) / Bottom Sheets (Mobile) */}
      <div
        style={
          isMobile
            ? {
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 60,
                maxHeight: "75vh",
                overflowY: "auto",
                borderTopLeftRadius: "16px",
                borderTopRightRadius: "16px",
              }
            : {
                position: "absolute",
                top: "120px",
                left: "16px",
                zIndex: 60,
              }
        }
      >
        {directionsOpen && (
          <DirectionsPanel
            places={places}
            onClose={() => setDirectionsOpen(false)}
          />
        )}

        {poiOpen && (
          <PoiMenu
            places={places}
            basePlace={basePlace}
            onSelectPlace={handleSelectPlace}
            onClose={() => setPoiOpen(false)}
          />
        )}

        {layersOpen && (
          <LayerSwitcher
            layers={layers}
            onClose={() => setLayersOpen(false)}
          />
        )}

        {activePlace && !directionsOpen && !poiOpen && !layersOpen && (
          <PlaceCard
            place={activePlace}
            onClose={() => setSelectedPlaceId(null)}
          />
        )}
      </div>
    </div>
  );
}
