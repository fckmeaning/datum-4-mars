import React from "react";
import { LayersIcon, EyeIcon, EyeOffIcon } from "./Icons";
import { Badge } from "./Badge";
import { IconButton } from "./IconButton";
import "./LayerSwitcher.css";

export interface LayerItem {
  id: string;
  name: string;
  family: string;
  visible: boolean;
  opacity: number; // 0 to 1
  simulated?: boolean;
  thumbnailUrl?: string;
  resolution?: string;
  isBase?: boolean;
}

export interface LayerSwitcherProps {
  layers: LayerItem[];
  onToggle: (layerId: string, visible: boolean) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
  activeBaseLayer?: string;
  onSelectBaseLayer?: (layerId: string) => void;
  className?: string;
}

export function LayerSwitcher({
  layers,
  onToggle,
  onOpacityChange,
  activeBaseLayer,
  onSelectBaseLayer,
  className = "",
}: LayerSwitcherProps) {
  const baseLayers = layers.filter((l) => l.isBase);
  const dataLayers = layers.filter((l) => !l.isBase);

  return (
    <div className={`layer-switcher ${className}`.trim()} role="region" aria-label="Layer Switcher">
      <div className="layer-switcher__header">
        <span className="layer-switcher__title">
          <LayersIcon size={16} />
          Layers
        </span>
      </div>

      {baseLayers.length > 0 && (
        <div className="layer-switcher__base-grid" role="radiogroup" aria-label="Base map imagery">
          {baseLayers.map((layer) => {
            const isActive = activeBaseLayer === layer.id;
            return (
              <button
                key={layer.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onSelectBaseLayer?.(layer.id)}
                className={`layer-switcher__base-button ${
                  isActive ? "layer-switcher__base-button--active" : ""
                }`}
              >
                <div
                  className="layer-switcher__thumbnail"
                  style={
                    layer.thumbnailUrl
                      ? { backgroundImage: `url(${layer.thumbnailUrl})` }
                      : undefined
                  }
                >
                  {!layer.thumbnailUrl && <LayersIcon size={20} />}
                </div>
                <span className="layer-switcher__base-label">{layer.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="layer-switcher__layers-list" aria-label="Analytical overlay layers">
        {dataLayers.map((layer) => (
          <li key={layer.id} className="layer-switcher__layer-item">
            <div className="layer-switcher__layer-row">
              <div className="layer-switcher__layer-info">
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={layer.visible ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />}
                  label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  onClick={() => onToggle(layer.id, !layer.visible)}
                />
                <span className="layer-switcher__layer-name" title={layer.name}>
                  {layer.name}
                </span>
                {layer.simulated && (
                  <Badge variant="SIMULATED" size="sm" />
                )}
              </div>
            </div>

            {layer.visible && (
              <div className="layer-switcher__opacity-slider">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={layer.opacity}
                  aria-label={`${layer.name} opacity`}
                  onChange={(e) =>
                    onOpacityChange(layer.id, parseFloat(e.target.value))
                  }
                  className="layer-switcher__slider-input"
                />
                <span className="layer-switcher__slider-value">
                  {Math.round(layer.opacity * 100)}%
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
