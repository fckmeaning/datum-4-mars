import React from "react";
import { useNavigate } from "react-router-dom";
import "./DocPage.css";

export function AboutPage() {
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
            Open the expedition
          </button>
        </div>
      </div>

      <div className="doc__wrap">
        <header className="doc__hero">
          <span className="doc__eyebrow">NASA SPACE APPS 2026</span>
          <h1 className="doc__title">About DATUM-4</h1>
        </header>

        <section className="doc__section" style={{ "--i": 0 } as React.CSSProperties}>
          <h2>Interplanetary Survival Guide: Martian Map</h2>
          <p>
            <strong>DATUM-4</strong> (marsnav) is an offline-capable mission planning and navigation tool designed for astronauts executing EVAs in Gale Crater and the lower slopes of Mount Sharp (Aeolis Mons).
          </p>
          <p>
            Unlike existing tools that operate at regional or global scales (such as JPL Mars Trek or USGS map sheets), DATUM-4 operates at a <strong>hyperlocal scale (5–20 m resolution)</strong>. It solves the critical operational challenge: Mars has no GPS satellite constellation and no global dipole magnetic field for magnetic compasses.
          </p>
        </section>

        <section className="doc__section" style={{ "--i": 1 } as React.CSSProperties}>
          <h2>Core Capabilities</h2>
          <ul className="doc__list">
            <li><strong>Full-bleed Satellite Basemap:</strong> Real orbital mosaic imagery with overlay layers in the custom Mars Transverse Mercator AOI projection.</li>
            <li><strong>Four Explicit Routing Profiles:</strong> FASTEST (minimum traversal time), SAFEST (radiation & slope avoidance), BALANCED, and SCIENCE (maximizing mineral outcrop sampling).</li>
            <li><strong>Rigorous Mathematical Core:</strong> 53 explicit math functions (F01–F53) derived from Mars24 solar position, Tobler hiking speed, Minetti energy consumption, and MSL RAD in-situ radiation data.</li>
            <li><strong>Autonomous Orientation:</strong> Sun compass heading calculation and landmark resection without external positioning infrastructure.</li>
            <li><strong>Points of Interest:</strong> Curated waypoints including Curiosity's historic drill sites and 2025 boxwork formation exploration.</li>
          </ul>
        </section>

        <div className="doc__cta">
          <button className="doc__btn doc__btn--ghost" onClick={() => navigate("/methods")}>
            Read Methods & Data Specifications →
          </button>
        </div>
      </div>
    </div>
  );
}
