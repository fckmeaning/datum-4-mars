import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, Link, useSearchParams, useLocation } from "react-router-dom";
import { MarsGlobe } from "../globe/MarsGlobe";
import {
  DOCK_TO_OVERLAY,
  OVERLAY_IDS,
  formatLayerValue,
  loadLayerMeta,
  loadValueSampler,
  type LayerMetaTable,
  type OverlayId,
  type ValueSampler,
} from "../globe/globeLayers";
import { GlobeLegend } from "../ui/GlobeLegend";
import { zoneAt, ZONE_RADIUS_KM, ZONES_SOURCE, surfaceDistanceKm } from "../globe/zones";
import { formatLatLon, isInsideCoverage } from "../globe/coords";
import { loadGeologyLookup, type GeologyLookup } from "../globe/geologyLookup";
import { loadLandingSites, DEFAULT_LANDING_SITES, type LandingSite } from "../globe/landingSites";
import type { DockLayerItem } from "../ui/LayerDock";
import { BottomBar } from "../ui/BottomBar";
import { DataSourcesPanel } from "../ui/DataSourcesPanel";
import { useAutopilot } from "../app/useAutopilot";
import { registerGlobeDirector } from "../app/director";
import { apiClient, type SourceEntry } from "../api/client";
import { useAppStore } from "../state/store";
import { FlatMarsMap } from "../flatmap/FlatMarsMap";
import { ViewSwitch } from "../flatmap/ViewSwitch";
import {
  VIEW_TRANSITION_MS,
  initialView,
  otherView,
  prefersReducedMotion,
  storeView,
  type ViewMode,
} from "../flatmap/viewMode";
import { SiteDeck, LayerDeck } from "../deck";
import "./GlobeScreen.css";

export function GlobeScreen() {
  const navigate = useNavigate();
  const location = useLocation();

  // Globe or flat map: `?view=flat` wins, then the remembered choice (localStorage d4-view). The tour always runs on the globe.
  const storeViewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const tourOn = useAppStore((s) => s.autopilotRunning);
  const [startView] = useState<ViewMode>(() => (useAppStore.getState().autopilotRunning ? "globe" : initialView(location.search)));
  const [viewSynced, setViewSynced] = useState(false);
  useLayoutEffect(() => {
    setViewMode(startView); // the store follows the choice made at the door, before the first paint
    setViewSynced(true);
  }, [startView, setViewMode]);
  const view: ViewMode = tourOn ? "globe" : viewSynced ? storeViewMode : startView;
  // click on Mars: the side panels slide away and the site deck (top) and layer deck (bottom) slide in
  const [deckWanted, setDeckWanted] = useState(false);
  const deckOn = deckWanted && view === "globe" && !tourOn;
  const openDeck = useCallback(() => setDeckWanted(true), []);
  const closeDeck = useCallback(() => setDeckWanted(false), []);
  const [flatMounted, setFlatMounted] = useState(startView === "flat");
  const [flatStart, setFlatStart] = useState<{ lat: number; lon: number } | null>(null);
  const globeCentre = useRef<{ lat: number; lon: number } | null>(null);
  const flatCentre = useRef<{ lat: number; lon: number } | null>(null);
  const altitude_km = useAppStore((s) => s.altitude_km);
  const setAltitudeKm = useAppStore((s) => s.setAltitudeKm);
  const layers = useAppStore((s) => s.layers);
  const setLayerState = useAppStore((s) => s.setLayerState);

  const [landingSites, setLandingSites] = useState<LandingSite[]>(DEFAULT_LANDING_SITES);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [dataSourcesOpen, setDataSourcesOpen] = useState(false);
  const [isFlyingIn, setIsFlyingIn] = useState(false);
  const [selectedId, setSelectedId] = useState("gale");
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [hover, setHover] = useState<{ lat: number; lon: number } | null>(null);

  const [geoLookup, setGeoLookup] = useState<GeologyLookup | null>(null);
  const geologyOn = layers.geology?.visible ?? false;
  useEffect(() => {
    if (geologyOn && !geoLookup) void loadGeologyLookup().then(setGeoLookup);
  }, [geologyOn, geoLookup]);
  // Global data layers: opacity per overlay slot, metadata, and cursor readouts
  const overlays = useMemo(() => {
    const o: Partial<Record<OverlayId, number>> = {};
    for (const [dockId, slot] of Object.entries(DOCK_TO_OVERLAY)) {
      const st = layers[dockId];
      if (slot && st?.visible) o[slot] = st.opacity ?? 0.8;
    }
    return o;
  }, [layers]);
  const [layerMeta, setLayerMeta] = useState<LayerMetaTable | null>(null);
  const [samplers, setSamplers] = useState<Record<string, ValueSampler>>({});
  useEffect(() => {
    let alive = true;
    void loadLayerMeta().then((m) => alive && setLayerMeta(m));
    return () => {
      alive = false;
    };
  }, []);
  const requestedSamplers = useRef(new Set<string>());
  useEffect(() => {
    if (!layerMeta) return;
    const wanted = ["elevation", ...OVERLAY_IDS.filter((id) => overlays[id] !== undefined)];
    for (const id of wanted) {
      const meta = layerMeta[id];
      if (!meta || requestedSamplers.current.has(id)) continue;
      requestedSamplers.current.add(id);
      void loadValueSampler(id, meta).then((s) => s && setSamplers((prev) => ({ ...prev, [id]: s })));
    }
  }, [layerMeta, overlays]);
  const legendEntries = useMemo(
    () =>
      layerMeta
        ? OVERLAY_IDS.filter((id) => overlays[id] !== undefined && layerMeta[id]).map((id) => ({ id, meta: layerMeta[id]! }))
        : [],
    [layerMeta, overlays],
  );
  const cursorValues = useMemo(() => {
    if (!hover || !layerMeta) return [] as string[];
    const out: string[] = [];
    const elev = samplers["elevation"];
    if (elev && layerMeta["elevation"]) out.push(`ELEV ${Math.round(elev.at(hover.lat, hover.lon))} m`);
    for (const id of OVERLAY_IDS) {
      const s = samplers[id];
      const m = layerMeta[id];
      if (overlays[id] !== undefined && s && m) out.push(`${m.name} ${formatLayerValue(s.at(hover.lat, hover.lon), m)}`);
    }
    return out;
  }, [hover, layerMeta, samplers, overlays]);

  const hoverZone = useMemo(() => (hover ? zoneAt(hover.lat, hover.lon) : null), [hover]);
  const hoverUnit = useMemo(
    () => (geologyOn && hover && geoLookup ? geoLookup.at(hover.lat, hover.lon) : null),
    [geologyOn, hover, geoLookup],
  );
  const pickedZone = useMemo(() => (picked ? zoneAt(picked.lat, picked.lon) : null), [picked]);
  // Z toggles the zones overlay (same layer as dock key 8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "z" || e.key === "Z") setLayerState("zones", { visible: !(useAppStore.getState().layers.zones?.visible ?? false) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLayerState]);
  const pickedUnit = useMemo(
    () => (geologyOn && picked && geoLookup ? geoLookup.at(picked.lat, picked.lon) : null),
    [geologyOn, picked, geoLookup],
  );

  const handlePick = useCallback((p: { lat: number; lon: number }) => setPicked(p), []);
  const [focus, setFocus] = useState<{ lat: number; lon: number; nonce: number } | null>(null);
  const focusNonce = useRef(0);
  const handleSelectSite = useCallback(
    (id: string) => {
      setSelectedId(id);
      setPicked(null);
      const s = landingSites.find((x) => x.id === id);
      if (s) setFocus({ lat: s.lat, lon: s.lon, nonce: ++focusNonce.current });
    },
    [landingSites],
  );

  // ---- globe <-> flat map
  const changeView = useCallback(
    (next: ViewMode) => {
      if (useAppStore.getState().autopilotRunning || useAppStore.getState().viewMode === next) return;
      if (next === "flat") {
        setFlatStart(globeCentre.current); // the map opens on the longitude the globe was showing
        setFlatMounted(true);
      } else if (flatCentre.current) {
        // the globe turns to where the map was left
        setFocus({ lat: flatCentre.current.lat, lon: flatCentre.current.lon, nonce: ++focusNonce.current });
      }
      setViewMode(next);
      storeView(next);
    },
    [setViewMode],
  );
  const changeViewRef = useRef(changeView);
  changeViewRef.current = changeView;

  // the flat map is mounted while it is shown and for the length of the crossfade after it
  useEffect(() => {
    if (view === "flat") {
      setFlatMounted(true);
      return;
    }
    if (prefersReducedMotion()) {
      setFlatMounted(false);
      return;
    }
    const t = window.setTimeout(() => setFlatMounted(false), VIEW_TRANSITION_MS + 80);
    return () => window.clearTimeout(t);
  }, [view]);

  // the tour needs the globe (layers, descent): put the choice back to it, without remembering that as the person's choice
  useEffect(() => {
    if (tourOn && useAppStore.getState().viewMode === "flat") setViewMode("globe");
  }, [tourOn, setViewMode]);

  // M switches between the globe and the flat map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        changeViewRef.current(otherView(useAppStore.getState().viewMode));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the autopilot tour picks a site the way a click on its row does
  useEffect(
    () =>
      registerGlobeDirector((cmd) => {
        if (cmd.type === "ready") return landingSites.length > 0;
        if (cmd.type === "select") handleSelectSite(cmd.id);
      }),
    [landingSites, handleSelectSite],
  );

  // /globe?site=meridiani selects and turns to that expedition once the catalog is there
  const [params] = useSearchParams();
  const wantedSite = params.get("site");
  const appliedWanted = useRef(false);
  useEffect(() => {
    if (!wantedSite || appliedWanted.current) return;
    if (landingSites.some((s) => s.id === wantedSite)) {
      appliedWanted.current = true;
      handleSelectSite(wantedSite);
    }
  }, [wantedSite, landingSites, handleSelectSite]);

  // Hook for scripted demo tour
  const { running: autopilotRunning, toggle: toggleAutopilot, stop: stopAutopilot } = useAutopilot({
    setFlyIn: setIsFlyingIn,
  });

  // Load landing sites & data sources
  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const [sitesData, sourcesData] = await Promise.all([
          loadLandingSites(),
          apiClient.listSources(),
        ]);
        if (active) {
          setLandingSites(sitesData);
          setSources(sourcesData);
        }
      } catch (err) {
        console.warn("GlobeScreen: error loading metadata", err);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, []);

  // Keyboard navigation: Escape leaves the screen unless handling modals or autopilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dataSourcesOpen) {
          setDataSourcesOpen(false);
          return;
        }
        if (autopilotRunning) {
          stopAutopilot();
          return;
        }
        if (deckWanted) {
          setDeckWanted(false);
          return;
        }
        navigate("/");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dataSourcesOpen, autopilotRunning, deckWanted, stopAutopilot, navigate]);

  const handleDescendToGale = useCallback(() => {
    // the descent is a camera dive on the globe; from the flat map there is nothing to dive from, so go straight in
    if (useAppStore.getState().viewMode === "flat") {
      navigate("/site/gale");
      return;
    }
    setIsFlyingIn(true);
  }, [navigate]);

  // clicking an expedition label flies the camera down to it, then opens its page
  const [descent, setDescent] = useState<LandingSite | null>(null);
  const handleFlyInComplete = useCallback(() => {
    navigate(descent ? `/site/${descent.id}` : "/site/gale");
  }, [navigate, descent]);

  // Construct items for LayerDock (keys 1 to 6)
  const dockLayers: DockLayerItem[] = useMemo(() => {
    return [
      {
        id: "topo",
        shortcutNumber: 1,
        name: "Topography (colour)",
        family: "topography",
        source: "MOLA colour-shaded relief",
        visible: layers.topo?.visible ?? false,
        opacity: layers.topo?.opacity ?? 0.8,
      },
      {
        id: "optical",
        shortcutNumber: 2,
        name: "Orbital Mosaic",
        family: "optical",
        source: "Viking MDIM 2.1 colour, 232 m",
        visible: layers.optical?.visible ?? true,
        opacity: layers.optical?.opacity ?? 1.0,
      },
      {
        id: "thermal",
        shortcutNumber: 3,
        name: "Thermal (night IR)",
        family: "thermal",
        source: "THEMIS night IR global mosaic",
        visible: layers.thermal?.visible ?? false,
        opacity: layers.thermal?.opacity ?? 0.8,
      },
      {
        id: "slope",
        shortcutNumber: 4,
        name: "Regional slope",
        family: "topography",
        source: "MOLA gradient, 39 km scale",
        visible: layers.slope?.visible ?? false,
        opacity: layers.slope?.opacity ?? 0.8,
        modeled: true,
      },
      {
        id: "hazard",
        shortcutNumber: 5,
        name: "Hazard index",
        family: "topography",
        source: "slope + radiation, normalised",
        visible: layers.hazard?.visible ?? false,
        opacity: layers.hazard?.opacity ?? 0.8,
        modeled: true,
      },
      {
        id: "traverse",
        shortcutNumber: 6,
        name: "Curiosity Traverse",
        family: "mission",
        source: "MSL Sols 0–4700 Track",
        visible: layers.traverse?.visible ?? true,
        opacity: layers.traverse?.opacity ?? 1.0,
      },
      {
        id: "radiation",
        shortcutNumber: 9,
        name: "Radiation dose rate",
        family: "radiation",
        source: "RAD (Gale) scaled by shielding",
        visible: layers.radiation?.visible ?? false,
        opacity: layers.radiation?.opacity ?? 0.85,
        modeled: true,
      },
      {
        id: "pressure",
        shortcutNumber: 10,
        name: "Surface pressure",
        family: "atmosphere",
        source: "isothermal model from MOLA",
        visible: layers.pressure?.visible ?? false,
        opacity: layers.pressure?.opacity ?? 0.85,
        modeled: true,
      },
      {
        id: "geology",
        shortcutNumber: 7,
        name: "Geologic map",
        family: "geology",
        source: "USGS SIM 3292 · 1:20M",
        visible: layers.geology?.visible ?? false,
        opacity: layers.geology?.opacity ?? 0.8,
      },
      {
        id: "zones",
        shortcutNumber: 8,
        name: "Human Exploration Zones",
        family: "mission",
        source: "NASA workshop 2015 · 100 km",
        visible: layers.zones?.visible ?? false,
        opacity: layers.zones?.opacity ?? 1.0,
      },
    ];
  }, [layers]);

  const activeSite = landingSites.find((s) => s.id === selectedId) ?? landingSites[0];
  const target = picked ?? (activeSite ? { lat: activeSite.lat, lon: activeSite.lon } : null);
  const canDescend =
    !isFlyingIn && target !== null && (picked ? isInsideCoverage(picked.lat, picked.lon) : activeSite?.id === "gale");
  // the expedition page: the selected site, or the site nearest to a picked point
  const nearest = useMemo(() => {
    if (!picked) return null;
    let best: { site: LandingSite; km: number } | null = null;
    for (const s of landingSites) {
      const km = surfaceDistanceKm(picked.lat, picked.lon, s.lat, s.lon);
      if (!best || km < best.km) best = { site: s, km };
    }
    return best;
  }, [picked, landingSites]);
  const expeditionSite = picked ? nearest?.site : activeSite;
  const targetTitle = picked ? "Picked point" : activeSite?.name ?? "Gale Crater";

  return (
    <div className="globe-screen" data-view={view} data-deck={deckOn ? "1" : "0"}>
      {/* Top Header Bar */}
      <header className="globe-screen__top-bar">
        <div className="globe-screen__brand">
          <Link to="/" className="globe-screen__logo">
            DATUM-4
          </Link>
          <span className="globe-screen__mission-tag">GLOBAL SURVEY MODE</span>
        </div>

        <div className="globe-screen__top-actions">
          <button
            type="button"
            className="globe-screen__nav-btn"
            onClick={() => navigate("/site/gale")}
            aria-label="Open the Gale expedition"
          >
            Gale expedition →
          </button>
        </div>
      </header>

      {/* Center: the 3D globe and the flat map, crossfading (flatmap/flatmap.css) */}
      <div className="globe-screen__canvas-container">
        <div className="view-stack">
        <div className="view-layer view-layer--globe" data-active={view === "globe" ? "1" : "0"}>
        <MarsGlobe
          interactive={!isFlyingIn && !descent}
          autoRotate={!isFlyingIn && !descent}
          aoi={descent ? { lat: descent.lat, lon: descent.lon } : undefined}
          showOrbiters={true}
          framing={deckOn ? "deck" : "idle"}
          onPlanetClick={openDeck}
          flyIn={isFlyingIn || !!descent}
          onFlyInComplete={handleFlyInComplete}
          landingSites={landingSites}
          onAltitude={setAltitudeKm}
          onPick={handlePick}
          pickedPoint={picked}
          onHover={setHover}
          onViewCenter={(c) => {
            globeCentre.current = c;
          }}
          onSiteSelect={(id) => {
            const s = landingSites.find((x) => x.id === id);
            if (s) setDescent(s);
          }}
          selectedSiteId={picked ? null : selectedId}
          focusPoint={focus}
          geologyOpacity={layers.geology?.visible ? (layers.geology?.opacity ?? 0.8) : 0}
          showZones={layers.zones?.visible ?? false}
          overlays={overlays}
        />
        </div>
        <div className="view-layer view-layer--flat" data-active={view === "flat" ? "1" : "0"} aria-hidden={view !== "flat"}>
          {flatMounted && (
            <FlatMarsMap
              active={view === "flat"}
              sites={landingSites}
              selectedId={selectedId}
              picked={picked}
              focus={focus}
              overlays={overlays}
              geologyOpacity={layers.geology?.visible ? (layers.geology?.opacity ?? 0.8) : 0}
              showZones={layers.zones?.visible ?? false}
              showTraverse={layers.traverse?.visible ?? false}
              initialCenter={flatStart}
              onHover={setHover}
              onPick={handlePick}
              onOpenSite={(id) => navigate(`/site/${id}`)}
              onViewCenter={(c) => {
                flatCentre.current = c;
              }}
            />
          )}
        </div>
        </div>
      </div>

      {!tourOn && <ViewSwitch view={view} onChange={changeView} />}

      {/* Horizontal decks: sites on top, data layers below; they replace the two side panels */}
      <SiteDeck
        open={deckOn}
        sites={landingSites}
        selectedId={selectedId}
        onSelect={handleSelectSite}
        onOpen={(id) => navigate(`/site/${id}`)}
      />
      <LayerDeck
        open={deckOn}
        layers={dockLayers}
        onToggle={(id, visible) => setLayerState(id, { visible })}
        onOpacity={(id, opacity) => setLayerState(id, { opacity })}
      />
      {/* Target strip between the decks: what is selected, where it is, and the two ways in */}
      <div className="globe-screen__target-pill" data-testid="survey-card" role="region" aria-label="Survey target">
        <div className="globe-screen__target-main">
          <span className="globe-screen__target-dot" />
          <strong>{targetTitle}</strong>
          <span className="globe-screen__target-coords" data-testid="survey-coords">
            {target ? formatLatLon(target.lat, target.lon, picked ? 4 : 2) : "—"}
          </span>
          {picked && (
            <button type="button" className="globe-screen__target-clear" tabIndex={deckOn ? 0 : -1} onClick={() => setPicked(null)}>
              Clear point
            </button>
          )}
          <button type="button" className="globe-screen__target-close" tabIndex={deckOn ? 0 : -1} onClick={closeDeck} aria-label="Close the decks">
            ✕
          </button>
        </div>
        {(pickedZone || pickedUnit) && (
          <div className="globe-screen__target-info">
            {pickedZone && (
              <span data-testid="zone-card">
                {pickedZone.zone.name} Exploration Zone, {Math.round(pickedZone.distanceKm)} km from its centre
              </span>
            )}
            {pickedUnit && (
              <span data-testid="geo-unit">
                <i style={{ background: pickedUnit.rgb }} />
                {pickedUnit.sym} · {pickedUnit.name}, {pickedUnit.age}
              </span>
            )}
          </div>
        )}
        <div className="globe-screen__target-actions">
          <button
            type="button"
            className="globe-screen__descend-btn"
            tabIndex={deckOn ? 0 : -1}
            onClick={handleDescendToGale}
            disabled={!canDescend}
            aria-label="Descend to Gale Crater AOI"
          >
            <span>{canDescend ? "Descend to Gale ↓" : "Outside surveyed area"}</span>
          </button>
          {expeditionSite && (
            <button
              type="button"
              className="globe-screen__open-btn"
              tabIndex={deckOn ? 0 : -1}
              onClick={() => navigate(`/site/${expeditionSite.id}`)}
              data-testid="open-expedition"
            >
              Open {expeditionSite.name} →
              {picked && nearest ? <small> nearest, {Math.round(nearest.km)} km</small> : null}
            </button>
          )}
        </div>
      </div>
      <div className="globe-screen__click-hint" aria-hidden={deckOn || tourOn || view !== "globe"}>
        Click Mars to open the decks
      </div>

      <GlobeLegend entries={legendEntries} />

      {/* Live cursor coordinates */}
      <div className="globe-screen__cursor" data-testid="cursor-coords" aria-live="off">
        {hover ? (
          <>
            <span>CURSOR</span> {formatLatLon(hover.lat, hover.lon, 3)}
            {cursorValues.map((v) => (
              <span key={v} className="globe-screen__cursor-value"> · {v}</span>
            ))}
            {hoverUnit && <span className="globe-screen__cursor-unit"> · {hoverUnit.sym}</span>}
            {hoverZone && <span className="globe-screen__cursor-zone"> · {hoverZone.zone.name} zone</span>}
          </>
        ) : (
          <span>CURSOR: move over the planet</span>
        )}
      </div>

      {/* Bottom Telemetry Bar */}
      <BottomBar
        altitudeKm={altitude_km}
        onOpenDataSources={() => setDataSourcesOpen(true)}
        autopilotRunning={autopilotRunning}
        onToggleAutopilot={toggleAutopilot}
      />

      {/* Data Sources and Attribution Modal */}
      <DataSourcesPanel
        isOpen={dataSourcesOpen}
        onClose={() => setDataSourcesOpen(false)}
        sources={sources}
      />

    </div>
  );
}
export default GlobeScreen;
