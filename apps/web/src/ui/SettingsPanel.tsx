import React from "react";
import { SettingsIcon } from "./Icons";
import "./SettingsPanel.css";

export interface SettingsState {
  units: "metric";
  language: "en" | "ru";
  reducedMotion: boolean;
  verticalExaggeration: number; // 1.0 to 5.0
  astronaut: {
    mass_astronaut_kg: number;
    mass_suit_kg: number;
    mass_payload_kg: number;
    v_flat_m_s: number;
    theta_max_deg: number;
    eva_max_h: number;
    o2_capacity_l: number;
    reserve_fraction: number;
  };
}

export const DEFAULT_SETTINGS: SettingsState = {
  units: "metric",
  language: "en",
  reducedMotion: false,
  verticalExaggeration: 1.5,
  astronaut: {
    mass_astronaut_kg: 80,
    mass_suit_kg: 90,
    mass_payload_kg: 15,
    v_flat_m_s: 1.0,
    theta_max_deg: 25,
    eva_max_h: 7.0,
    o2_capacity_l: 450,
    reserve_fraction: 0.25,
  },
};

export interface SettingsPanelProps {
  settings: SettingsState;
  onUpdate: (updated: Partial<SettingsState>) => void;
  onUpdateAstronaut?: (astronaut: Partial<SettingsState["astronaut"]>) => void;
  onReset?: () => void;
  className?: string;
}

export function SettingsPanel({
  settings,
  onUpdate,
  onUpdateAstronaut,
  onReset,
  className = "",
}: SettingsPanelProps) {
  const handleAstronautChange = (
    key: keyof SettingsState["astronaut"],
    value: number
  ) => {
    if (onUpdateAstronaut) {
      onUpdateAstronaut({ [key]: value });
    } else {
      onUpdate({
        astronaut: {
          ...settings.astronaut,
          [key]: value,
        },
      });
    }
  };

  return (
    <div
      role="region"
      aria-label="Simulation and Mission Settings"
      className={`settings-panel ${className}`.trim()}
    >
      <div className="settings-panel__header">
        <h2 className="settings-panel__title">
          <SettingsIcon size={20} />
          Settings
        </h2>
      </div>

      {/* General / UX */}
      <section className="settings-panel__section">
        <h3 className="settings-panel__section-title">General & Display</h3>

        <div className="settings-panel__grid">
          <div className="settings-panel__field">
            <label htmlFor="settings-units" className="settings-panel__label">
              Units
            </label>
            <select
              id="settings-units"
              value={settings.units}
              disabled
              aria-label="Units"
              className="settings-panel__select"
            >
              <option value="metric">Metric (SI, km, °C)</option>
            </select>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="settings-lang" className="settings-panel__label">
              Language
            </label>
            <select
              id="settings-lang"
              value={settings.language}
              aria-label="Language"
              onChange={(e) =>
                onUpdate({ language: e.target.value as "en" | "ru" })
              }
              className="settings-panel__select"
            >
              <option value="en">English (Default)</option>
              <option value="ru">Русский (P1)</option>
            </select>
          </div>
        </div>

        <div className="settings-panel__field">
          <div className="settings-panel__label">
            <span>3D Vertical Exaggeration</span>
            <span>{settings.verticalExaggeration.toFixed(1)}x</span>
          </div>
          <div className="settings-panel__slider-row">
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              aria-label="3D Vertical Exaggeration"
              value={settings.verticalExaggeration}
              onChange={(e) =>
                onUpdate({ verticalExaggeration: parseFloat(e.target.value) })
              }
              className="settings-panel__slider"
            />
          </div>
        </div>

        <div className="settings-panel__toggle-row">
          <label htmlFor="reduced-motion-toggle" className="settings-panel__label">
            Reduced Motion
          </label>
          <input
            id="reduced-motion-toggle"
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(e) => onUpdate({ reducedMotion: e.target.checked })}
          />
        </div>
      </section>

      {/* Astronaut & Suit Limits */}
      <section className="settings-panel__section">
        <h3 className="settings-panel__section-title">
          Astronaut & Suit Physical Parameters (params.yaml)
        </h3>

        <div className="settings-panel__grid">
          <div className="settings-panel__field">
            <label htmlFor="mass-astronaut" className="settings-panel__label">
              Astronaut Body Mass
            </label>
            <div className="settings-panel__input-row">
              <input
                id="mass-astronaut"
                type="number"
                min="40"
                max="150"
                step="1"
                value={settings.astronaut.mass_astronaut_kg}
                onChange={(e) =>
                  handleAstronautChange("mass_astronaut_kg", parseFloat(e.target.value) || 0)
                }
                className="settings-panel__input"
              />
              <span className="settings-panel__unit">kg</span>
            </div>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="mass-suit" className="settings-panel__label">
              Suit Mass (Apollo-class)
            </label>
            <div className="settings-panel__input-row">
              <input
                id="mass-suit"
                type="number"
                min="40"
                max="160"
                step="1"
                value={settings.astronaut.mass_suit_kg}
                onChange={(e) =>
                  handleAstronautChange("mass_suit_kg", parseFloat(e.target.value) || 0)
                }
                className="settings-panel__input"
              />
              <span className="settings-panel__unit">kg</span>
            </div>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="mass-payload" className="settings-panel__label">
              Carried Payload
            </label>
            <div className="settings-panel__input-row">
              <input
                id="mass-payload"
                type="number"
                min="0"
                max="50"
                step="1"
                value={settings.astronaut.mass_payload_kg}
                onChange={(e) =>
                  handleAstronautChange("mass_payload_kg", parseFloat(e.target.value) || 0)
                }
                className="settings-panel__input"
              />
              <span className="settings-panel__unit">kg</span>
            </div>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="v-flat" className="settings-panel__label">
              Nominal Flat Speed
            </label>
            <div className="settings-panel__input-row">
              <input
                id="v-flat"
                type="number"
                min="0.4"
                max="2.0"
                step="0.1"
                value={settings.astronaut.v_flat_m_s}
                onChange={(e) =>
                  handleAstronautChange("v_flat_m_s", parseFloat(e.target.value) || 0)
                }
                className="settings-panel__input"
              />
              <span className="settings-panel__unit">m/s</span>
            </div>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="theta-max" className="settings-panel__label">
              Max Traverse Slope
            </label>
            <div className="settings-panel__input-row">
              <input
                id="theta-max"
                type="number"
                min="10"
                max="40"
                step="1"
                value={settings.astronaut.theta_max_deg}
                onChange={(e) =>
                  handleAstronautChange("theta_max_deg", parseFloat(e.target.value) || 0)
                }
                className="settings-panel__input"
              />
              <span className="settings-panel__unit">deg</span>
            </div>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="eva-max" className="settings-panel__label">
              Max EVA Duration
            </label>
            <div className="settings-panel__input-row">
              <input
                id="eva-max"
                type="number"
                min="2"
                max="12"
                step="0.5"
                value={settings.astronaut.eva_max_h}
                onChange={(e) =>
                  handleAstronautChange("eva_max_h", parseFloat(e.target.value) || 0)
                }
                className="settings-panel__input"
              />
              <span className="settings-panel__unit">hours</span>
            </div>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="o2-cap" className="settings-panel__label">
              O2 Primary Tank
            </label>
            <div className="settings-panel__input-row">
              <input
                id="o2-cap"
                type="number"
                min="200"
                max="800"
                step="10"
                value={settings.astronaut.o2_capacity_l}
                onChange={(e) =>
                  handleAstronautChange("o2_capacity_l", parseFloat(e.target.value) || 0)
                }
                className="settings-panel__input"
              />
              <span className="settings-panel__unit">litres</span>
            </div>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="res-frac" className="settings-panel__label">
              Emergency Reserve
            </label>
            <div className="settings-panel__input-row">
              <input
                id="res-frac"
                type="number"
                min="0.1"
                max="0.5"
                step="0.05"
                value={settings.astronaut.reserve_fraction}
                onChange={(e) =>
                  handleAstronautChange("reserve_fraction", parseFloat(e.target.value) || 0)
                }
                className="settings-panel__input"
              />
              <span className="settings-panel__unit">fraction</span>
            </div>
          </div>
        </div>
      </section>

      {onReset && (
        <div className="settings-panel__footer">
          <button
            type="button"
            onClick={onReset}
            className="settings-panel__reset-btn"
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
}
