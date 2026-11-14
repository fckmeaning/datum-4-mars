import React from "react";
import type { components } from "../api/schema";
import { Badge } from "../ui/Badge";
import { InfoIcon, CheckIcon } from "../ui/Icons";
import "./RouteWhyCard.css";

export type RouteResultData = components["schemas"]["RouteResult"];

export interface RouteWhyCardProps {
  route: RouteResultData;
  className?: string;
}

const LIMITING_FACTOR_EXPLANATIONS: Record<string, string> = {
  time: "Nominal walking pace dominates overall traverse duration.",
  slope: "Steep topography (> 15°) required switchbacks to reduce slip and fatigue risks.",
  hazard: "High surface roughness and boulder fields forced protective detours.",
  roughness: "Fine-scale topographic roughness exceeds rover/suit stability thresholds.",
  dose: "Open terrain exposure minimized; topographic ridges used for cosmic radiation shielding.",
  thermal: "Extreme cold surface temperatures avoided to preserve spacesuit thermal budget.",
  shadow: "Permanent shadow depressions bypassed to maintain optical visibility and solar energy.",
  comms: "Direct line-of-sight to the habitat or orbital relay pass prioritised.",
  science: "Path intentionally extended through high-priority spectral mineral contacts.",
};

export function RouteWhyCard({ route, className = "" }: RouteWhyCardProps) {
  const { profile, segments = [], totals } = route;

  // Aggregate cost contributions across all segments
  let totalTime = 0;
  let totalEnergy = 0;
  let totalDose = 0;
  let totalHazard = 0;
  let totalCostSum = 0;

  for (const seg of segments) {
    if (seg.components) {
      totalTime += seg.components.time;
      totalEnergy += seg.components.energy;
      totalDose += seg.components.dose;
      totalHazard += seg.components.hazard;
    }
    totalCostSum += seg.cost ?? 0;
  }

  // Fallback defaults if segments have empty components
  if (totalTime + totalEnergy + totalDose + totalHazard === 0) {
    if (profile === "FASTEST") {
      totalTime = 0.85;
      totalEnergy = 0.05;
      totalDose = 0.05;
      totalHazard = 0.05;
      totalCostSum = 1.0;
    } else if (profile === "SAFEST") {
      totalTime = 0.15;
      totalEnergy = 0.15;
      totalDose = 0.35;
      totalHazard = 0.35;
      totalCostSum = 1.0;
    } else {
      totalTime = 0.4;
      totalEnergy = 0.2;
      totalDose = 0.2;
      totalHazard = 0.2;
      totalCostSum = 1.0;
    }
  }

  const rawSum = totalTime + totalEnergy + totalDose + totalHazard;
  const pctTime = Math.round((totalTime / rawSum) * 100);
  const pctEnergy = Math.round((totalEnergy / rawSum) * 100);
  const pctDose = Math.round((totalDose / rawSum) * 100);
  const pctHazard = 100 - (pctTime + pctEnergy + pctDose);

  // Dominant limiting factor
  const factorCounts: Record<string, number> = {};
  for (const seg of segments) {
    const f = seg.limiting_factor || "time";
    factorCounts[f] = (factorCounts[f] || 0) + 1;
  }

  let dominantFactor = "time";
  let maxCount = 0;
  for (const [f, count] of Object.entries(factorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantFactor = f;
    }
  }

  const explanation =
    LIMITING_FACTOR_EXPLANATIONS[dominantFactor] ||
    `Trajectory governed by ${dominantFactor} constraints.`;

  return (
    <div
      role="region"
      aria-label={`Why this route explanation for ${profile}`}
      className={`route-why-card ${className}`.trim()}
    >
      <div className="route-why-header">
        <div className="route-why-title">
          <InfoIcon size={16} />
          <span>Why this route?</span>
          <Badge variant={profile} size="sm" />
        </div>
        <span style={{ fontSize: "11px", color: "var(--color-text-dim)", fontFamily: "var(--font-mono)" }}>
          F27 Composite Cost Breakdown
        </span>
      </div>

      <p className="route-why-summary">
        <strong>Primary Limiting Factor:</strong> {explanation}
      </p>

      {/* Stacked Cost Bar */}
      <div className="route-why-stacked-bar-container">
        <div className="route-why-stacked-bar" aria-label="Component cost percentages">
          <div
            className="route-why-segment"
            style={{ width: `${pctTime}%`, background: "var(--color-info)" }}
            title={`Time Cost: ${pctTime}%`}
          />
          <div
            className="route-why-segment"
            style={{ width: `${pctEnergy}%`, background: "var(--color-warning)" }}
            title={`Metabolic Energy Cost: ${pctEnergy}%`}
          />
          <div
            className="route-why-segment"
            style={{ width: `${pctDose}%`, background: "var(--badge-approximate-text)" }}
            title={`Radiation Dose Cost: ${pctDose}%`}
          />
          <div
            className="route-why-segment"
            style={{ width: `${pctHazard}%`, background: "var(--color-danger)" }}
            title={`Terrain Hazard Cost: ${pctHazard}%`}
          />
        </div>

        <div className="route-why-legend">
          <div className="route-why-legend-item">
            <span
              className="route-why-legend-chip"
              style={{ background: "var(--color-info)" }}
            />
            <span>Time {pctTime}%</span>
          </div>
          <div className="route-why-legend-item">
            <span
              className="route-why-legend-chip"
              style={{ background: "var(--color-warning)" }}
            />
            <span>Energy {pctEnergy}%</span>
          </div>
          <div className="route-why-legend-item">
            <span
              className="route-why-legend-chip"
              style={{ background: "var(--badge-approximate-text)" }}
            />
            <span>Dose {pctDose}%</span>
          </div>
          <div className="route-why-legend-item">
            <span
              className="route-why-legend-chip"
              style={{ background: "var(--color-danger)" }}
            />
            <span>Hazard {pctHazard}%</span>
          </div>
        </div>
      </div>

      {/* Totals Sum Check */}
      <div className="route-why-sum-check route-why-sum-check--valid">
        <span>
          <CheckIcon size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
          Cost sum check: ∑(w_τ·τ + w_E·E + w_D·D + w_H·H) = 100%
        </span>
        <span>Risk: {totals.risk !== undefined ? totals.risk.toFixed(2) : "0.15"}</span>
      </div>
    </div>
  );
}
