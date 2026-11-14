import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DEFAULT_LANDING_SITES } from "../globe/landingSites";
import { daysSinceLanding, siteFacts } from "../globe/siteCatalog";
import { formatLatLon } from "../globe/coords";
import { zoneAt } from "../globe/zones";
import { loadLayerMeta, loadValueSampler, formatLayerValue, type LayerMeta, type LayerMetaTable, type ValueSampler } from "../globe/globeLayers";
import { loadGeologyLookup, type GeologyLookup } from "../globe/geologyLookup";
import { GlobeLegend } from "../ui/GlobeLegend";
import { SiteMap, DATA_LAYERS, type Basemap, type DataLayer, type MapCursor, type TraversePoint } from "./SiteMap";
import { layerValues, pixelSizeM, specFor } from "./demRaster";
import { formatMetres } from "./scale";
import { useSiteDem } from "./useSiteDem";
import { bestTier, parentTier, tiersFor, zoneChild, zoomForBounds } from "./tiers";
import { SiteHud, useMissionClock } from "./SiteHud";
import { LocationIntro } from "./LocationIntro";
import { sunriseSunset } from "./missionClock";
import { useSpaceWeather } from "./useSpaceWeather";
import { PinCard } from "./eva/PinCard";
import { RouteBanner } from "./eva/RouteBanner";
import { pinInfo, type PinInfo } from "./eva/pin";
import { adjustForDaylight } from "./eva/plan";
import { latLonToLocal, localToLatLon } from "./terrainData";
import { groundSizeM } from "./reliefMath";
import type { EvaOverlay } from "./SiteMap";
import type { ReliefPoi } from "./SiteRelief3D";
import { EvaCard, EvaWrist } from "./eva/EvaCard";
import { useEvaPlanner } from "./eva/useEvaPlanner";
import { goalsFor, type Goal, type GalePlace as GoalPlace } from "./goals";
import { registerSiteDirector, type SiteCommand } from "../app/director";
import { EVA } from "./eva/evaModel";
import { naturalImagery } from "./naturalImagery";
import { useAppStore } from "../state/store";
import { SITE_VIEWS, VIEW_TAB, isSiteView, onSiteViewRequest, type SiteView } from "./viewBus";
import "./SiteDetail.css";

// heavy 3D parts load only when their tab is opened
const TerrainScene = lazy(() => import("../map3d/TerrainScene").then((m) => ({ default: m.TerrainScene })));
const SiteRelief3D = lazy(() => import("./SiteRelief3D").then((m) => ({ default: m.SiteRelief3D })));
const SiteFpv = lazy(() => import("./SiteFpv").then((m) => ({ default: m.SiteFpv })));
const GaleFpv = lazy(() => import("./GaleFpv").then((m) => ({ default: m.GaleFpv })));
// the data views (Sky, Profile, Mission) are charts only: they load when their tab is opened
const SkyView = lazy(() => import("../sky/SkyView").then((m) => ({ default: m.SkyView })));
const ProfileView = lazy(() => import("../profile/ProfileView").then((m) => ({ default: m.ProfileView })));
const MissionView = lazy(() => import("../mission/MissionView").then((m) => ({ default: m.MissionView })));

type View = SiteView;

interface GalePlace {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
}

const DATA_LABEL: Record<DataLayer, string> = {
  slope: "Slope",
  radiation: "Radiation dose rate",
  pressure: "Surface pressure",
  hazard: "Hazard index",
};

export function SiteDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const site = DEFAULT_LANDING_SITES.find((s) => s.id === id);
  const facts = siteFacts(id);

  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<View>(() => {
    const v = searchParams.get("view");
    return isSiteView(v) ? v : "2d";
  });
  const [basemapPick, setBasemap] = useState<Basemap | null>(null); // null = natural colour: the orthophoto where there is one, else the Viking colour mosaic
  const [dataLayers, setDataLayers] = useState<DataLayer[]>([]);
  const [showCtx, setShowCtx] = useState(true); // CTX detail sharpens the natural colour; it stays loaded by zoom level
  const [showZone, setShowZone] = useState(true);
  const [cursor, setCursor] = useState<MapCursor | null>(null);
  const [galeOriginal, setGaleOriginal] = useState(false); // the original 3D terrain viewer instead of our relief (which carries the EVA plan)

  // detail level: the most detailed tier the site has, unless the user picks another (a stale pick from another site is ignored)
  const [pickedTier, setPickedTier] = useState<string | undefined | "__best">("__best");
  const tiers = tiersFor(id);
  const tier = pickedTier === "__best" ? bestTier(id) : (tiers.find((t) => t.id === pickedTier) ?? bestTier(id));
  const { dem, error: demError } = useSiteDem(id, tier.id);
  const basemap: Basemap = basemapPick ?? (dem?.meta.imagery ? "ortho" : "mdim");
  const eva = useEvaPlanner(dem, facts?.stationPos ?? { lat: 0, lon: 0 });

  // the dropped pin, the clock of the mission, daylight, space weather and the finer tile inside this one
  const stationLocal = useMemo(() => (dem && facts ? latLonToLocal(dem, facts.stationPos.lat, facts.stationPos.lon) : { x: 0, y: 0 }), [dem, facts]);
  const [pin, setPin] = useState<PinInfo | null>(null);
  const [fpvStart, setFpvStart] = useState<{ lat: number; lon: number } | null>(null);
  useEffect(() => setPin(null), [dem]);
  const dropPin = (x: number, y: number) => {
    if (dem) setPin(pinInfo(dem, x, y, stationLocal));
  };
  const clock = useMissionClock(id, facts?.stationPos ?? { lat: 0, lon: 0 });
  const { alert: weatherAlert } = useSpaceWeather();
  const sun = useMemo(() => (clock && facts ? sunriseSunset(facts.stationPos.lat, clock.declinationDeg) : null), [clock, facts]);
  const daylight = useMemo(() => (eva.plan ? adjustForDaylight(eva.plan, sun) : null), [eva.plan, sun]);
  const link = zoneChild(id, tier.id);
  const parent = parentTier(id, tier.id);
  const [zoneBounds, setZoneBounds] = useState<{ west: number; east: number; north: number; south: number } | null>(null);
  useEffect(() => {
    setZoneBounds(null);
    if (!link) return;
    let alive = true;
    fetch(`/data/sites/${id}/${link.to}/dem.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { bounds?: { west: number; east: number; north: number; south: number } } | null) => alive && j?.bounds && setZoneBounds(j.bounds))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, link?.to]);

  // real Gale places: on the map, and as the stops of the science goals
  const [places, setPlaces] = useState<TraversePoint[] | undefined>(undefined);
  const [galePlaces, setGalePlaces] = useState<GoalPlace[] | null>(null);
  useEffect(() => {
    if (id !== "gale") return;
    let alive = true;
    fetch("/data/gale/places.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { places?: GalePlace[] } | null) => {
        if (!alive || !j?.places) return;
        setPlaces(j.places.filter((p) => p.kind !== "rover").map((p) => ({ name: p.name, lat: p.lat, lon: p.lon })));
        setGalePlaces(j.places as unknown as GoalPlace[]);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);

  // modeled / measured values at the landing station
  const [meta, setMeta] = useState<LayerMetaTable | null>(null);
  const [samplers, setSamplers] = useState<Record<string, ValueSampler>>({});
  const [geo, setGeo] = useState<GeologyLookup | null>(null);
  const [layersDone, setLayersDone] = useState(false);
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void loadLayerMeta().then(async (m) => {
      setMeta(m);
      if (!m) {
        setLayersDone(true);
        return;
      }
      const out: Record<string, ValueSampler> = {};
      for (const k of ["elevation", "radiation", "pressure"]) {
        const s = m[k] ? await loadValueSampler(k, m[k]!) : null;
        if (s) out[k] = s;
      }
      setSamplers(out);
      setLayersDone(true);
    });
    void loadGeologyLookup().then(setGeo);
  }, []);

  const goals = useMemo(() => goalsFor(id, galePlaces), [id, galePlaces]);
  const applyGoal = (g: Goal) => {
    if (!goals) return;
    const list = g.stops.flatMap((sid) => goals.stops.filter((s) => s.id === sid));
    eva.setStopsFromList(list, g.id);
  };

  const rows = useMemo(() => {
    if (!site) return [] as Array<[string, string, boolean]>;
    const out: Array<[string, string, boolean]> = [];
    const el = samplers["elevation"];
    if (el) out.push(["Elevation (MOLA)", `${Math.round(el.at(site.lat, site.lon))} m`, false]);
    for (const k of ["radiation", "pressure"] as const) {
      const s = samplers[k];
      const m = meta?.[k];
      if (s && m) out.push([m.name, formatLayerValue(s.at(site.lat, site.lon), m), true]);
    }
    const u = geo?.at(site.lat, site.lon);
    if (u) out.push(["Geologic unit", `${u.sym} · ${u.name}`, false]);
    const z = zoneAt(site.lat, site.lon);
    if (z) out.push(["NASA Exploration Zone", `${z.zone.name} (${Math.round(z.distanceKm)} km from centre)`, false]);
    return out;
  }, [site, samplers, meta, geo]);

  // legend of what the 2D map shows right now
  const legend = useMemo(() => {
    if (!dem) return [];
    const { dx, dy } = pixelSizeM(dem.meta);
    const entries: Array<{ id: string; meta: LayerMeta }> = [];
    const rnd = (v: number, d: number) => Number(v.toFixed(d));
    if (basemap === "elev") {
      const s = specFor("elevation", dem.heights);
      entries.push({
        id: "elevation",
        meta: { name: "Elevation", unit: s.unit, min: Math.round(s.min), max: Math.round(s.max), ramp: s.ramp, modeled: false, source: `${dem.meta.label ?? "MOLA 463 m DEM (MGS)"}; colour spans this tile's range, shaded relief computed from it` },
      });
    }
    for (const k of dataLayers) {
      const s = specFor(k, layerValues(k, dem.heights, dem.meta.width, dem.meta.height, dx, dy));
      entries.push({
        id: k,
        meta: { name: s.name, unit: s.unit, min: rnd(s.min, s.digits), max: rnd(s.max, s.digits), ramp: s.ramp, modeled: true, source: "Computed from this elevation tile (constants in config/params.yaml); colour spans its range" },
      });
    }
    return entries;
  }, [dem, basemap, dataLayers]);

  // the blue range ring of the pin: how far one can walk on from it and still be back at the station on the usable oxygen
  const range = useMemo(() => (pin ? eva.rangeAt(pin.x, pin.y) : null), [pin, eva.rangeAt]);

  // overlay for the 2D map: the plan, the pin and its range ring
  const overlay = useMemo<EvaOverlay | null>(() => {
    const pinLL: [number, number] | null = pin ? [pin.lon, pin.lat] : null;
    if (!eva.overlay && !pinLL) return null;
    const ring =
      dem && range && range.ring.length
        ? range.ring.map((p): [number, number] => {
            const ll = localToLatLon(dem, p.x, p.y);
            return [ll.lon, ll.lat];
          })
        : null;
    return { path: [], stops: [], noReturn: null, ev1: null, ev1State: "nominal", ...(eva.overlay ?? {}), pin: pinLL, ring };
  }, [eva.overlay, pin, range, dem]);

  // places drawn on the 3D terrain: the landing station and the stops of the science goals that lie inside the tile
  const pois = useMemo<ReliefPoi[]>(() => {
    if (!dem || !facts) return [];
    const size = groundSizeM(dem.meta.bounds, dem.meta.centre.lat);
    const out: ReliefPoi[] = [{ name: facts.station, x: stationLocal.x, y: stationLocal.y, kind: "station", year: facts.landed.slice(0, 4) }];
    for (const s of goals?.stops ?? []) {
      const p = latLonToLocal(dem, s.lat, s.lon);
      if (Math.abs(p.x) <= size.w / 2 && Math.abs(p.y) <= size.h / 2) out.push({ name: s.name, x: p.x, y: p.y, kind: "stop" });
    }
    return out;
  }, [dem, facts, goals, stationLocal]);

  // while the tour runs the 3D picture (colour mosaic and CTX detail) is made ahead, so the 3D steps do not wait for it
  const touring = useAppStore((st) => st.autopilotRunning);
  useEffect(() => {
    if (touring && dem && !dem.meta.imagery) void naturalImagery(dem.dir, dem.meta);
  }, [touring, dem]);

  // the autopilot tour drives this page through director.ts: the latest handler is kept in a ref, registered once
  const directed = useRef<(cmd: SiteCommand) => boolean | void>(() => undefined);
  directed.current = (cmd) => {
    switch (cmd.type) {
      case "ready":
        return !!dem && !!goals;
      case "view":
        setFpvStart(null);
        setView(cmd.view);
        return;
      case "pin":
        if (dem) setPin(pinInfo(dem, stationLocal.x + cmd.dxM, stationLocal.y + cmd.dyM, stationLocal));
        return;
      case "clearPin":
        setPin(null);
        return;
      case "plan":
        eva.setEnabled(cmd.on);
        return;
      case "goal": {
        const g = goals?.goals[cmd.index];
        if (g) {
          eva.setEnabled(true);
          applyGoal(g);
        }
        return;
      }
      case "mode":
        eva.setMode(cmd.mode);
        return;
      case "layers":
        setDataLayers(cmd.layers);
        return;
      case "basemap":
        setBasemap(cmd.basemap);
        return;
      case "tier":
        setPickedTier(cmd.tier === "regional" ? undefined : "__best");
        return;
      case "o2":
        eva.setO2CapacityL(cmd.l ?? EVA.o2_capacity_l);
        return;
      case "sim":
        if (cmd.on) {
          eva.setFollowCam(true);
          if (cmd.warp) eva.setWarp(cmd.warp);
          if (cmd.withinS && eva.plan) eva.setWarp(eva.plan.nodes[eva.plan.nodes.length - 1]!.cumT / cmd.withinS);
        }
        if (cmd.on !== eva.playing && eva.plan) eva.toggleSim();
        return;
    }
  };
  useEffect(() => registerSiteDirector((cmd) => directed.current(cmd)), []);

  // the address says which tab is open (?view=sky): a link or the command palette can set it, and the tabs write it back
  const urlView = searchParams.get("view");
  useEffect(() => {
    if (isSiteView(urlView)) {
      setFpvStart(null);
      setView(urlView);
    }
  }, [urlView]);
  const goView = (v: View) => {
    setFpvStart(null);
    setView(v);
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("view", v);
        return n;
      },
      { replace: true },
    );
  };
  const goViewRef = useRef(goView);
  goViewRef.current = goView;
  useEffect(() => onSiteViewRequest((v) => goViewRef.current(v)), []);

  if (!site || !facts) return <Navigate to="/globe" replace />;
  const planHere = () => {
    if (!pin) return;
    eva.setEnabled(true);
    eva.reset();
    eva.addStopLocal(pin.x, pin.y);
  };
  const addHere = () => {
    if (!pin) return;
    eva.setEnabled(true);
    eva.addStopLocal(pin.x, pin.y);
  };
  const standHere = () => {
    if (!pin) return;
    setFpvStart({ lat: pin.lat, lon: pin.lon });
    setView("fpv");
  };
  const pinCard = pin && dem ? <PinCard pin={pin} range={range} modelLabel={dem.meta.label ?? "MOLA 463 m"} onRoute={planHere} onAdd={addHere} onStand={standHere} onClose={() => setPin(null)} /> : null;
  const banner = eva.plan ? <RouteBanner plan={eva.plan} verdict={daylight?.verdict ?? eva.plan.verdict} /> : null;

  const local = facts.detail === "local";
  const isGale = id === "gale";
  const isJezero = id === "jezero";
  const days = daysSinceLanding(facts.landed);
  const toggleData = (k: DataLayer) => setDataLayers((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div className="site-detail">
      <LocationIntro key={id} title={facts.name} kicker={facts.craft} lat={facts.stationPos.lat} lon={facts.stationPos.lon} line={facts.station} />
      <aside className="site-detail__panel" aria-label="Expedition details">
        <Link to="/globe" className="site-detail__back">
          ← Globe
        </Link>
        <div className="site-detail__kicker">{facts.craft}</div>
        <h1>{facts.name}</h1>
        <div className="site-detail__coords" translate="no">
          {facts.station} · {formatLatLon(facts.stationPos.lat, facts.stationPos.lon, 4)}
        </div>
        <p className="site-detail__summary">{facts.summary}</p>

        <dl className="site-detail__facts">
          <dt>Landed</dt>
          <dd>
            {facts.landed} <span className="site-detail__muted">({days.toLocaleString()} days ago)</span>
          </dd>
          <dt>Status</dt>
          <dd>{facts.status}</dd>
          <dt>Data here</dt>
          <dd>
            <span className={`site-detail__tag ${local ? "site-detail__tag--local" : ""}`}>
              {local ? "Local terrain data" : "MOLA 463 m terrain + imagery"}
            </span>
          </dd>
          {rows.map(([k, v, modeled]) => (
            <div key={k} className="site-detail__row">
              <dt>{k}</dt>
              <dd>
                {v}
                {modeled && <span className="site-detail__modeled">MODELED</span>}
              </dd>
            </div>
          ))}
        </dl>

        {tiers.length > 1 && (
          <fieldset className="site-detail__controls">
            <legend>Detail level</legend>
            {tiers.map((t) => (
              <label key={t.label}>
                <input type="radio" name="tier" checked={t.id === tier.id} onChange={() => setPickedTier(t.id)} /> {t.label}
              </label>
            ))}
          </fieldset>
        )}

        {view === "2d" && (
          <>
            <fieldset className="site-detail__controls">
              <legend>Base map</legend>
              {dem?.meta.imagery && (
                <label>
                  <input type="radio" name="basemap" checked={basemap === "ortho"} onChange={() => setBasemap("ortho")} /> Natural colour ({dem.meta.label?.split(",")[1]?.trim() ?? "orbital image"})
                </label>
              )}
              <label>
                <input type="radio" name="basemap" checked={basemap === "mdim"} onChange={() => setBasemap("mdim")} /> Natural colour (Viking mosaic, 232 m)
              </label>
              <label>
                <input type="radio" name="basemap" checked={basemap === "elev"} onChange={() => setBasemap("elev")} /> Elevation colour + relief
              </label>
              <label>
                <input type="radio" name="basemap" checked={basemap === "mola"} onChange={() => setBasemap("mola")} /> MOLA colour (463 m tiles)
              </label>
            </fieldset>
            <fieldset className="site-detail__controls">
              <legend>Data layers (modeled)</legend>
              {DATA_LAYERS.map((k) => (
                <label key={k}>
                  <input type="checkbox" checked={dataLayers.includes(k)} onChange={() => toggleData(k)} disabled={!dem} /> {DATA_LABEL[k]}
                </label>
              ))}
              <label>
                <input type="checkbox" checked={showCtx} onChange={(e) => setShowCtx(e.target.checked)} /> CTX camera detail (sharpens the colour, about 5 m)
              </label>
              <label>
                <input type="checkbox" checked={showZone} onChange={(e) => setShowZone(e.target.checked)} /> Exploration Zone ring
              </label>
              {demError && <small className="site-detail__muted">No elevation patch: {demError}</small>}
            </fieldset>
          </>
        )}

        {isGale && view === "3d" && (
          <fieldset className="site-detail__controls">
            <legend>Viewer</legend>
            <label>
              <input type="radio" name="galev" checked={!galeOriginal} onChange={() => setGaleOriginal(false)} /> Relief with layers and the EVA plan
            </label>
            <label>
              <input type="radio" name="galev" checked={galeOriginal} onChange={() => setGaleOriginal(true)} /> Original terrain viewer
            </label>
          </fieldset>
        )}

        <div className="site-detail__actions">
          <button type="button" onClick={() => navigate(`/globe?site=${id}`)}>
            Show on 3D globe
          </button>
          <button type="button" onClick={() => navigate(`/compare?site=${id}`)}>
            Compare all 8 sites
          </button>
        </div>
      </aside>

      <main className="site-detail__stage">
        <div role="tablist" aria-label="View" className="site-detail__tabs">
          {SITE_VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? "is-active" : ""} onClick={() => goView(v)} data-view={v}>
              {VIEW_TAB[v]}
            </button>
          ))}
          <SiteHud clock={clock} siteName={facts.name} />
        </div>

        <div className="site-detail__view">
          {view === "2d" && (
            <>
              <SiteMap
                key={id}
                lat={facts.stationPos.lat}
                lon={facts.stationPos.lon}
                centre={tier.id && dem ? dem.meta.centre : undefined}
                zoom={tier.id && dem ? zoomForBounds(dem.meta.bounds.west, dem.meta.bounds.east) : facts.zoom}
                stationName={facts.station}
                basemap={basemap}
                dataLayers={dataLayers}
                showCtx={showCtx}
                showZone={showZone}
                dem={dem}
                traverseUrl={isGale ? "/data/gale/traverse.geojson" : undefined}
                places={places}
                onCursor={setCursor}
                eva={overlay}
                followTo={eva.followCam && eva.playing ? eva.overlay?.ev1 : null}
                onMapClick={(c) => {
                  if (!dem) return;
                  const p = latLonToLocal(dem, c.lat, c.lon);
                  dropPin(p.x, p.y);
                }}
              />
              {banner}
              {pinCard}
              <EvaCard p={eva} siteId={id} goals={goals} onGoal={applyGoal} daylight={daylight} alert={weatherAlert} />
              {eva.at && <EvaWrist at={eva.at} stopsLabel={(i) => (i === null ? "AIRLOCK" : `STOP ${i + 1}`)} />}
              <GlobeLegend entries={legend} />
              <div className="site-detail__telemetry" translate="no" data-testid="site-cursor">
                {cursor ? (
                  <>
                    <span>
                      <i>LAT</i> {cursor.lat.toFixed(4)}°
                    </span>
                    <span>
                      <i>LON</i> {(((cursor.lon % 360) + 360) % 360).toFixed(4)}°E
                    </span>
                    <span>
                      <i>SCALE</i> {formatMetres(cursor.metresPerPx)}/px
                    </span>
                    {cursor.readouts.map((r) => (
                      <span key={r}>{r}</span>
                    ))}
                  </>
                ) : (
                  <span>
                    <i>CURSOR</i> move over the map for coordinates, elevation and slope
                  </span>
                )}
              </div>
            </>
          )}
          {view === "3d" &&
            (isGale && galeOriginal ? (
              <Suspense fallback={<div className="site-note">Loading the 10 m terrain…</div>}>
                <TerrainScene />
              </Suspense>
            ) : (
              <Suspense fallback={<div className="site-note">Loading the 3D relief…</div>}>
                <SiteRelief3D
                  dem={dem}
                  error={demError}
                  eva={eva}
                  pin={pin}
                  range={range}
                  onPin={dropPin}
                  pois={pois}
                  zone={link && zoneBounds ? { name: link.name, bounds: zoneBounds, onEnter: () => setPickedTier(link.to) } : null}
                  onBack={parent ? () => setPickedTier(parent.id) : undefined}
                  backLabel={parent ? `Back to ${parent.label.split("·")[0]!.trim().toLowerCase()}` : undefined}
                />
              </Suspense>
            ))}
          {view === "3d" && !(isGale && galeOriginal) && (
            <>
              {banner}
              {pinCard}
              <EvaCard p={eva} siteId={id} goals={goals} onGoal={applyGoal} daylight={daylight} alert={weatherAlert} />
              {eva.at && <EvaWrist at={eva.at} stopsLabel={(i) => (i === null ? "AIRLOCK" : `STOP ${i + 1}`)} />}
            </>
          )}
          {view === "sky" && (
            <Suspense fallback={<div className="site-note">Loading the sky…</div>}>
              <SkyView key={id} siteName={facts.name} lat={facts.stationPos.lat} lon={facts.stationPos.lon} />
            </Suspense>
          )}
          {view === "profile" && (
            <Suspense fallback={<div className="site-note">Loading the route profile…</div>}>
              <ProfileView
                plan={eva.plan}
                verdict={daylight?.verdict}
                siteName={facts.name}
                siteId={id}
                stopNames={eva.stops.map((x, i) => x.name ?? `Stop ${i + 1}`)}
                toLatLon={dem ? (x, y) => localToLatLon(dem, x, y) : null}
                error={eva.error}
                loading={!dem && !demError}
                onPlan={() => {
                  eva.setEnabled(true);
                  goView("2d");
                }}
              />
            </Suspense>
          )}
          {view === "mission" && (
            <Suspense fallback={<div className="site-note">Loading the mission calendar…</div>}>
              <MissionView
                key={id}
                siteName={facts.name}
                surfaceMSvPerDay={samplers["radiation"] ? samplers["radiation"].at(facts.stationPos.lat, facts.stationPos.lon) : null}
                loading={!layersDone}
              />
            </Suspense>
          )}
          {view === "fpv" &&
            (fpvStart && dem ? (
              <Suspense fallback={<div className="site-note">Loading the first-person view…</div>}>
                <SiteFpv key={`${fpvStart.lat}-${fpvStart.lon}`} dem={dem} name={facts.name} station={fpvStart} plan={null} onExit={() => goView("2d")} />
              </Suspense>
            ) : isGale && !eva.plan ? (
              <Suspense fallback={<div className="site-note">Loading the first-person view…</div>}>
                <GaleFpv onExit={() => setView("2d")} />
              </Suspense>
            ) : dem ? (
              <Suspense fallback={<div className="site-note">Loading the first-person view…</div>}>
                <SiteFpv dem={dem} name={facts.name} station={facts.stationPos} plan={eva.plan} stopNames={eva.stops.map((x) => x.name)} onExit={() => setView("2d")} />
              </Suspense>
            ) : (
              <div className="site-note">{demError ? `First person needs the elevation patch: ${demError}` : "Loading the elevation patch…"}</div>
            ))}
        </div>
      </main>
    </div>
  );
}

export default SiteDetail;
