import { shouldShowTimeline, type Snapshot } from "../layers/timeline";

export type TimeMode = "single" | "swipe";

interface Props {
  snapshots: Snapshot[];
  activeId: string | null;
  compareId: string | null;
  mode: TimeMode;
  swipe: number;
  onActive: (id: string) => void;
  onCompare: (id: string | null) => void;
  onMode: (m: TimeMode) => void;
  onSwipe: (fraction: number) => void;
}

/**
 * TIME-MARS control: year tabs + slider + swipe compare between two dated snapshots.
 * Hidden entirely unless there are at least two real dated snapshots (nothing is ever faked).
 */
export function TimeSlider({ snapshots, activeId, compareId, mode, swipe, onActive, onCompare, onMode, onSwipe }: Props) {
  if (!shouldShowTimeline(snapshots)) return null;
  const idx = Math.max(0, snapshots.findIndex((s) => s.id === activeId));
  return (
    <section
      aria-label="Time slider"
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "64px",
        zIndex: 46,
        background: "var(--color-surface, rgba(16, 24, 38, 0.9))",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "10px",
        padding: "8px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        color: "#E6EDF3",
        fontSize: "11px",
        minWidth: "340px",
      }}
    >
      <div role="tablist" style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
        {snapshots.map((s) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={s.id === activeId}
            onClick={() => onActive(s.id)}
            style={{
              padding: "3px 10px",
              borderRadius: "999px",
              border: `1px solid ${s.id === activeId ? "var(--hz-accent, #2dd4bf)" : "rgba(255,255,255,0.15)"}`,
              background: s.id === activeId ? "color-mix(in srgb, var(--hz-accent, #2dd4bf) 18%, transparent)" : "transparent",
              color: s.id === activeId ? "#FFFFFF" : "#9BA6B2",
              cursor: "pointer",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {s.year}
          </button>
        ))}
      </div>
      <input
        aria-label="Year"
        type="range"
        min={0}
        max={snapshots.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onActive(snapshots[Number(e.target.value)]!.id)}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
        <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="checkbox" checked={mode === "swipe"} onChange={(e) => onMode(e.target.checked ? "swipe" : "single")} />
          Compare with
        </label>
        <select
          aria-label="Compare with year"
          disabled={mode !== "swipe"}
          value={compareId ?? ""}
          onChange={(e) => onCompare(e.target.value || null)}
          style={{ background: "#0d1117", color: "#E6EDF3", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "2px 6px" }}
        >
          {snapshots.filter((s) => s.id !== activeId).map((s) => (
            <option key={s.id} value={s.id}>
              {s.year}
            </option>
          ))}
        </select>
        <input
          aria-label="Swipe position"
          type="range"
          min={0}
          max={100}
          disabled={mode !== "swipe"}
          value={Math.round(swipe * 100)}
          onChange={(e) => onSwipe(Number(e.target.value) / 100)}
          style={{ flex: 1 }}
        />
      </div>
    </section>
  );
}
