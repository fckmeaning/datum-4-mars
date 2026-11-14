import React, { useState } from "react";
import { GlassPanel } from "./GlassPanel";
import { IconButton } from "./IconButton";
import { MenuButton } from "./MenuButton";
import { SearchBox, SearchSuggestion } from "./SearchBox";
import { BottomSheet, SnapPoint } from "./BottomSheet";
import { Badge } from "./Badge";
import { RouteCard } from "./RouteCard";
import { LayerSwitcher, LayerItem } from "./LayerSwitcher";
import { Legend } from "./Legend";
import { StatTile } from "./StatTile";
import { Toast } from "./Toast";
import { SettingsPanel, DEFAULT_SETTINGS, SettingsState } from "./SettingsPanel";
import { Hud } from "../hud/Hud";
import {
  CompassIcon,
  LocationIcon,
  LayersIcon,
  PlayIcon,
  SettingsIcon,
  InfoIcon,
  ExitIcon,
  RadiationIcon,
  OxygenIcon,
  ClockIcon,
  ShieldIcon,
  ZapIcon,
} from "./Icons";
import type { components } from "../api/schema";
import "./UiKitPage.css";

const MOCK_SUGGESTIONS: SearchSuggestion[] = [
  { id: "bradbury", title: "Bradbury Landing (Habitat)", subtitle: "-4.59°, 137.44°", kind: "base" },
  { id: "boxwork", title: "Boxwork Outcrop Target", subtitle: "Mount Sharp lower slopes", kind: "science" },
  { id: "yellowknife", title: "Yellowknife Bay", subtitle: "Lacustrine mudstone", kind: "mission" },
  { id: "namib", title: "Namib Dune", subtitle: "Active barchan sand field", kind: "landmark" },
];

const SAMPLE_ROUTES: components["schemas"]["RouteResult"][] = [
  {
    route_id: "fastest-1",
    site_id: "gale",
    profile: "FASTEST",
    geometry: { type: "LineString", coordinates: [[137.44, -4.59], [137.46, -4.62]] },
    xy: [[0, 0], [600, -800]],
    totals: {
      time_s: 3420,
      length_m: 2840,
      ascent_m: 64,
      descent_m: 12,
      max_slope_deg: 18.2,
      dose_mSv: 0.08,
      energy_kJ: 1140,
      o2_l: 68,
      risk: 0.15,
    },
    segments: [],
    feasibility: { ok: true, violations: [] },
    assumptions: [],
    data_levels: ["L2"],
    simulated_inputs: [],
  },
  {
    route_id: "safest-1",
    site_id: "gale",
    profile: "SAFEST",
    geometry: { type: "LineString", coordinates: [[137.44, -4.59], [137.47, -4.63]] },
    xy: [[0, 0], [700, -950]],
    totals: {
      time_s: 4180,
      length_m: 3410,
      ascent_m: 42,
      descent_m: 10,
      max_slope_deg: 9.8,
      dose_mSv: 0.05,
      energy_kJ: 980,
      o2_l: 74,
      risk: 0.08,
    },
    segments: [],
    feasibility: { ok: true, violations: [] },
    assumptions: [],
    data_levels: ["L2"],
    simulated_inputs: [],
  },
  {
    route_id: "balanced-1",
    site_id: "gale",
    profile: "BALANCED",
    geometry: { type: "LineString", coordinates: [[137.44, -4.59], [137.46, -4.62]] },
    xy: [[0, 0], [650, -880]],
    totals: {
      time_s: 3680,
      length_m: 3050,
      ascent_m: 51,
      descent_m: 11,
      max_slope_deg: 12.4,
      dose_mSv: 0.06,
      energy_kJ: 1040,
      o2_l: 71,
      risk: 0.11,
    },
    segments: [],
    feasibility: { ok: true, violations: [] },
    assumptions: [],
    data_levels: ["L2"],
    simulated_inputs: [],
  },
  {
    route_id: "science-1",
    site_id: "gale",
    profile: "SCIENCE",
    geometry: { type: "LineString", coordinates: [[137.44, -4.59], [137.48, -4.64]] },
    xy: [[0, 0], [820, -1100]],
    totals: {
      time_s: 4890,
      length_m: 3950,
      ascent_m: 78,
      descent_m: 24,
      max_slope_deg: 14.5,
      dose_mSv: 0.11,
      energy_kJ: 1390,
      o2_l: 92,
      risk: 0.18,
    },
    segments: [],
    feasibility: {
      ok: false,
      violations: [{ kind: "SLOPE_CAUTION", message: "Slope reaches 14.5° on ridge" }],
    },
    assumptions: [],
    data_levels: ["L2"],
    simulated_inputs: [],
  },
];

const INITIAL_LAYERS: LayerItem[] = [
  { id: "sat", name: "Satellite (HiRISE/CTX)", family: "optical", visible: true, opacity: 1.0, isBase: true },
  { id: "terrain", name: "Terrain Elevation", family: "topography", visible: true, opacity: 1.0, isBase: true },
  { id: "slope", name: "Slope Hazard (F05)", family: "topography", visible: true, opacity: 0.8 },
  { id: "thermal", name: "Surface Temp (THEMIS)", family: "thermal", visible: false, opacity: 0.7 },
  { id: "radiation", name: "Dose Rate (RAD)", family: "radiation", visible: true, opacity: 0.65 },
  { id: "dust", name: "Dust Optical Depth τ", family: "atmosphere", visible: false, opacity: 0.5, simulated: true },
];

export function UiKitPage() {
  const [selectedRouteId, setSelectedRouteId] = useState("fastest-1");
  const [layers, setLayers] = useState<LayerItem[]>(INITIAL_LAYERS);
  const [activeBaseLayer, setActiveBaseLayer] = useState("sat");
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<SnapPoint>("half");
  const [toastVisible, setToastVisible] = useState(true);

  const handleToggleLayer = (id: string, visible: boolean) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible } : l)));
  };

  const handleOpacityChange = (id: string, opacity: number) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, opacity } : l)));
  };

  return (
    <div className="uikit-page">
      <div className="uikit-page__container">
        {/* Header */}
        <header className="uikit-page__header">
          <h1 className="uikit-page__title">
            <span>AreoNav</span>
            <Badge variant="LIVE">Design System</Badge>
          </h1>
          <p className="uikit-page__subtitle">
            Mission Control Dark Theme • WCAG AA/AAA Verified Contrast • 8pt Grid • Inter & JetBrains Mono
          </p>
        </header>

        {/* 1. Color Tokens & Contrast */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Design Tokens & Contrast</h2>
            <span className="uikit-page__section-desc">WCAG Verified Ratios</span>
          </div>

          <div className="uikit-page__swatches">
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#0B0F14" }} />
              <span className="uikit-page__swatch-name">Background</span>
              <span className="uikit-page__swatch-hex">#0B0F14</span>
            </div>
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#121821" }} />
              <span className="uikit-page__swatch-name">Surface</span>
              <span className="uikit-page__swatch-hex">#121821</span>
            </div>
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#E6EDF3" }} />
              <span className="uikit-page__swatch-name">Text Primary</span>
              <span className="uikit-page__swatch-hex">#E6EDF3</span>
              <span className="uikit-page__swatch-contrast">15.2:1 (AAA)</span>
            </div>
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#9DA7B3" }} />
              <span className="uikit-page__swatch-name">Text Muted</span>
              <span className="uikit-page__swatch-hex">#9DA7B3</span>
              <span className="uikit-page__swatch-contrast">7.4:1 (AAA)</span>
            </div>
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#E06A3B" }} />
              <span className="uikit-page__swatch-name">Mars Ochre</span>
              <span className="uikit-page__swatch-hex">#E06A3B</span>
              <span className="uikit-page__swatch-contrast">5.4:1 (AA)</span>
            </div>
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#56B4E9" }} />
              <span className="uikit-page__swatch-name">Route Fastest</span>
              <span className="uikit-page__swatch-hex">#56B4E9</span>
            </div>
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#009E73" }} />
              <span className="uikit-page__swatch-name">Route Safest</span>
              <span className="uikit-page__swatch-hex">#009E73</span>
            </div>
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#E69F00" }} />
              <span className="uikit-page__swatch-name">Route Balanced</span>
              <span className="uikit-page__swatch-hex">#E69F00</span>
            </div>
            <div className="uikit-page__swatch">
              <div className="uikit-page__swatch-color" style={{ background: "#CC79A7" }} />
              <span className="uikit-page__swatch-name">Route Science</span>
              <span className="uikit-page__swatch-hex">#CC79A7</span>
            </div>
          </div>
        </section>

        {/* 2. Game-Style Menu Buttons (D-11) */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Start Menu Controls (D-11)</h2>
            <span className="uikit-page__section-desc">Game-style large controls with glow & hover</span>
          </div>

          <div className="uikit-page__game-menu">
            <MenuButton
              variant="primary"
              title="Start Simulation"
              subtitle="Flyby from Mars Orbit into Gale Crater"
              icon={<PlayIcon size={24} />}
              badge={<Badge variant="LIVE">Ready</Badge>}
            />
            <MenuButton
              title="Settings"
              subtitle="Astronaut Mass, Suit, Limits & Exaggeration"
              icon={<SettingsIcon size={24} />}
            />
            <MenuButton
              title="About / Methods"
              subtitle="Functions F01–F53, JPL Curiosity Baseline"
              icon={<InfoIcon size={24} />}
            />
            <MenuButton
              variant="danger"
              title="Exit Simulation"
              subtitle="Return to Operating System / Standby"
              icon={<ExitIcon size={24} />}
            />
          </div>
        </section>

        {/* 3. Glass Panels & Icon Buttons */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Panels & Icon Buttons</h2>
            <span className="uikit-page__section-desc">Backdrop blur and glove-size touch targets</span>
          </div>

          <div className="uikit-page__grid-3">
            <GlassPanel variant="default" padding="md">
              <h3 style={{ fontSize: "14px", marginBottom: "8px", fontWeight: 600 }}>Default GlassPanel</h3>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                Translucent background with backdrop-filter blur and subtle border.
              </p>
            </GlassPanel>

            <GlassPanel variant="elevated" padding="md">
              <h3 style={{ fontSize: "14px", marginBottom: "8px", fontWeight: 600 }}>Elevated GlassPanel</h3>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                Enhanced surface shadow for higher z-index overlays and tooltips.
              </p>
            </GlassPanel>

            <GlassPanel variant="bordered" padding="md">
              <h3 style={{ fontSize: "14px", marginBottom: "8px", fontWeight: 600 }}>Bordered GlassPanel</h3>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                Mars Ochre border accent for active mission alerts and target selection.
              </p>
            </GlassPanel>
          </div>

          <div className="uikit-page__row">
            <IconButton size="sm" icon={<CompassIcon size={16} />} label="Compass Small" />
            <IconButton size="md" icon={<CompassIcon size={18} />} label="Compass Medium" />
            <IconButton size="lg" icon={<CompassIcon size={22} />} label="Compass Large" />
            <IconButton size="glove" variant="primary" icon={<LocationIcon size={28} />} label="Spacesuit Glove Target (64px)" />
            <IconButton size="md" variant="danger" icon={<RadiationIcon size={18} />} label="Danger Button" />
            <IconButton size="md" variant="ghost" icon={<LayersIcon size={18} />} label="Ghost Button" />
            <IconButton size="md" active icon={<ShieldIcon size={18} />} label="Active State" />
          </div>
        </section>

        {/* 4. SearchBox & Badges */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">SearchBox & Data Fidelity Badges</h2>
            <span className="uikit-page__section-desc">Fuzzy query with suggestions and hard rule data labels</span>
          </div>

          <div style={{ maxWidth: 460 }}>
            <SearchBox suggestions={MOCK_SUGGESTIONS} placeholder="Search Gale landmarks, boxwork, coordinates..." />
          </div>

          <div className="uikit-page__row">
            <Badge variant="SIMULATED" />
            <Badge variant="APPROXIMATE" />
            <Badge variant="REPLAY" />
            <Badge variant="LIVE" />
            <Badge variant="FASTEST" />
            <Badge variant="SAFEST" />
            <Badge variant="BALANCED" />
            <Badge variant="SCIENCE" />
            <Badge variant="ok">Optimal</Badge>
            <Badge variant="warning">Caution</Badge>
            <Badge variant="danger">Exceeded</Badge>
          </div>
        </section>

        {/* 5. Route Cards Alternatives */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Route Alternatives (A* F28 / Pareto F32)</h2>
            <span className="uikit-page__section-desc">Selection, risk rating, totals and violation indicators</span>
          </div>

          <div className="uikit-page__grid-2">
            {SAMPLE_ROUTES.map((route) => (
              <RouteCard
                key={route.route_id}
                route={route}
                selected={selectedRouteId === route.route_id}
                onSelect={(id) => setSelectedRouteId(id)}
              />
            ))}
          </div>
        </section>

        {/* 6. Layer Switcher & Legends */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Layer Switcher & Map Legends</h2>
            <span className="uikit-page__section-desc">Base and overlay layers with opacity control and colormaps</span>
          </div>

          <div className="uikit-page__grid-2">
            <LayerSwitcher
              layers={layers}
              onToggle={handleToggleLayer}
              onOpacityChange={handleOpacityChange}
              activeBaseLayer={activeBaseLayer}
              onSelectBaseLayer={(id) => setActiveBaseLayer(id)}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Legend title="Elevation" unit="m (MOLA)" type="continuous" min={-4500} max={-3200} colormap="cividis" />
              <Legend title="Slope" unit="degrees" type="continuous" min={0} max={30} colormap="magma" />
              <Legend title="Surface Temperature" unit="K" type="continuous" min={180} max={275} colormap="inferno" />
              <Legend title="Radiation Dose Rate" unit="mSv/day" type="continuous" min={0.45} max={0.85} colormap="plasma" />
              <Legend
                title="Limiting Factor (F37)"
                type="categorical"
                items={[
                  { label: "Nominal Velocity", color: "#56B4E9", value: "Tobler" },
                  { label: "Slope Friction", color: "#E69F00", value: "> 15°" },
                  { label: "Radiation Shadow", color: "#CC79A7", value: "RAD" },
                  { label: "Steep Incline Limit", color: "#F85149", value: "> 25°" },
                ]}
              />
            </div>
          </div>
        </section>

        {/* 7. Stat Tiles & Toasts */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Stat Tiles & Notifications</h2>
            <span className="uikit-page__section-desc">Mission telemetry and accessible toasts</span>
          </div>

          <div className="uikit-page__row">
            <StatTile label="Traverse Distance" value="3.41" unit="km" icon={<LocationIcon size={16} />} />
            <StatTile label="Est. Duration" value="1h 09m" unit="LTST" icon={<ClockIcon size={16} />} />
            <StatTile label="Oxygen Remaining" value="84" unit="%" icon={<OxygenIcon size={16} />} status="ok" subtitle="378 L in PLSS" />
            <StatTile label="EVA Dose" value="0.14" unit="mSv" icon={<RadiationIcon size={16} />} status="warning" subtitle="Limit: 0.50 mSv" />
            <StatTile label="Max Incline" value="26.4" unit="deg" icon={<ZapIcon size={16} />} status="danger" subtitle="Exceeds 25° walk limit" />
          </div>

          {toastVisible && (
            <div style={{ marginTop: "16px" }}>
              <Toast
                id="toast-sep"
                title="Space Weather Alert (REPLAY)"
                message="Solar Energetic Particle event detected by DONKI. Radiation dose rate multiplier 1.6x applied."
                severity="danger"
                action={{ label: "Reroute to Shelter", onClick: () => alert("Reroute clicked") }}
                onDismiss={() => setToastVisible(false)}
              />
            </div>
          )}
        </section>

        {/* 8. Settings Panel */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Mission Settings Panel</h2>
            <span className="uikit-page__section-desc">Editable physical parameters wired to params.yaml</span>
          </div>

          <SettingsPanel
            settings={settings}
            onUpdate={(u) => setSettings((s) => ({ ...s, ...u }))}
            onUpdateAstronaut={(a) =>
              setSettings((s) => ({
                ...s,
                astronaut: { ...s.astronaut, ...a },
              }))
            }
            onReset={() => setSettings(DEFAULT_SETTINGS)}
          />
        </section>

        {/* 9. Helmet-HUD Mode */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Visor / Helmet-HUD Mode (Screen 6)</h2>
            <span className="uikit-page__section-desc">Heading tape, large telemetry (≥ 20px), glove touch controls (≥ 64px)</span>
          </div>

          <div style={{ height: "560px", border: "1px solid rgba(86, 180, 233, 0.3)", borderRadius: "16px", overflow: "hidden" }}>
            <Hud
              heading={135}
              nextWaypoint={{ name: "BOXWORK RIDGE #2", bearing_deg: 142, distance_m: 640 }}
              backToBase={{ bearing_deg: 315, distance_m: 1850 }}
              evaDose={{ current_mSv: 0.12, max_mSv: 0.50, rate_mSv_h: 0.045 }}
              lifeSupport={{ o2_percent: 86, time_remaining_s: 14800 }}
              commsWindow={{ next_aos_in_s: 1920, duration_s: 720, orbiter_name: "Mars Odyssey" }}
              alerts={[{ id: "1", text: "SEP EVENT IN PROGRESS — DOSE MULTIPLIER 1.6x", severity: "danger" }]}
              onTriggerReroute={() => alert("Triggered reroute")}
              onReturnToBase={() => alert("Return to base")}
            />
          </div>
        </section>

        {/* 10. BottomSheet Demo Trigger */}
        <section className="uikit-page__section">
          <div className="uikit-page__section-header">
            <h2 className="uikit-page__section-title">Mobile Bottom Sheet</h2>
            <span className="uikit-page__section-desc">Drag handle, snap points for phone and tablet</span>
          </div>

          <div className="uikit-page__row">
            <button
              type="button"
              className="toast__action-button"
              style={{ padding: "10px 20px" }}
              onClick={() => setIsSheetOpen(true)}
            >
              Open Mobile BottomSheet
            </button>
          </div>

          <BottomSheet
            isOpen={isSheetOpen}
            snapPoint={sheetSnap}
            onSnapChange={setSheetSnap}
            onClose={() => setIsSheetOpen(false)}
            title="Route Alternatives"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "8px 0" }}>
              {SAMPLE_ROUTES.map((route) => (
                <RouteCard
                  key={route.route_id}
                  route={route}
                  selected={selectedRouteId === route.route_id}
                  onSelect={(id) => setSelectedRouteId(id)}
                />
              ))}
            </div>
          </BottomSheet>
        </section>
      </div>
    </div>
  );
}

export default UiKitPage;
