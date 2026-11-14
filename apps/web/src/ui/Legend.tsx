import React from "react";
import "./Legend.css";

export interface CategoricalItem {
  label: string;
  color: string;
  value?: string | number;
}

export interface LegendProps {
  title: string;
  unit?: string;
  type?: "continuous" | "categorical";
  // Continuous props
  min?: number;
  max?: number;
  colormap?: "cividis" | "magma" | "inferno" | "plasma" | "viridis" | string;
  gradient?: string;
  // Categorical props
  items?: CategoricalItem[];
  className?: string;
}

const COLORMAP_GRADIENTS: Record<string, string> = {
  cividis: "linear-gradient(to right, #00204d, #414d6b, #7c7b78, #bdaf6f, #ffea46)",
  magma: "linear-gradient(to right, #000004, #51127c, #b73779, #fc8961, #fcfdbf)",
  inferno: "linear-gradient(to right, #000004, #57106e, #bb3754, #f98e09, #fcffa4)",
  plasma: "linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #fca636, #f0f921)",
  viridis: "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)",
};

export function Legend({
  title,
  unit,
  type = "continuous",
  min = 0,
  max = 100,
  colormap = "cividis",
  gradient,
  items = [],
  className = "",
}: LegendProps) {
  const effectiveGradient =
    gradient || COLORMAP_GRADIENTS[colormap] || COLORMAP_GRADIENTS.cividis;

  return (
    <div
      role="region"
      aria-label={`Legend for ${title}`}
      className={`legend ${className}`.trim()}
    >
      <div className="legend__header">
        <span className="legend__title">{title}</span>
        {unit && <span className="legend__unit">{unit}</span>}
      </div>

      {type === "continuous" ? (
        <div className="legend__ramp-container">
          <div
            className="legend__ramp"
            style={{ background: effectiveGradient }}
            aria-hidden="true"
          />
          <div className="legend__ticks">
            <span>{min}</span>
            <span>{((min + max) / 2).toFixed(min % 1 !== 0 || max % 1 !== 0 ? 1 : 0)}</span>
            <span>{max}</span>
          </div>
        </div>
      ) : (
        <ul className="legend__categorical-list" aria-label={`Categories for ${title}`}>
          {items.map((item, idx) => (
            <li key={idx} className="legend__categorical-item">
              <span
                className="legend__color-chip"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="legend__category-label">{item.label}</span>
              {item.value !== undefined && (
                <span className="legend__category-value">{item.value}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
