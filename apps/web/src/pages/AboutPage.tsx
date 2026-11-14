import { useNavigate } from "react-router-dom";

export function AboutPage() {
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
      <div style={{ maxWidth: "840px", margin: "0 auto" }}>
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
              NASA SPACE APPS 2026
            </span>
            <h1 style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 800 }}>About AreoNav</h1>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => navigate("/")}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#E6EDF3",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Start Menu
            </button>
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
              Mission Planner
            </button>
          </div>
        </div>

        <section style={{ background: "rgba(16, 24, 38, 0.75)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0 }}>Interplanetary Survival Guide: Martian Map</h2>
          <p style={{ lineHeight: "1.6", color: "#C9D1D9" }}>
            <strong>AreoNav</strong> (marsnav) is an offline-capable mission planning and navigation tool designed for astronauts executing EVAs in Gale Crater and the lower slopes of Mount Sharp (Aeolis Mons).
          </p>
          <p style={{ lineHeight: "1.6", color: "#C9D1D9" }}>
            Unlike existing tools that operate at regional or global scales (such as JPL Mars Trek or USGS map sheets), AreoNav operates at a <strong>hyperlocal scale (5–20 m resolution)</strong>. It solves the critical operational challenge: Mars has no GPS satellite constellation and no global dipole magnetic field for magnetic compasses.
          </p>
        </section>

        <section style={{ background: "rgba(16, 24, 38, 0.75)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", marginTop: 0 }}>Core Capabilities</h2>
          <ul style={{ lineHeight: "1.8", color: "#C9D1D9", paddingLeft: "20px" }}>
            <li><strong>Full-bleed Satellite Basemap:</strong> Real orbital mosaic imagery with overlay layers in the custom Mars Transverse Mercator AOI projection.</li>
            <li><strong>Four Explicit Routing Profiles:</strong> FASTEST (minimum traversal time), SAFEST (radiation & slope avoidance), BALANCED, and SCIENCE (maximizing mineral outcrop sampling).</li>
            <li><strong>Rigorous Mathematical Core:</strong> 53 explicit math functions (F01–F53) derived from Mars24 solar position, Tobler hiking speed, Minetti energy consumption, and MSL RAD in-situ radiation data.</li>
            <li><strong>Autonomous Orientation:</strong> Sun compass heading calculation and landmark resection without external positioning infrastructure.</li>
            <li><strong>Points of Interest:</strong> Curated waypoints including Curiosity's historic drill sites and 2025 boxwork formation exploration.</li>
          </ul>
        </section>

        <div style={{ textAlign: "center", marginTop: "36px" }}>
          <button
            onClick={() => navigate("/methods")}
            style={{
              background: "transparent",
              border: "1px solid var(--color-accent, #56B4E9)",
              color: "var(--color-accent, #56B4E9)",
              padding: "12px 24px",
              borderRadius: "8px",
              fontSize: "15px",
              cursor: "pointer",
            }}
          >
            Read Methods & Data Specifications →
          </button>
        </div>
      </div>
    </div>
  );
}
