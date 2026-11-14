import { useState } from "react";
import { useAppStore } from "../state/store";

interface MapControlsProps {
  /** Unused since the live readout moved into the map (kept so existing callers compile). */
  cursorCoords?: { lat: number; lon: number } | null;
  onWhereAmI?: () => void;
}

export function MapControls({ onWhereAmI }: MapControlsProps) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const camera = useAppStore((s) => s.camera);
  const setCamera = useAppStore((s) => s.setCamera);
  const [whereAmINotice, setWhereAmINotice] = useState(false);

  const handleToggleMode = () => {
    setMode(mode === "2d" ? "3d" : "2d");
  };

  const handleResetNorth = () => {
    setCamera({ heading_deg: 0, pitch_deg: 0 });
  };

  const handleWhereAmIClick = () => {
    if (onWhereAmI) {
      onWhereAmI();
    } else {
      setWhereAmINotice(true);
      setTimeout(() => setWhereAmINotice(false), 2500);
    }
  };

  return (
    <>
      {/* Top-Right Tools */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 50,
        }}
      >
        {/* North Arrow Button */}
        <button
          onClick={handleResetNorth}
          title="Reset to North"
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: "var(--color-surface, rgba(16, 24, 38, 0.85))",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            color: "#FFFFFF",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 800,
          }}
        >
          <span
            style={{
              display: "inline-block",
              transform: `rotate(${-camera.heading_deg}deg)`,
              color: "#F85149",
            }}
          >
            ▲
          </span>
        </button>

        {/* 2D / 3D Mode Toggle */}
        <button
          onClick={handleToggleMode}
          title="Switch 2D / 3D Terrain Tilt"
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            background: "var(--color-surface, rgba(16, 24, 38, 0.85))",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            color: mode === "3d" ? "var(--hz-accent, #2dd4bf)" : "#E6EDF3",
            fontWeight: 700,
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span>{mode === "3d" ? "3D" : "2D"}</span>
        </button>

        {/* "Where am I?" Button */}
        <button
          onClick={handleWhereAmIClick}
          title="Where am I? (Sun compass & resection)"
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            background: "var(--color-surface, rgba(16, 24, 38, 0.85))",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            color: "var(--hz-accent, #2dd4bf)",
            fontWeight: 600,
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>🎯</span>
          <span>Where am I?</span>
        </button>
      </div>

      {whereAmINotice && (
        <div
          style={{
            position: "absolute",
            top: "70px",
            right: "20px",
            background: "rgba(22, 27, 34, 0.95)",
            border: "1px solid var(--hz-accent, #2dd4bf)",
            borderRadius: "8px",
            padding: "10px 14px",
            color: "#FFFFFF",
            fontSize: "12px",
            zIndex: 100,
            maxWidth: "260px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <strong>Autonomous Fix (F13/F15):</strong> Estimated position Bradbury Landing · Error ellipse ±25 m.
        </div>
      )}
    </>
  );
}
