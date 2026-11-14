import React, { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { components } from "../api/schema";
import "./RouteProfileChart.css";

export type SegmentData = components["schemas"]["Segment"];

export interface RouteChartPoint {
  distance_km: number;
  distance_m: number;
  elevation_m: number;
  slope_deg: number;
  cum_dose_mSv: number;
  cum_energy_kJ: number;
  limiting_factor: string;
}

export interface RouteChartData {
  points: RouteChartPoint[];
  uPlotData: [number[], number[], number[], number[], number[]]; // [x_km, elev_m, slope_deg, dose_mSv, energy_kJ]
  limitingBands: Array<{ start_km: number; end_km: number; factor: string }>;
}

export const LIMITING_FACTOR_COLORS: Record<string, string> = {
  slope: "#F85149", // danger red
  hazard: "#D29922", // warning amber
  roughness: "#D29922",
  dose: "#A371F7", // plasma purple
  thermal: "#F07E4F", // inferno orange
  shadow: "#58A6FF", // shadow blue
  time: "#56B4E9", // cyan
  energy: "#E69F00", // orange
  comms: "#3FB950", // green
  science: "#CC79A7", // pink
};

/**
 * Transforms route segments into along-route profile series.
 * Formula for Elevation:
 * If segment provides ascent_m: z_(i+1) = z_i + ascent_m
 * Otherwise, integrate slope over distance:
 * Δz = length_m * sin(slope_deg * π / 180) (pure geometry)
 */
export function transformRouteSegments(
  segments: SegmentData[],
  initialElevation_m: number = -4500
): RouteChartData {
  if (!segments || segments.length === 0) {
    return {
      points: [],
      uPlotData: [[], [], [], [], []],
      limitingBands: [],
    };
  }

  const points: RouteChartPoint[] = [];
  const limitingBands: Array<{ start_km: number; end_km: number; factor: string }> = [];

  let currentDist_m = 0;
  let currentElev_m = initialElevation_m;
  let currentDose_mSv = 0;
  let currentEnergy_kJ = 0;

  // Initial Point (Start of Traverse)
  const firstFactor = segments[0]?.limiting_factor ?? "time";
  points.push({
    distance_km: 0,
    distance_m: 0,
    elevation_m: currentElev_m,
    slope_deg: segments[0]?.slope_deg ?? 0,
    cum_dose_mSv: 0,
    cum_energy_kJ: 0,
    limiting_factor: firstFactor,
  });

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;

    const startKm = currentDist_m / 1000;
    const len = seg.length_m;
    currentDist_m += len;
    const endKm = currentDist_m / 1000;

    // Delta elevation
    let deltaZ: number;
    if (seg.ascent_m !== undefined && seg.ascent_m !== null) {
      deltaZ = seg.ascent_m;
    } else {
      // Δz = length * sin(slope)
      const rad = (seg.slope_deg * Math.PI) / 180;
      deltaZ = len * Math.sin(rad);
    }
    currentElev_m += deltaZ;

    // Delta dose: dose_rate * duration
    const durationHours = seg.duration_s / 3600;
    const segDose = (seg.dose_rate_mSv_h ?? 0.02) * durationHours;
    currentDose_mSv += segDose;

    // Delta energy: segment energy or component
    const segEnergy =
      seg.energy_kJ ?? (seg.components ? seg.components.energy * 10 : 5);
    currentEnergy_kJ += segEnergy;

    const factor = seg.limiting_factor || "time";

    limitingBands.push({
      start_km: startKm,
      end_km: endKm,
      factor,
    });

    points.push({
      distance_km: parseFloat((currentDist_m / 1000).toFixed(3)),
      distance_m: Math.round(currentDist_m),
      elevation_m: parseFloat(currentElev_m.toFixed(1)),
      slope_deg: parseFloat(seg.slope_deg.toFixed(1)),
      cum_dose_mSv: parseFloat(currentDose_mSv.toFixed(3)),
      cum_energy_kJ: parseFloat(currentEnergy_kJ.toFixed(1)),
      limiting_factor: factor,
    });
  }

  const x_km = points.map((p) => p.distance_km);
  const elev_m = points.map((p) => p.elevation_m);
  const slope_deg = points.map((p) => p.slope_deg);
  const dose_mSv = points.map((p) => p.cum_dose_mSv);
  const energy_kJ = points.map((p) => p.cum_energy_kJ);

  return {
    points,
    uPlotData: [x_km, elev_m, slope_deg, dose_mSv, energy_kJ],
    limitingBands,
  };
}

export interface RouteProfileChartProps {
  segments: SegmentData[];
  initialElevation_m?: number;
  width?: number;
  height?: number;
  onHover?: (distance_m: number | null) => void;
  className?: string;
}

export function RouteProfileChart({
  segments,
  initialElevation_m = -4500,
  width = 720,
  height = 240,
  onHover,
  className = "",
}: RouteProfileChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotInstanceRef = useRef<uPlot | null>(null);

  const chartData = transformRouteSegments(segments, initialElevation_m);

  useEffect(() => {
    if (!containerRef.current || chartData.points.length === 0) return;

    // Background bands plugin
    const limitingBandsPlugin = (): uPlot.Plugin => ({
      hooks: {
        drawClear: (u) => {
          const { ctx } = u;
          const { left, top, width: plotWidth, height: plotHeight } = u.bbox;
          ctx.save();
          ctx.beginPath();
          ctx.rect(left, top, plotWidth, plotHeight);
          ctx.clip();

          for (const band of chartData.limitingBands) {
            const x0 = u.valToPos(band.start_km, "x", true);
            const x1 = u.valToPos(band.end_km, "x", true);
            const hexColor =
              LIMITING_FACTOR_COLORS[band.factor] || "#56B4E9";
            ctx.fillStyle = hexColor + "22"; // 13% opacity tint
            ctx.fillRect(x0, top, x1 - x0, plotHeight);
          }
          ctx.restore();
        },
      },
    });

    const opts: uPlot.Options = {
      width,
      height,
      plugins: [limitingBandsPlugin()],
      cursor: {
        points: { size: 6, fill: "#E06A3B" },
      },
      hooks: {
        setCursor: [
          (u) => {
            if (!onHover) return;
            const idx = u.cursor.idx;
            if (idx !== null && idx !== undefined && chartData.points[idx]) {
              const pt = chartData.points[idx];
              if (pt) {
                onHover(pt.distance_m);
              }
            } else {
              onHover(null);
            }
          },
        ],
      },
      scales: {
        x: { time: false },
        elevation: { auto: true },
        slope: { range: [0, 35] },
        dose: { auto: true },
      },
      axes: [
        {
          label: "Traverse Distance (km)",
          stroke: "#9DA7B3",
          grid: { stroke: "rgba(230, 237, 243, 0.08)" },
        },
        {
          scale: "elevation",
          label: "Elevation (m)",
          stroke: "#56B4E9",
          grid: { stroke: "rgba(230, 237, 243, 0.08)" },
        },
        {
          scale: "slope",
          side: 1,
          label: "Slope (°)",
          stroke: "#F85149",
          grid: { show: false },
        },
      ],
      series: [
        {},
        {
          label: "Elevation",
          scale: "elevation",
          stroke: "#56B4E9",
          width: 2,
        },
        {
          label: "Slope",
          scale: "slope",
          stroke: "#F85149",
          width: 1.5,
          dash: [4, 4],
        },
        {
          label: "Dose",
          scale: "dose",
          stroke: "#A371F7",
          width: 1.5,
          show: false, // Available in series toggle
        },
        {
          label: "Energy",
          scale: "elevation",
          stroke: "#E69F00",
          width: 1.5,
          show: false,
        },
      ],
    };

    // Clean up previous instance
    if (plotInstanceRef.current) {
      plotInstanceRef.current.destroy();
      plotInstanceRef.current = null;
    }

    // Initialize new uPlot instance
    const plot = new uPlot(opts, chartData.uPlotData, containerRef.current);
    plotInstanceRef.current = plot;

    return () => {
      plot.destroy();
      plotInstanceRef.current = null;
    };
  }, [segments, initialElevation_m, width, height, onHover]);

  return (
    <div
      role="region"
      aria-label="Along-Route Elevation and Hazard Profile Chart"
      className={`route-profile-chart-container ${className}`.trim()}
    >
      <div className="route-profile-chart__header">
        <h3 className="route-profile-chart__title">Along-Route Profile</h3>

        <div className="route-profile-chart__legend-row">
          <div className="route-profile-chart__legend-item">
            <span
              className="route-profile-chart__legend-color"
              style={{ background: "#56B4E9" }}
            />
            <span>Elevation (m)</span>
          </div>
          <div className="route-profile-chart__legend-item">
            <span
              className="route-profile-chart__legend-color"
              style={{ background: "#F85149" }}
            />
            <span>Slope (°)</span>
          </div>
          <div className="route-profile-chart__legend-item">
            <span
              className="route-profile-chart__legend-color"
              style={{ background: "rgba(248, 81, 73, 0.3)" }}
            />
            <span>Limiting Factor Bands</span>
          </div>
        </div>
      </div>

      <div className="route-profile-chart__canvas-wrapper" ref={containerRef} />

      {/* Accessible Table Fallback for Screen Readers */}
      <table className="sr-only">
        <caption>Route Profile Points</caption>
        <thead>
          <tr>
            <th>Distance (km)</th>
            <th>Elevation (m)</th>
            <th>Slope (deg)</th>
            <th>Dose (mSv)</th>
            <th>Energy (kJ)</th>
            <th>Limiting Factor</th>
          </tr>
        </thead>
        <tbody>
          {chartData.points.map((pt, idx) => (
            <tr key={idx}>
              <td>{pt.distance_km}</td>
              <td>{pt.elevation_m}</td>
              <td>{pt.slope_deg}</td>
              <td>{pt.cum_dose_mSv}</td>
              <td>{pt.cum_energy_kJ}</td>
              <td>{pt.limiting_factor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
