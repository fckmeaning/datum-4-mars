export interface Notice {
  id: number;
  tone: "info" | "warn";
  text: string;
}

/** Honest status line for the map: loading, missing data, unavailable endpoints. Never blocks the map. */
export function MapNotices({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: number) => void }) {
  if (notices.length === 0) return null;
  return (
    <div style={{ position: "absolute", top: "130px", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: "6px", zIndex: 70, alignItems: "center" }}>
      {notices.map((n) => (
        <div
          key={n.id}
          role="status"
          style={{
            background: "rgba(22,27,34,0.94)",
            border: `1px solid ${n.tone === "warn" ? "rgba(227,179,65,0.6)" : "rgba(255,255,255,0.14)"}`,
            borderRadius: "999px",
            padding: "6px 8px 6px 14px",
            fontSize: "12px",
            color: "#E6EDF3",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
          }}
        >
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: n.tone === "warn" ? "#E3B341" : "var(--hz-accent, #2dd4bf)" }} />
          {n.text}
          <button type="button" aria-label="Dismiss" onClick={() => onDismiss(n.id)} style={{ all: "unset", cursor: "pointer", padding: "0 6px", color: "#8B949E" }}>
            {"×"}
          </button>
        </div>
      ))}
    </div>
  );
}
