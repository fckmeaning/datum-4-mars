import React, { useState, useEffect } from "react";
import { Badge } from "./Badge";
import { ChevronDownIcon, ChevronUpIcon } from "./Icons";
import "./LayerDock.css";

export interface DockLayerItem {
  id: string;
  shortcutNumber: number; // 1 to 6
  name: string;
  family: string;
  source: string;
  visible: boolean;
  opacity: number;
  simulated?: boolean;
  approximate?: boolean;
}

export interface LayerDockProps {
  layers: DockLayerItem[];
  onToggle: (id: string, visible: boolean) => void;
  onOpacity: (id: string, opacity: number) => void;
  className?: string;
}

export function LayerDock({
  layers,
  onToggle,
  onOpacity,
  className = "",
}: LayerDockProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Keyboard shortcut listener: digits 1–6 toggle corresponding layer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if focus is in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 6) {
        const matchingLayer = layers.find((l) => l.shortcutNumber === num);
        if (matchingLayer) {
          e.preventDefault();
          onToggle(matchingLayer.id, !matchingLayer.visible);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layers, onToggle]);

  return (
    <div
      role="region"
      aria-label="Orbital Data Layers"
      className={`layer-dock ${className}`.trim()}
    >
      <div className="layer-dock__header">
        <span className="layer-dock__title">Orbital Data Layers</span>
        <span className="layer-dock__subtitle">Keys 1–6</span>
      </div>

      <ul className="layer-dock__list">
        {layers.map((layer) => {
          const isExpanded = expandedId === layer.id;
          return (
            <li
              key={layer.id}
              className={`layer-dock__item ${
                layer.visible ? "layer-dock__item--active" : ""
              }`}
            >
              <div className="layer-dock__item-main">
                <span
                  className="layer-dock__shortcut"
                  title={`Press ${layer.shortcutNumber} to toggle`}
                >
                  {layer.shortcutNumber}
                </span>

                <div className="layer-dock__checkbox-wrapper">
                  <input
                    type="checkbox"
                    id={`layer-dock-check-${layer.id}`}
                    checked={layer.visible}
                    onChange={(e) => onToggle(layer.id, e.target.checked)}
                    aria-label={`Toggle ${layer.name}`}
                    className="layer-dock__checkbox"
                  />
                </div>

                <div className="layer-dock__info">
                  <div className="layer-dock__name-row">
                    <label
                      htmlFor={`layer-dock-check-${layer.id}`}
                      className="layer-dock__name"
                      title={layer.name}
                    >
                      {layer.name}
                    </label>
                    {layer.simulated && (
                      <Badge variant="SIMULATED" size="sm" />
                    )}
                    {layer.approximate && (
                      <Badge variant="APPROXIMATE" size="sm" />
                    )}
                  </div>
                  <span className="layer-dock__source">{layer.source}</span>
                </div>

                <button
                  type="button"
                  className="layer-dock__expand-btn"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : layer.id)
                  }
                  aria-label={isExpanded ? "Collapse opacity" : "Expand opacity"}
                >
                  {isExpanded ? (
                    <ChevronUpIcon size={14} />
                  ) : (
                    <ChevronDownIcon size={14} />
                  )}
                </button>
              </div>

              {isExpanded && (
                <div className="layer-dock__slider-row">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={layer.opacity}
                    aria-label={`${layer.name} opacity`}
                    onChange={(e) =>
                      onOpacity(layer.id, parseFloat(e.target.value))
                    }
                    className="layer-dock__slider"
                  />
                  <span className="layer-dock__slider-label">
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
