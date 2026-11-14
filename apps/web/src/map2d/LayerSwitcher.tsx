import type { LayerMeta } from "../api/client";
import { useAppStore } from "../state/store";
import { Badge } from "../ui/Badge";
import { stateKeyFor } from "./layerLevel";

interface LayerSwitcherProps {
  layers: LayerMeta[];
  onClose: () => void;
}

export function LayerSwitcher({ layers, onClose }: LayerSwitcherProps) {
  const layerStates = useAppStore((s) => s.layers);
  const setLayerState = useAppStore((s) => s.setLayerState);

  const getColormapGradient = (colormap?: string) => {
    switch (colormap) {
      case "cividis":
        return "linear-gradient(90deg, #00224D, #4A6877, #A6A670, #FEE838)";
      case "inferno":
        return "linear-gradient(90deg, #000004, #57106E, #BB3754, #F98C0A, #FCFFA4)";
      case "magma":
        return "linear-gradient(90deg, #000004, #3B0F70, #8C2981, #DE4968, #FE9F6D, #FCFDBF)";
      case "slope":
        return "linear-gradient(90deg, #00A86B, #E3B341, #D45D39, #8B0000)";
      case "gray":
      default:
        return "linear-gradient(90deg, #111111, #888888, #EEEEEE)";
    }
  };

  const slopeState = layerStates.slope ?? { visible: false, opacity: 0.8 };
  const hillshadeState = layerStates.hillshade ?? { visible: false, opacity: 0.8 };
  const traverseState = layerStates.traverse ?? { visible: true, opacity: 1.0 };
  const isochroneState = layerStates.isochrones ?? { visible: false, opacity: 1.0 };
  const viewshedState = layerStates.viewshed ?? { visible: false, opacity: 1.0 };
  const hasOptical = layers.some((l) => stateKeyFor(l) === "optical");
  const hasWalkability = layers.some((l) => stateKeyFor(l) === "walkability");

  return (
    <div
      role="region"
      aria-label="Layer switcher and colormaps"
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
        width: "100%",
        maxWidth: "360px",
        maxHeight: "85vh",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🥞</span> Layers & Colormaps
        </h2>
        <button
          onClick={onClose}
          aria-label="Close layer switcher"
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

      {/* Primary Data Layers (API listLayers) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#8B949E", letterSpacing: "0.5px" }}>
          Primary Datasets ({layers.length})
        </span>

        {layers.map((layer) => {
          const key = stateKeyFor(layer);
          const state = layerStates[key] ?? { visible: true, opacity: 1.0 };

          return (
            <div
              key={layer.id}
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "10px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={state.visible}
                    onChange={(e) => setLayerState(key, { visible: e.target.checked })}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: state.visible ? "#FFFFFF" : "#8B949E" }}>
                      {layer.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#8B949E" }}>
                      {layer.family} · {layer.resolution_m ? `${layer.resolution_m} m` : layer.level} · {layer.unit}
                    </div>
                  </div>
                </label>

                <div style={{ display: "flex", gap: "4px" }}>
                  {layer.simulated ? (
                    <Badge variant="SIMULATED" size="sm">
                      SIMULATED
                    </Badge>
                  ) : layer.uncertainty_note ? (
                    <Badge variant="APPROXIMATE" size="sm">
                      APPROX
                    </Badge>
                  ) : null}
                </div>
              </div>

              {/* Colormap Legend Bar */}
              <div>
                <div
                  style={{
                    height: "8px",
                    borderRadius: "4px",
                    background: getColormapGradient(layer.colormap),
                    marginBottom: "4px",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "#8B949E",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  <span>{layer.value_range ? `${layer.value_range[0]} ${layer.unit}` : "Min"}</span>
                  <span>{layer.colormap ?? "linear"}</span>
                  <span>{layer.value_range ? `${layer.value_range[1]} ${layer.unit}` : "Max"}</span>
                </div>
              </div>

              {/* Credit */}
              {layer.credit && (
                <div style={{ fontSize: "10px", color: "#6E7681" }}>
                  Credit: {layer.credit}
                </div>
              )}

              {/* Opacity Slider */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                <span style={{ fontSize: "11px", color: "#8B949E", minWidth: "48px" }}>Opacity</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.opacity}
                  onChange={(e) => setLayerState(key, { opacity: parseFloat(e.target.value) })}
                  style={{ flex: 1, cursor: "pointer" }}
                />
                <span style={{ fontSize: "11px", color: "#C9D1D9", minWidth: "32px", textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
                  {Math.round(state.opacity * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Honest empty states: data that is not on disk yet is said so, never faked */}
      {(!hasOptical || !hasWalkability) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "#8B949E" }}>
          {!hasOptical && <div data-empty="optical">Optical basemap: not available yet (waiting for the HiRISE product).</div>}
          {!hasWalkability && <div data-empty="walkability">Walkability index: not computed yet.</div>}
        </div>
      )}

      {/* Analysis overlays computed by the API */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#8B949E", letterSpacing: "0.5px" }}>
          Analysis overlays
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isochroneState.visible}
            onChange={(e) => setLayerState("isochrones", { visible: e.target.checked })}
            style={{ width: "16px", height: "16px", cursor: "pointer" }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px", color: isochroneState.visible ? "#FFFFFF" : "#8B949E" }}>Return-time isochrones</div>
            <div style={{ fontSize: "11px", color: "#8B949E" }}>15 / 30 / 60 / 90 / 120 min walking back to base</div>
          </div>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={viewshedState.visible}
            onChange={(e) => setLayerState("viewshed", { visible: e.target.checked })}
            style={{ width: "16px", height: "16px", cursor: "pointer" }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px", color: viewshedState.visible ? "#FFFFFF" : "#8B949E" }}>Line of sight</div>
            <div style={{ fontSize: "11px", color: "#8B949E" }}>Right-click the map, then {"“"}What can I see from here?{"”"}</div>
          </div>
        </label>
      </div>

      {/* Derived WebGL Shader Layers */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#8B949E", letterSpacing: "0.5px" }}>
          Derived Analysis (GPU Shader)
        </span>

        {/* Slope Layer */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "10px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", flex: 1 }}>
              <input
                type="checkbox"
                checked={slopeState.visible}
                onChange={(e) => setLayerState("slope", { visible: e.target.checked })}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px", color: slopeState.visible ? "#FFFFFF" : "#8B949E" }}>
                  Derived Slope
                </div>
                <div style={{ fontSize: "11px", color: "#8B949E" }}>
                  topography · finite diff · degrees (°)
                </div>
              </div>
            </label>
            <Badge variant="LIVE" size="sm">GPU</Badge>
          </div>

          <div>
            <div
              style={{
                height: "8px",
                borderRadius: "4px",
                background: getColormapGradient("slope"),
                marginBottom: "4px",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "10px",
                color: "#8B949E",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              <span>0° (flat)</span>
              <span>green-to-red</span>
              <span>35°+ (cliff)</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
            <span style={{ fontSize: "11px", color: "#8B949E", minWidth: "48px" }}>Opacity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={slopeState.opacity}
              onChange={(e) => setLayerState("slope", { opacity: parseFloat(e.target.value) })}
              style={{ flex: 1, cursor: "pointer" }}
            />
            <span style={{ fontSize: "11px", color: "#C9D1D9", minWidth: "32px", textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
              {Math.round(slopeState.opacity * 100)}%
            </span>
          </div>
        </div>

        {/* Hillshade Layer */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "10px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", flex: 1 }}>
              <input
                type="checkbox"
                checked={hillshadeState.visible}
                onChange={(e) => setLayerState("hillshade", { visible: e.target.checked })}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px", color: hillshadeState.visible ? "#FFFFFF" : "#8B949E" }}>
                  Derived Hillshade
                </div>
                <div style={{ fontSize: "11px", color: "#8B949E" }}>
                  optical · NW 315° alt 45° · rel. intensity
                </div>
              </div>
            </label>
            <Badge variant="LIVE" size="sm">GPU</Badge>
          </div>

          <div>
            <div
              style={{
                height: "8px",
                borderRadius: "4px",
                background: getColormapGradient("gray"),
                marginBottom: "4px",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "10px",
                color: "#8B949E",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              <span>0.0 (shadow)</span>
              <span>Lambertian</span>
              <span>1.0 (sunlit)</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
            <span style={{ fontSize: "11px", color: "#8B949E", minWidth: "48px" }}>Opacity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={hillshadeState.opacity}
              onChange={(e) => setLayerState("hillshade", { opacity: parseFloat(e.target.value) })}
              style={{ flex: 1, cursor: "pointer" }}
            />
            <span style={{ fontSize: "11px", color: "#C9D1D9", minWidth: "32px", textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
              {Math.round(hillshadeState.opacity * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Historic Ground Truth Overlays */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#8B949E", letterSpacing: "0.5px" }}>
          Ground Truth Overlays
        </span>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "10px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", flex: 1 }}>
              <input
                type="checkbox"
                checked={traverseState.visible}
                onChange={(e) => setLayerState("traverse", { visible: e.target.checked })}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px", color: traverseState.visible ? "#FFFFFF" : "#8B949E" }}>
                  Curiosity Traverse (real)
                </div>
                <div style={{ fontSize: "11px", color: "#8B949E" }}>
                  1,389 sols · Bradbury to Mt. Sharp
                </div>
              </div>
            </label>
            <Badge variant="REPLAY" size="sm">REPLAY</Badge>
          </div>

          <div style={{ fontSize: "10px", color: "#6E7681" }}>
            Credit: NASA/JPL-Caltech/MSL
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
            <span style={{ fontSize: "11px", color: "#8B949E", minWidth: "48px" }}>Opacity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={traverseState.opacity}
              onChange={(e) => setLayerState("traverse", { opacity: parseFloat(e.target.value) })}
              style={{ flex: 1, cursor: "pointer" }}
            />
            <span style={{ fontSize: "11px", color: "#C9D1D9", minWidth: "32px", textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
              {Math.round(traverseState.opacity * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
