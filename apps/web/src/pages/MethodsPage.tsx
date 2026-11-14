import { useNavigate } from "react-router-dom";

export function MethodsPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg, #080C10)",
        color: "var(--color-text, #E6EDF3)",
        fontFamily: "var(--font-ui, system-ui, sans-serif)",
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <div>
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "12px",
                color: "var(--color-accent, #56B4E9)",
                letterSpacing: "2px",
              }}
            >
              TECHNICAL DOCUMENTATION
            </span>
            <h1 style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 800 }}>Methods & Data (F01–F53)</h1>
          </div>
          <button
            onClick={() => navigate("/planner")}
            style={{
              background: "var(--color-accent, #56B4E9)",
              border: "none",
              color: "#080C10",
              fontWeight: 600,
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Open Mission Planner
          </button>
        </div>

        <section style={{ background: "rgba(16, 24, 38, 0.75)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0 }}>Data Ladder & Transparency</h2>
          <p style={{ lineHeight: "1.6", color: "#C9D1D9" }}>
            The application operates on an explicit four-tier data ladder ensuring continuous functionality from testing to flight operations:
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginTop: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.15)", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>Level</th>
                  <th style={{ padding: "8px 12px" }}>Resolution</th>
                  <th style={{ padding: "8px 12px" }}>Data Sources</th>
                  <th style={{ padding: "8px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>L0</td>
                  <td style={{ padding: "8px 12px" }}>20 m</td>
                  <td style={{ padding: "8px 12px" }}>Synthetic DEM & procedural test rasters</td>
                  <td style={{ padding: "8px 12px", color: "#E3B341" }}>SIMULATED</td>
                </tr>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>L1</td>
                  <td style={{ padding: "8px 12px" }}>200 m</td>
                  <td style={{ padding: "8px 12px" }}>HRSC / MOLA blended elevation</td>
                  <td style={{ padding: "8px 12px", color: "#56B4E9" }}>PROCESSED</td>
                </tr>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>L2</td>
                  <td style={{ padding: "8px 12px" }}>20 m</td>
                  <td style={{ padding: "8px 12px" }}>CTX mosaic + stereo DEM</td>
                  <td style={{ padding: "8px 12px", color: "#56B4E9" }}>PROCESSED</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>L3</td>
                  <td style={{ padding: "8px 12px" }}>1–5 m</td>
                  <td style={{ padding: "8px 12px" }}>HiRISE DTM & sub-meter orthomosaic</td>
                  <td style={{ padding: "8px 12px", color: "#56B4E9" }}>TARGET</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ background: "rgba(16, 24, 38, 0.75)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0 }}>Core Routing Functions</h2>
          <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <strong style={{ color: "var(--color-accent, #56B4E9)" }}>F05 · Walking Speed (Tobler modified for Mars)</strong>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px" }}>m/s</span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#8B949E" }}>
                Walking velocity as a function of local slope with suit impedance factor s_suit = 1.3:
                v = v_flat * exp(-3.5 * |s + 0.05|) / s_suit
              </p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <strong style={{ color: "var(--color-accent, #56B4E9)" }}>F06 · Metabolic Energy (Minetti Mars adaptation)</strong>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px" }}>kJ</span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#8B949E" }}>
                Energy cost based on 5th-order grade polynomial scaled by Martian gravity ratio (g_mars / g_earth).
              </p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <strong style={{ color: "var(--color-accent, #56B4E9)" }}>F08 · Radiation Dose Rate (RAD In-Situ Calibration)</strong>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px" }}>mSv/h</span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#8B949E" }}>
                Calculates Galactic Cosmic Ray (GCR) and Solar Energetic Particle (SEP) dose rates with terrain sky-view factor shielding.
              </p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <strong style={{ color: "var(--color-accent, #56B4E9)" }}>F09 · Multi-Hazard Aggregation</strong>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px" }}>score [0..1]</span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#8B949E" }}>
                Aggregates slope steepness, micro-roughness, sand dune mobility, and shadow thermal drops into an impermeable traverse penalty.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
