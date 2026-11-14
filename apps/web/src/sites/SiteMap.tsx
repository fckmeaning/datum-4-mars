import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import ImageLayer from "ol/layer/Image";
import ImageStatic from "ol/source/ImageStatic";
import ImageSource from "ol/source/Image";
import { createLoader } from "ol/source/static";
import XYZ from "ol/source/XYZ";
import type ImageTile from "ol/ImageTile";
import TileGrid from "ol/tilegrid/TileGrid";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import LineString from "ol/geom/LineString";
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from "ol/style";
import Overlay from "ol/Overlay";
import { easeOut } from "ol/easing";
import { Attribution, Zoom } from "ol/control";
import "ol/ol.css";
import { formatLatLon } from "../globe/coords";
import { vector3ToLatLon } from "../globe/orbit";
import { ZONE_RADIUS_KM, ringPoints, zoneAt } from "../globe/zones";
import { wrapLon180 } from "../globe/siteCatalog";
import { MARS_KM_PER_DEG, resolutionToMetres } from "./scale";
import { displayGrid, layerValues, pixelSizeM, renderRaster, valueAt, type RasterKind } from "./demRaster";
import type { SiteDem } from "./useSiteDem";
import { reducedMotion } from "./LocationIntro";
import { createCtxDetailLoader } from "./ctxDetailClient";
import { accentColor } from "../app/accent";
import { useAppStore } from "../state/store";
import "./SiteMap.css";

/**
 * "elev": blue-to-yellow elevation colour with shaded relief computed from the elevation patch (the Gale planner look);
 * "ortho": the orthophoto of a high-detail tier (HiRISE or CTX); "mdim"/"mola": NASA Trek tiles.
 */
export type Basemap = "elev" | "ortho" | "mdim" | "mola";
export type DataLayer = Exclude<RasterKind, "elevation">;

const TREK = "https://trek.nasa.gov/tiles/Mars/EQ/";
const CTX_URL = "https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{y}/{x}";

/** CTX (Esri) tile grid: 512 px tiles, level 0 = 0.3515625 deg/px, origin top-left of the plate carree. */
const CTX_RES = Array.from({ length: 17 }, (_, z) => 0.3515625 / 2 ** z);
/** Esri has CTX tiles down to level 12 (about 5 m); closer than that the last level is stretched. */
const CTX_TILE_RES = CTX_RES.slice(0, 13);
/** Trek EQ grid: 256 px tiles, level 0 = 0.703125 deg/px. */
const TREK_RES = Array.from({ length: 8 }, (_, z) => 0.703125 / 2 ** z);

export interface TraversePoint {
  name: string;
  lat: number;
  lon: number;
}

/** An EVA plan drawn on the map; all positions are [lon, lat]. */
export interface EvaOverlay {
  path: Array<[number, number]>;
  stops: Array<[number, number]>;
  /** names of the stops (empty for stops placed by hand) */
  names?: string[];
  noReturn: [number, number] | null;
  /** the dropped pin */
  pin?: [number, number] | null;
  /** range ring round the pin, closed outline in lon/lat */
  ring?: Array<[number, number]> | null;
  ev1: [number, number] | null;
  ev1State: "nominal" | "past-no-return" | "reserve";
}

export interface MapCursor {
  lat: number;
  lon: number;
  metresPerPx: number;
  /** "Elevation -3631 m", "radiation 0.66", ... */
  readouts: string[];
}

interface Props {
  /** Landing station (marker). */
  lat: number;
  lon: number;
  /** Where the map is centred (the middle of the elevation tile); defaults to the station. */
  centre?: { lat: number; lon: number };
  /** CTX level to start at (11 is about 10 m per pixel). */
  zoom: number;
  stationName: string;
  basemap: Basemap;
  dataLayers: DataLayer[];
  showCtx: boolean;
  showZone: boolean;
  dem: SiteDem | null;
  /** Optional real traverse (GeoJSON in lon/lat) and named places, drawn on top (Gale only today). */
  traverseUrl?: string;
  places?: TraversePoint[];
  onCursor?: (c: MapCursor | null) => void;
  /** The EVA plan to draw (route, stops, point of no return, EV1). */
  eva?: EvaOverlay | null;
  /** When set, a click on the map is reported (used to place EVA stops). */
  onMapClick?: (c: { lat: number; lon: number }) => void;
  /** Keep the view centred on this [lon, lat] (the follow cam on EV1). */
  followTo?: [number, number] | null;
}

export const DATA_LAYERS: DataLayer[] = ["slope", "radiation", "pressure", "hazard"];

function trekLayer(name: string): TileLayer<XYZ> {
  return new TileLayer({
    source: new XYZ({
      projection: "EPSG:4326",
      url: `${TREK}${name}/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`,
      tileGrid: new TileGrid({ extent: [-180, -90, 180, 90], origin: [-180, 90], resolutions: TREK_RES, tileSize: 256 }),
      wrapX: false,
      crossOrigin: "anonymous",
      attributions: "NASA/JPL-Caltech, USGS Astrogeology (Trek)",
    }),
  });
}

/**
 * A computed RGBA raster as an image layer source. The canvas itself is handed to the map: no PNG encoding, no data URL
 * (a blocking `toDataURL` per layer used to freeze the page for a moment each time a layer was built).
 */
function rasterSource(data: Uint8ClampedArray, w: number, h: number, dem: SiteDem): ImageSource {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  return new ImageSource({
    projection: "EPSG:4326",
    loader: createLoader({ url: "", imageExtent: extentOf(dem), load: () => Promise.resolve(c) }),
  });
}

function extentOf(dem: SiteDem): [number, number, number, number] {
  const b = dem.meta.bounds;
  return [b.west, b.south, b.east, b.north];
}

function imageLayer(source: ImageSource, z: number): ImageLayer<ImageSource> {
  const l = new ImageLayer({ source });
  l.setZIndex(z);
  return l;
}

/** Top-down map: elevation colour with relief from the tile, optional modeled data layers, orthophoto, CTX relief, real traverse. */
export function SiteMap({ lat, lon, centre, zoom, stationName, basemap, dataLayers, showCtx, showZone, dem, traverseUrl, places, onCursor, eva, onMapClick, followTo }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const layers = useRef<{
    mdim: TileLayer<XYZ>;
    mola: TileLayer<XYZ>;
    ctx: TileLayer<XYZ>;
    zone: VectorLayer<VectorSource>;
    elev?: ImageLayer<ImageSource>;
    ortho?: ImageLayer<ImageSource>;
    data: Partial<Record<DataLayer, ImageLayer<ImageSource>>>;
  } | null>(null);
  const active = useRef<DataLayer[]>([]);
  const evaSource = useRef<VectorSource | null>(null);
  const pingRef = useRef<Overlay | null>(null);
  const swoopedZoom = useRef<number | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const ctxHold = useRef(false);
  const showCtxRef = useRef(showCtx);
  showCtxRef.current = showCtx;
  const [error, setError] = useState<string | null>(null);

  // value rasters (in layer units) for the cursor readouts, computed on first use
  const valueCache = useRef<{ dem: SiteDem | null; vals: Partial<Record<RasterKind, Float32Array>> }>({ dem: null, vals: {} });
  const valuesFor = (kind: RasterKind): Float32Array | null => {
    if (!dem) return null;
    if (valueCache.current.dem !== dem) valueCache.current = { dem, vals: { elevation: dem.heights } };
    const c = valueCache.current.vals;
    if (!c[kind]) {
      const { dx, dy } = pixelSizeM(dem.meta);
      c[kind] = layerValues(kind, dem.heights, dem.meta.width, dem.meta.height, dx, dy);
    }
    return c[kind]!;
  };
  const valuesForRef = useRef(valuesFor);
  valuesForRef.current = valuesFor;

  useEffect(() => {
    active.current = dataLayers;
  }, [dataLayers]);

  useEffect(() => {
    if (!host.current) return;
    ctxHold.current = false;
    const lon180 = wrapLon180(lon);
    const mid = centre ?? { lat, lon };
    const mdim = trekLayer("Mars_Viking_MDIM21_ClrMosaic_global_232m");
    const mola = trekLayer("Mars_MGS_MOLA_ClrShade_merge_global_463m");
    mdim.setZIndex(0);
    mola.setZIndex(1);
    const detail = createCtxDetailLoader();
    const ctx = new TileLayer({
      className: "site-map__ctx",
      source: new XYZ({
        projection: "EPSG:4326",
        url: CTX_URL,
        tileGrid: new TileGrid({ extent: [-180, -90, 180, 90], origin: [-180, 90], resolutions: CTX_TILE_RES, tileSize: 512 }),
        wrapX: false,
        crossOrigin: "anonymous",
        attributions: "NASA/JPL/MSSS/Caltech Murray Lab/Esri (CTX beta mosaic)",
        // every tile is loaded when the view reaches its level and turned into a neutral detail tile (see ctxDetailTile)
        tileLoadFunction: (tile, src) => detail.load(src, (tile as ImageTile).getImage() as HTMLImageElement),
      }),
    });
    ctx.setZIndex(20);

    // computed raster of the elevation tile (the data layers are built the first time they are switched on) and its orthophoto
    let elev: ImageLayer<ImageSource> | undefined;
    let ortho: ImageLayer<ImageSource> | undefined;
    if (dem) {
      const g = displayGrid(dem.heights, dem.meta.width, dem.meta.height, dem.meta);
      const { data } = renderRaster("elevation", g.h, g.w, g.ht, g.meta, { shade: 0.8 });
      elev = imageLayer(rasterSource(data, g.w, g.ht, dem), 3);
      if (dem.meta.imagery) ortho = imageLayer(new ImageStatic({ url: `${dem.dir}/${dem.meta.imagery}`, imageExtent: extentOf(dem), projection: "EPSG:4326" }), 2);
    }

    const markers = new VectorSource();
    const station = new Feature({ geometry: new Point([lon180, lat]) });
    station.setStyle(
      new Style({
        image: new CircleStyle({ radius: 7, fill: new Fill({ color: accentColor() }), stroke: new Stroke({ color: "#06121a", width: 2 }) }),
        text: new Text({
          text: places?.length ? "" : stationName, // with named places the station is already labelled
          offsetY: -18,
          font: "600 12px Inter, sans-serif",
          fill: new Fill({ color: "#ffffff" }),
          stroke: new Stroke({ color: "#06121a", width: 3 }),
        }),
      }),
    );
    markers.addFeature(station);
    const markerLayer = new VectorLayer({ source: markers });
    markerLayer.setZIndex(50);

    const zoneSource = new VectorSource();
    const hit = zoneAt(lat, lon);
    if (hit) {
      const ring = ringPoints(hit.zone.lat, hit.zone.lon, ZONE_RADIUS_KM, 96, 1).map((p) => {
        const ll = vector3ToLatLon(p);
        return [wrapLon180(ll.lon), ll.lat];
      });
      ring.push(ring[0]!);
      const f = new Feature({ geometry: new Polygon([ring]) });
      f.setStyle(
        new Style({
          stroke: new Stroke({ color: "#fff1e8", width: 2, lineDash: [8, 6] }),
          text: new Text({ text: `${hit.zone.name} Exploration Zone (${ZONE_RADIUS_KM} km)`, font: "11px Inter, sans-serif", fill: new Fill({ color: "#fff1e8" }), stroke: new Stroke({ color: "#1c0606", width: 3 }), offsetY: 0 }),
        }),
      );
      zoneSource.addFeature(f);
    }
    const zone = new VectorLayer({ source: zoneSource, visible: showZone });
    zone.setZIndex(30);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extra: Array<VectorLayer<any>> = [];
    if (traverseUrl) {
      extra.push(
        new VectorLayer({
          source: new VectorSource({ url: traverseUrl, format: new GeoJSON() }),
          style: [new Style({ stroke: new Stroke({ color: "rgba(12,2,2,0.8)", width: 6 }) }), new Style({ stroke: new Stroke({ color: "#fff1e8", width: 3 }) })],
        }),
      );
    }
    if (places?.length) {
      const ps = new VectorSource();
      for (const p of places) {
        const f = new Feature({ geometry: new Point([wrapLon180(p.lon), p.lat]) });
        f.setStyle(
          new Style({
            image: new CircleStyle({ radius: 6, fill: new Fill({ color: "#d17fb8" }), stroke: new Stroke({ color: "#06121a", width: 2 }) }),
            text: new Text({ text: p.name, offsetY: -16, font: "12px Inter, sans-serif", fill: new Fill({ color: "#ffffff" }), stroke: new Stroke({ color: "#06121a", width: 3 }) }),
          }),
        );
        ps.addFeature(f);
      }
      extra.push(new VectorLayer({ source: ps, declutter: true }));
    }
    extra.forEach((l) => l.setZIndex(40));

    const evaLayer = new VectorLayer({ source: new VectorSource() });
    evaLayer.setZIndex(45);
    evaSource.current = evaLayer.getSource();

    const view = new View({
      projection: "EPSG:4326",
      center: [wrapLon180(mid.lon), mid.lat],
      resolutions: CTX_RES,
      zoom,
      extent: [-180, -90, 180, 90],
      constrainResolution: false,
    });
    const map = new Map({
      target: host.current,
      layers: [mdim, mola, ...(ortho ? [ortho] : []), ...(elev ? [elev] : []), ctx, zone, ...extra, evaLayer, markerLayer],
      view,
      controls: [new Zoom(), new Attribution({ collapsible: false })],
    });
    mapRef.current = map;
    layers.current = { mdim, mola, ctx, zone, elev, ortho, data: {} };

    // blue rings that go out from a dropped pin
    const pingEl = document.createElement("div");
    pingEl.className = "pin-ping";
    pingEl.innerHTML = "<i></i><i></i><i></i>";
    const ping = new Overlay({ element: pingEl, positioning: "center-center", stopEvent: false });
    map.addOverlay(ping);
    pingRef.current = ping;

    // the entry fly-in: the map starts a few levels out and settles on the place (once per zoom level, not on every data update)
    let swoopTimer = 0;
    if (swoopedZoom.current !== zoom && !reducedMotion()) {
      swoopedZoom.current = zoom;
      view.setZoom(Math.max(0, zoom - 3.2));
      // the CTX camera tiles wait for the fly-in to land: during it the map passes through three or four zoom levels, and
      // asking Esri for the tiles of every one of them is slow, wasteful and gets rate-limited (HTTP 429, then "gaps")
      ctxHold.current = true;
      ctx.setVisible(false);
      const release = () => {
        ctxHold.current = false;
        ctx.setVisible(showCtxRef.current);
      };
      view.animate({ zoom, duration: 2600, easing: easeOut }, release);
      // a page that is not drawing (hidden tab) never finishes the animation: land on the place anyway
      swoopTimer = window.setTimeout(() => {
        if (view.getAnimating()) {
          view.cancelAnimations();
          view.setZoom(zoom);
        }
      }, 3400);
    } else {
      swoopedZoom.current = zoom;
    }

    map.on("singleclick", (e) => {
      const c = e.coordinate;
      if (c && clickRef.current) clickRef.current({ lat: c[1]!, lon: c[0]! });
    });

    map.on("pointermove", (e) => {
      const c = e.coordinate;
      if (!c) return;
      const res = view.getResolution() ?? CTX_RES[zoom] ?? CTX_RES[10]!;
      const readouts: string[] = [];
      if (dem) {
        const el = valueAt("elevation", valuesForRef.current("elevation")!, dem.meta, c[1]!, c[0]!);
        if (el !== null) readouts.push(`Elevation ${Math.round(el)} m`);
        const sl = valueAt("slope", valuesForRef.current("slope")!, dem.meta, c[1]!, c[0]!);
        if (sl !== null) readouts.push(`Slope ${sl.toFixed(1)}°`);
        for (const k of active.current) {
          if (k === "slope") continue;
          const v = valueAt(k, valuesForRef.current(k)!, dem.meta, c[1]!, c[0]!);
          if (v !== null) readouts.push(`${k} ${v.toFixed(k === "pressure" ? 0 : k === "radiation" || k === "hazard" ? 2 : 1)}`);
        }
      }
      onCursor?.({ lat: c[1]!, lon: c[0]!, metresPerPx: resolutionToMetres(res, c[1]!), readouts });
    });
    (map.getViewport() as HTMLElement | undefined)?.addEventListener("pointerleave", () => onCursor?.(null));

    ctx.getSource()?.on("tileloaderror", () => setError("The CTX camera mosaic has gaps here (it is a beta product): grey areas are missing tiles, not an error in the map."));
    mdim.getSource()?.on("tileloaderror", () => setError("Some orbital map tiles could not be loaded (network or the NASA tile service)."));

    return () => {
      window.clearTimeout(swoopTimer);
      ctxHold.current = false;
      detail.dispose();
      pingRef.current = null;
      map.setTarget(undefined);
      mapRef.current = null;
      layers.current = null;
    };
    // the map is rebuilt only when the site or its data changes; toggles below only flip layer visibility
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, centre?.lat, centre?.lon, zoom, traverseUrl, places, dem]);

  useEffect(() => {
    if (followTo) mapRef.current?.getView().setCenter(followTo);
  }, [followTo]);

  // the EVA plan: redrawn whenever it changes (and after the map is rebuilt)
  useEffect(() => {
    const src = evaSource.current;
    if (!src) return;
    src.clear();
    pingRef.current?.setPosition(eva?.pin ?? undefined);
    if (!eva) return;
    const halo = new Style({ stroke: new Stroke({ color: "rgba(5,8,12,0.8)", width: 7 }) });
    const line = new Style({ stroke: new Stroke({ color: "#5ec8ff", width: 4 }) });
    if (eva.path.length > 1) {
      const route = new Feature({ geometry: new LineString(eva.path) });
      route.setStyle([halo, line]);
      src.addFeature(route);
    }
    if (eva.ring && eva.ring.length > 2) {
      const r = new Feature({ geometry: new Polygon([[...eva.ring, eva.ring[0]!]]) });
      r.setStyle([
        new Style({ fill: new Fill({ color: "rgba(58,160,255,0.10)" }) }),
        new Style({ stroke: new Stroke({ color: "rgba(5,8,12,0.65)", width: 5 }) }),
        new Style({ stroke: new Stroke({ color: "#3aa0ff", width: 2.5, lineDash: [10, 7] }) }),
      ]);
      src.addFeature(r);
    }
    if (eva.pin) {
      const f = new Feature({ geometry: new Point(eva.pin) });
      f.setStyle([
        new Style({ image: new CircleStyle({ radius: 14, stroke: new Stroke({ color: "rgba(94,200,255,0.55)", width: 2 }) }) }),
        new Style({ image: new CircleStyle({ radius: 5, fill: new Fill({ color: "#5ec8ff" }), stroke: new Stroke({ color: "#06121a", width: 2 }) }) }),
      ]);
      src.addFeature(f);
    }
    eva.stops.forEach((p, i) => {
      const f = new Feature({ geometry: new Point(p) });
      f.setStyle(
        new Style({
          image: new RegularShape({ points: 4, radius: 11, angle: 0, fill: new Fill({ color: "#06121a" }), stroke: new Stroke({ color: "#5ec8ff", width: 2 }) }),
          text: new Text({ text: String(i + 1), font: "700 11px Inter, sans-serif", fill: new Fill({ color: "#ffffff" }) }),
        }),
      );
      src.addFeature(f);
      const name = eva.names?.[i];
      if (name) {
        const lab = new Feature({ geometry: new Point(p) });
        lab.setStyle(new Style({ text: new Text({ text: name, offsetY: 24, font: "600 11px Inter, sans-serif", fill: new Fill({ color: "#cfeeff" }), stroke: new Stroke({ color: "#06121a", width: 3 }) }) }));
        src.addFeature(lab);
      }
    });
    if (eva.noReturn) {
      const f = new Feature({ geometry: new Point(eva.noReturn) });
      f.setStyle(
        new Style({
          image: new CircleStyle({ radius: 8, fill: new Fill({ color: "#ff5a4d" }), stroke: new Stroke({ color: "#ffffff", width: 2 }) }),
          text: new Text({ text: "POINT OF NO RETURN", offsetY: -20, font: "700 11px Inter, sans-serif", fill: new Fill({ color: "#ff5a4d" }), stroke: new Stroke({ color: "#06121a", width: 3 }) }),
        }),
      );
      src.addFeature(f);
    }
    if (eva.ev1) {
      const color = eva.ev1State === "reserve" ? "#ff3b30" : eva.ev1State === "past-no-return" ? "#ffb000" : "#ffffff";
      const f = new Feature({ geometry: new Point(eva.ev1) });
      f.setStyle(
        new Style({
          image: new RegularShape({ points: 4, radius: 9, angle: 0, fill: new Fill({ color }), stroke: new Stroke({ color: "#06121a", width: 2 }) }),
          text: new Text({ text: "EV1", offsetX: 22, font: "700 12px Inter, sans-serif", fill: new Fill({ color }), stroke: new Stroke({ color: "#06121a", width: 3 }) }),
        }),
      );
      src.addFeature(f);
    }
  }, [eva, lat, lon, centre?.lat, centre?.lon, zoom, traverseUrl, places, dem]);

  useEffect(() => {
    const l = layers.current;
    const map = mapRef.current;
    if (!l || !map) return;
    // data layers are computed the first time they are wanted (a 3 million pixel tile makes five of them slow to build upfront)
    if (dem) {
      for (const k of dataLayers) {
        if (l.data[k]) continue;
        // the tour flips through the layers, so it draws them from a coarser grid still (they are built the first time they are shown)
        const g = displayGrid(dem.heights, dem.meta.width, dem.meta.height, dem.meta, useAppStore.getState().autopilotRunning ? 640 : 1024);
        const { data } = renderRaster(k, g.h, g.w, g.ht, g.meta, { shade: 0.55, alpha: 0.72 });
        const layer = imageLayer(rasterSource(data, g.w, g.ht, dem), 10);
        l.data[k] = layer;
        map.addLayer(layer);
      }
    }
    const hasElev = !!l.elev;
    // the orthophoto sits on the natural colour mosaic (not on the green and blue elevation colours)
    l.mdim.setVisible(basemap === "mdim" || basemap === "ortho" || (basemap === "elev" && !hasElev));
    // MOLA colour is the base outside the elevation raster; under the raster it is only context
    l.mola.setVisible(basemap === "mola" || (basemap === "elev" && hasElev));
    l.mola.setOpacity(basemap === "elev" ? 0.55 : 1);
    l.elev?.setVisible(basemap === "elev");
    l.ortho?.setVisible(basemap === "ortho");
    for (const k of DATA_LAYERS) l.data[k]?.setVisible(dataLayers.includes(k));
    l.ctx.setVisible(showCtx && !ctxHold.current);
    l.zone.setVisible(showZone);
  }, [basemap, dataLayers, showCtx, showZone, dem]);

  return (
    <div className="site-map" data-testid="site-map">
      <div ref={host} className={`site-map__canvas${onMapClick ? " is-planning" : ""}`} />
      {error && <div className="site-map__error" role="status">{error}</div>}
      <div className="site-map__scale" data-testid="site-map-scale" translate="no">
        {formatLatLon(lat, lon, 3)} · {MARS_KM_PER_DEG.toFixed(2)} km per degree
      </div>
    </div>
  );
}
