import { formatLat, formatLon, niceScale, resolutionChip } from "../layers/scale";

export interface CursorReadout {
  lat: number;
  lon: number;
  elevationM?: number | null;
  slopeDeg?: number | null;
  walkability?: { value: number; label: string; color: string } | null;
}

const BAR: React.CSSProperties = {
  position: "absolute",
  right: "20px",
  bottom: "64px",
  display: "flex",
  alignItems: "center",
  gap: "14px",
  background: "var(--color-surface, rgba(16, 24, 38, 0.88))",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "10px",
  padding: "6px 12px",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: "11px",
  color: "#9BA6B2",
  zIndex: 45,
  maxWidth: "calc(100vw - 340px)",
  flexWrap: "wrap",
};

const dash = "—";

/** Scale bar (nice round lengths), cursor readout and the data-resolution chip, driven by the live view resolution. */
export function MapStatusBar({ metersPerPixel, cursor, cellM }: { metersPerPixel: number; cursor: CursorReadout | null; cellM?: number }) {
  const scale = niceScale(metersPerPixel, 120);
  const chip = resolutionChip(metersPerPixel, cellM);
  return (
    <div style={BAR} data-testid="map-status">
      {chip && (
        <span
          role="status"
          style={{ color: "#E3B341", border: "1px solid rgba(227,179,65,0.45)", borderRadius: "999px", padding: "1px 8px", fontSize: "10px" }}
        >
          {chip}
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }} aria-label={`Scale ${scale.label}`}>
        <div style={{ position: "relative", width: `${Math.round(scale.px)}px`, height: "8px", borderBottom: "2px solid #E6EDF3", borderLeft: "2px solid #E6EDF3", borderRight: "2px solid #E6EDF3" }} />
        <span style={{ color: "#E6EDF3" }}>{scale.label}</span>
      </div>
      <div data-testid="cursor-readout" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <span>{cursor ? `${formatLat(cursor.lat)}, ${formatLon(cursor.lon)}` : dash}</span>
        <span title="Elevation relative to the Mars datum">{cursor?.elevationM != null ? `${Math.round(cursor.elevationM)} m` : dash}</span>
        <span title="Slope from the elevation grid">{cursor?.slopeDeg != null && Number.isFinite(cursor.slopeDeg) ? `${cursor.slopeDeg.toFixed(1)}°` : dash}</span>
        {cursor?.walkability && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#E6EDF3" }}>
            <span aria-hidden style={{ width: "9px", height: "9px", borderRadius: "2px", background: cursor.walkability.color }} />
            W {cursor.walkability.value} {"·"} {cursor.walkability.label}
          </span>
        )}
      </div>
    </div>
  );
}
