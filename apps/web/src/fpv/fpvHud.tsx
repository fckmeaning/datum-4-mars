/**
 * fpvHud.tsx - helmet HUD drawn over the first-person view (SVG + CSS, no WebGL).
 * Instruments: compass tape, elevation-angle ruler about the horizon, telemetry, resources, sun, mission clock and the
 * back-to-base arrow. The visor vignette and glare stay on when the instruments are hidden (H).
 */

import type { ReactElement } from "react";
import "./fpv.css";
import {
  compassLabel,
  formatClock,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeading,
  formatPlayback,
  formatSigned,
  remainingPercent,
} from "./format";
import { angleDiffDeg, wrapDeg360 } from "./fpvMath";

export interface FpvTelemetry {
  headingDeg: number;
  /** Camera pitch [deg], positive = looking up. */
  pitchDeg: number;
  elevationM: number;
  slopeDeg: number;
  speedMps: number;
  distanceWalkedM: number;
  distanceRemainingM: number;
  etaS: number;
  o2LeftL: number | null;
  o2TotalL: number | null;
  energyLeftKJ: number | null;
  energyTotalKJ: number | null;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  missionUtc: string;
  /** Bearing and distance to the base (straight line), or null when no base is known. */
  baseBearingDeg: number | null;
  baseDistanceM: number | null;
  /** Elevation angle of the terrain horizon in the viewing direction [deg]. */
  terrainHorizonDeg: number;
  playbackSpeed: number;
  paused: boolean;
  freeRoam: boolean;
}

export interface FpvHudProps {
  telemetry: FpvTelemetry;
  /** Vertical field of view of the camera [deg] (sets the pixel scale of the elevation ruler). */
  fovDeg: number;
  /** Height of the view in CSS pixels. */
  viewportHeight: number;
  /** Width of the view in CSS pixels. */
  viewportWidth: number;
  hudVisible: boolean;
}

const TAPE_SPAN_DEG = 100;
const CARDINALS: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };

/** Horizontal compass tape: ticks every 5 deg, labels every 15 deg, cardinal letters at the 45 deg points. */
function CompassTape({ heading, width }: { heading: number; width: number }): ReactElement {
  const tapeW = Math.min(620, Math.max(280, width * 0.42));
  const pxPerDeg = tapeW / TAPE_SPAN_DEG;
  const first = Math.floor((heading - TAPE_SPAN_DEG / 2) / 5) * 5;
  const ticks: ReactElement[] = [];
  for (let a = first; a <= heading + TAPE_SPAN_DEG / 2 + 5; a += 5) {
    const x = tapeW / 2 + (a - heading) * pxPerDeg;
    const norm = wrapDeg360(a);
    const major = norm % 15 === 0;
    const cardinal = CARDINALS[norm];
    ticks.push(
      <g key={a}>
        <line x1={x} x2={x} y1={cardinal ? 10 : major ? 14 : 18} y2={26} className={major ? "fpv-tick fpv-tick--major" : "fpv-tick"} />
        {(major || cardinal) && (
          <text x={x} y={cardinal ? 8 : 40} textAnchor="middle" className={cardinal ? "fpv-tape-cardinal" : "fpv-tape-num"}>
            {cardinal ?? String(Math.round(norm)).padStart(3, "0")}
          </text>
        )}
      </g>,
    );
  }
  return (
    <svg className="fpv-tape" width={tapeW} height={46} viewBox={`0 0 ${tapeW} 46`} role="img" aria-label={`Heading ${formatHeading(heading)} degrees`}>
      <defs>
        <linearGradient id="fpv-tape-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.18" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.82" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="fpv-tape-mask">
          <rect width={tapeW} height={46} fill="url(#fpv-tape-fade)" />
        </mask>
      </defs>
      <g mask="url(#fpv-tape-mask)">{ticks}</g>
      <path d={`M ${tapeW / 2 - 5} 27 L ${tapeW / 2 + 5} 27 L ${tapeW / 2} 21 Z`} className="fpv-caret" />
    </svg>
  );
}

/** Left-hand ruler of elevation angles (every 5 deg) placed by camera pitch, with the terrain horizon marked. */
function ElevationRuler({ pitch, fov, height, horizonDeg }: { pitch: number; fov: number; height: number; horizonDeg: number }): ReactElement {
  const pxPerDeg = height / fov;
  const cy = height / 2;
  const yOf = (angle: number): number => cy - (angle - pitch) * pxPerDeg;
  const ticks: ReactElement[] = [];
  for (let a = -30; a <= 60; a += 5) {
    const y = yOf(a);
    if (y < 70 || y > height - 90) continue;
    const major = a % 10 === 0;
    ticks.push(
      <g key={a}>
        <line x1={0} x2={major ? 14 : 8} y1={y} y2={y} className={a === 0 ? "fpv-tick fpv-tick--horizon" : "fpv-tick"} />
        {major && (
          <text x={20} y={y + 3.5} className="fpv-ruler-num">
            {a > 0 ? `+${a}` : a}
          </text>
        )}
      </g>,
    );
  }
  const yh = yOf(horizonDeg);
  const showHorizon = yh > 70 && yh < height - 90;
  return (
    <svg className="fpv-ruler" width={170} height={height} viewBox={`0 0 170 ${height}`} aria-hidden="true">
      {ticks}
      {showHorizon && (
        <g>
          <path d={`M 0 ${yh - 4} L 8 ${yh} L 0 ${yh + 4} Z`} className="fpv-horizon-mark" />
          <text x={14} y={yh - 6} className="fpv-ruler-note">
            HORIZON {formatSigned(horizonDeg, 1, "°")}
          </text>
        </g>
      )}
    </svg>
  );
}

function Bar({ label, percent, value }: { label: string; percent: number; value: string }): ReactElement {
  const level = percent < 15 ? "crit" : percent < 35 ? "warn" : "ok";
  return (
    <div className="fpv-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
      <div className="fpv-bar-head">
        <span>{label}</span>
        <span className="fpv-num">{value}</span>
      </div>
      <div className="fpv-bar-track">
        <div className={`fpv-bar-fill fpv-bar-fill--${level}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function FpvHud({ telemetry: t, fovDeg, viewportHeight, viewportWidth, hudVisible }: FpvHudProps): ReactElement {
  const o2Pct = t.o2LeftL !== null && t.o2TotalL !== null ? remainingPercent(t.o2LeftL, t.o2TotalL) : null;
  const enPct = t.energyLeftKJ !== null && t.energyTotalKJ !== null ? remainingPercent(t.energyLeftKJ, t.energyTotalKJ) : null;
  const rel = t.baseBearingDeg === null ? 0 : angleDiffDeg(t.headingDeg, t.baseBearingDeg);

  return (
    <div className="fpv-overlay" role="group" aria-label="Helmet HUD">
      <div className="fpv-vignette" />
      <div className="fpv-glare" />
      {hudVisible && (
        <>
          <div className="fpv-top">
            <div className="fpv-heading">
              <span className="fpv-num fpv-heading-num">{formatHeading(t.headingDeg)}°</span>
              <span className="fpv-heading-pt">{compassLabel(t.headingDeg)}</span>
            </div>
            <CompassTape heading={t.headingDeg} width={viewportWidth} />
          </div>

          <ElevationRuler pitch={t.pitchDeg} fov={fovDeg} height={viewportHeight} horizonDeg={t.terrainHorizonDeg} />

          <section className="fpv-panel fpv-panel--left" aria-label="Position and progress">
            <dl>
              <div><dt>ELEV</dt><dd className="fpv-num">{formatElevation(t.elevationM)}</dd></div>
              <div><dt>SLOPE</dt><dd className="fpv-num">{formatSigned(t.slopeDeg, 1)}</dd></div>
              <div><dt>SPEED</dt><dd className="fpv-num">{t.speedMps.toFixed(2)} m/s</dd></div>
              <div><dt>WALKED</dt><dd className="fpv-num">{formatDistance(t.distanceWalkedM)}</dd></div>
              <div><dt>TO GO</dt><dd className="fpv-num">{formatDistance(t.distanceRemainingM)}</dd></div>
              <div><dt>ETA</dt><dd className="fpv-num">{formatDuration(t.etaS)}</dd></div>
            </dl>
          </section>

          <section className="fpv-panel fpv-panel--right" aria-label="Consumables and sun">
            {o2Pct !== null && t.o2LeftL !== null && <Bar label="O2" percent={o2Pct} value={`${t.o2LeftL.toFixed(0)} L`} />}
            {enPct !== null && t.energyLeftKJ !== null && <Bar label="ENERGY" percent={enPct} value={`${Math.round(t.energyLeftKJ)} kJ`} />}
            <dl>
              <div><dt>SUN</dt><dd className="fpv-num">{formatHeading(t.sunAzimuthDeg)}° / {formatSigned(t.sunElevationDeg, 1)}</dd></div>
              <div><dt>UTC</dt><dd className="fpv-num">{formatClock(t.missionUtc)}</dd></div>
              <div><dt>MODE</dt><dd className="fpv-num">{t.freeRoam ? "FREE ROAM" : formatPlayback(t.playbackSpeed, t.paused)}</dd></div>
            </dl>
          </section>

          {t.baseBearingDeg !== null && t.baseDistanceM !== null && (
            <section className="fpv-base" aria-label="Back to base">
              <svg width={58} height={58} viewBox="-29 -29 58 58" aria-hidden="true">
                <circle r={26} className="fpv-base-ring" />
                <g transform={`rotate(${rel})`}>
                  <path d="M 0 -20 L 7 8 L 0 3 L -7 8 Z" className="fpv-base-arrow" />
                </g>
              </svg>
              <div>
                <div className="fpv-base-label">BASE</div>
                <div className="fpv-num">{formatDistance(t.baseDistanceM)}</div>
                <div className="fpv-num fpv-dim">{formatHeading(t.baseBearingDeg)}° {compassLabel(t.baseBearingDeg)}</div>
              </div>
            </section>
          )}

          <div className="fpv-keys" aria-hidden="true">
            Drag / arrows look · Space pause · 1 2 3 speed · F free roam (WASD) · H hide HUD · Esc exit
          </div>
        </>
      )}
    </div>
  );
}
