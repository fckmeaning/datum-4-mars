import type { LayerMeta } from "../api/client";
import { useAppStore } from "../state/store";

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
      case "gray":
      default:
        return "linear-gradient(90deg, #111111, #888888, #EEEEEE)";
    }
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
        width: "100%",
        maxWidth: "340px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🥞</span> Layers & Colormaps
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

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {layers.map((layer) => {
          const state = layerStates[layer.id] ?? { visible: true, opacity: 1.0 };

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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={state.visible}
                    onChange={(e) => setLayerState(layer.id, { visible: e.target.checked })}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 600, fontSize: "14px", color: state.visible ? "#FFFFFF" : "#8B949E" }}>
                    {layer.name}
                  </span>
                </label>

                {layer.simulated && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      background: "rgba(227, 179, 65, 0.2)",
                      border: "1px solid #E3B341",
                      borderRadius: "4px",
                      color: "#E3B341",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    SIMULATED
                  </span>
                )}
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

              {/* Opacity Slider */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <span style={{ fontSize: "11px", color: "#8B949E", minWidth: "48px" }}>Opacity</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.opacity}
                  onChange={(e) => setLayerState(layer.id, { opacity: parseFloat(e.target.value) })}
                  style={{ flex: 1, cursor: "pointer" }}
                />
                <span style={{ fontSize: "11px", color: "#C9D1D9", minWidth: "32px", textAlign: "right" }}>
                  {Math.round(state.opacity * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
