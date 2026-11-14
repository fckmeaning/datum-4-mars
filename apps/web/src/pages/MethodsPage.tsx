import React from "react";
import { useNavigate } from "react-router-dom";
import "./DocPage.css";

const LADDER = [
  { level: "L0", res: "20 m", src: "Synthetic DEM & procedural test rasters", status: "SIMULATED", tone: "sim" },
  { level: "L1", res: "200 m", src: "HRSC / MOLA blended elevation", status: "PROCESSED", tone: "ok" },
  { level: "L2", res: "20 m", src: "CTX mosaic + stereo DEM", status: "PROCESSED", tone: "ok" },
  { level: "L3", res: "1–5 m", src: "HiRISE DTM & sub-meter orthomosaic", status: "TARGET", tone: "ok" },
] as const;

const FUNCS = [
  {
    id: "F05",
    name: "Walking Speed (Tobler modified for Mars)",
    unit: "m/s",
    text: "Walking velocity as a function of local slope with suit impedance factor s_suit = 1.3: v = v_flat * exp(-3.5 * |s + 0.05|) / s_suit",
  },
  {
    id: "F06",
    name: "Metabolic Energy (Minetti Mars adaptation)",
    unit: "kJ",
    text: "Energy cost based on 5th-order grade polynomial scaled by Martian gravity ratio (g_mars / g_earth).",
  },
  {
    id: "F08",
    name: "Radiation Dose Rate (RAD In-Situ Calibration)",
    unit: "mSv/h",
    text: "Calculates Galactic Cosmic Ray (GCR) and Solar Energetic Particle (SEP) dose rates with terrain sky-view factor shielding.",
  },
  {
    id: "F09",
    name: "Multi-Hazard Aggregation",
    unit: "score [0..1]",
    text: "Aggregates slope steepness, micro-roughness, sand dune mobility, and shadow thermal drops into an impermeable traverse penalty.",
  },
] as const;

export function MethodsPage() {
  const navigate = useNavigate();

  return (
    <div className="doc">
      <div className="doc__bar">
        <span className="doc__brand">DATUM-4</span>
        <div className="doc__actions">
          <button className="doc__btn" onClick={() => navigate("/")}>
            Start Menu
          </button>
          <button className="doc__btn doc__btn--primary" onClick={() => navigate("/site/gale")}>
            Open the Gale expedition
          </button>
        </div>
      </div>

      <div className="doc__wrap">
        <header className="doc__hero">
          <span className="doc__eyebrow">TECHNICAL DOCUMENTATION</span>
          <h1 className="doc__title">Methods & Data (F01–F53)</h1>
        </header>

        <section className="doc__section" style={{ "--i": 0 } as React.CSSProperties}>
          <h2>Data Ladder & Transparency</h2>
          <p>The application operates on an explicit four-tier data ladder ensuring continuous functionality from testing to flight operations:</p>
          <div className="doc__table-wrap">
            <table className="doc__table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Resolution</th>
                  <th>Data Sources</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {LADDER.map((r) => (
                  <tr key={r.level}>
                    <td>{r.level}</td>
                    <td>{r.res}</td>
                    <td>{r.src}</td>
                    <td>
                      <span className={`doc__pill doc__pill--${r.tone}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="doc__section" style={{ "--i": 1 } as React.CSSProperties}>
          <h2>Core Routing Functions</h2>
          <div className="doc__funcs">
            {FUNCS.map((f) => (
              <div key={f.id} className="doc__func">
                <div className="doc__func-head">
                  <strong>
                    <em>{f.id}</em>
                    {f.name.replace(/^F\d+ · /, "")}
                  </strong>
                  <span className="doc__unit">{f.unit}</span>
                </div>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
