const BTN: React.CSSProperties = {
  width: "34px",
  height: "34px",
  background: "var(--color-surface, rgba(16, 24, 38, 0.88))",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#E6EDF3",
  fontSize: "17px",
  lineHeight: 1,
  cursor: "pointer",
};

/** Zoom in / out / fit-to-site, stacked under the existing top-right tools. */
export function ZoomButtons({ onIn, onOut, onFit }: { onIn: () => void; onOut: () => void; onFit: () => void }) {
  return (
    <div role="group" aria-label="Zoom" style={{ position: "absolute", top: "200px", right: "20px", display: "flex", flexDirection: "column", zIndex: 50, boxShadow: "0 4px 16px rgba(0,0,0,0.5)", borderRadius: "8px", overflow: "hidden" }}>
      <button type="button" aria-label="Zoom in" title="Zoom in" style={{ ...BTN, borderBottom: "none" }} onClick={onIn}>
        +
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" style={{ ...BTN, borderBottom: "none" }} onClick={onOut}>
        {"−"}
      </button>
      <button type="button" aria-label="Fit to site" title="Fit to the site area" style={{ ...BTN, fontSize: "12px" }} onClick={onFit}>
        {"□"}
      </button>
    </div>
  );
}
