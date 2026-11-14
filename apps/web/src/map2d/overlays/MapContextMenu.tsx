import { useEffect } from "react";

export interface ContextMenuState {
  x: number;
  y: number;
  lat: number;
  lon: number;
}

interface Props {
  state: ContextMenuState | null;
  onClose: () => void;
  onWhatsHere: (lat: number, lon: number) => void;
  onViewshed: (lat: number, lon: number) => void;
  onCopy: (lat: number, lon: number) => void;
}

const ITEM: React.CSSProperties = {
  all: "unset",
  boxSizing: "border-box",
  display: "block",
  width: "100%",
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: "12px",
  color: "#E6EDF3",
};

/** Right-click menu of the map: what is here, what can be seen from here, copy coordinates. */
export function MapContextMenu({ state, onClose, onWhatsHere, onViewshed, onCopy }: Props) {
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);
  if (!state) return null;
  const act = (fn: (lat: number, lon: number) => void) => () => {
    fn(state.lat, state.lon);
    onClose();
  };
  return (
    <>
      <div style={{ position: "absolute", inset: 0, zIndex: 59 }} onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        role="menu"
        aria-label="Map context menu"
        style={{
          position: "absolute",
          left: Math.max(8, state.x),
          top: Math.max(8, state.y),
          zIndex: 60,
          minWidth: "220px",
          background: "var(--color-surface, rgba(16, 24, 38, 0.96))",
          backdropFilter: "blur(14px)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "8px",
          boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <button role="menuitem" type="button" style={ITEM} onClick={act(onWhatsHere)}>
          What{"’"}s here?
        </button>
        <button role="menuitem" type="button" style={ITEM} onClick={act(onViewshed)}>
          What can I see from here?
        </button>
        <button role="menuitem" type="button" style={ITEM} onClick={act(onCopy)}>
          Copy coordinates
        </button>
      </div>
    </>
  );
}
