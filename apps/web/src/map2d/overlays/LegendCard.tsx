import { useState } from "react";
import type { LegendEntry } from "../layers/legend";

const CARD: React.CSSProperties = {
  position: "absolute",
  left: "20px",
  bottom: "64px",
  width: "264px",
  maxHeight: "46vh",
  overflowY: "auto",
  background: "var(--color-surface, rgba(16, 24, 38, 0.88))",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "10px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  color: "#E6EDF3",
  fontSize: "11px",
  zIndex: 45,
};

const MONO = "var(--font-mono, ui-monospace, monospace)";

/** Legend that always matches the layers that are visible on the map (units, ramps, resolution limit). */
export function LegendCard({ entries }: { entries: LegendEntry[] }) {
  const [open, setOpen] = useState(true);
  if (entries.length === 0) return null;
  return (
    <section aria-label="Map legend" style={CARD}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          all: "unset",
          boxSizing: "border-box",
          width: "100%",
          padding: "8px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "11px",
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          color: "#8B949E",
        }}
      >
        <span>Legend</span>
        <span aria-hidden>{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {entries.map((e) => (
            <div key={e.id} data-legend={e.id}>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                {e.title}
                {e.unit ? <span style={{ color: "#8B949E", fontWeight: 400 }}> {"·"} {e.unit}</span> : null}
              </div>
              {e.gradient && (
                <>
                  <div style={{ height: "8px", borderRadius: "3px", background: e.gradient, border: "1px solid rgba(255,255,255,0.12)" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, color: "#8B949E", marginTop: "2px" }}>
                    <span>{e.minLabel}</span>
                    <span>{e.maxLabel}</span>
                  </div>
                </>
              )}
              {e.classes && (
                <ul style={{ listStyle: "none", margin: e.gradient ? "6px 0 0" : 0, padding: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
                  {e.classes.map((c) => (
                    <li key={c.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        aria-hidden
                        style={{
                          width: e.kind === "line" ? "18px" : "12px",
                          height: e.kind === "line" ? "3px" : "12px",
                          borderRadius: e.kind === "line" ? "2px" : "3px",
                          background: c.color,
                          border: "1px solid rgba(255,255,255,0.25)",
                          flex: "none",
                        }}
                      />
                      <span>{c.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.note && <div style={{ color: "#6E7681", marginTop: "4px", lineHeight: 1.35 }}>{e.note}</div>}
            </div>
          ))}
          <div style={{ color: "#6E7681", fontFamily: MONO, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "6px" }}>
            Keys 1 relief {"·"} 2 optical {"·"} 3 slope {"·"} 4 hillshade {"·"} 5 walkability {"·"} 6 traverse
          </div>
        </div>
      )}
    </section>
  );
}
