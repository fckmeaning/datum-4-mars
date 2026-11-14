import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import WebGLTileLayer from "ol/layer/WebGLTile";
import ImageLayer from "ol/layer/Image";
import ImageStatic from "ol/source/ImageStatic";
import GeoTIFF from "ol/source/GeoTIFF";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import DragRotate from "ol/interaction/DragRotate";
import { altKeyOnly } from "ol/events/condition";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from "ol/style";
import type { Coordinate } from "ol/coordinate";
import type RenderEvent from "ol/render/Event";
import { ensureMarsAoiProjection, toMarsAoi, fromMarsAoi, PROJ_CODE } from "./projection";
import { accentColor } from "../app/accent";
import { useAppStore } from "../state/store";
import type { Place, LayerMeta } from "../api/client";
import { apiFetch } from "../static/apiFetch";
import { getBestElevationLayer, getOpticalLayer, getWalkabilityLayer } from "./layerLevel";
import { createEllipseCoordinates } from "./ellipse";
import { getProfileColor, formatRouteTimeBubble } from "./routeRender";
import "./map2d.css";
import { classFor, readClasses } from "./layers/classes";
import { firstBand } from "./layers/readPixel";
import { parseIsochrones, unpackBits, viewshedExtent, viewshedRgba, type ViewshedPayload } from "./layers/decoders";
import { buildLegend, isochroneColor } from "./layers/legend";
import { finestResolution, slopeDegFromSamples } from "./layers/scale";
import { datedSnapshots, shouldShowTimeline, swipeScissor } from "./layers/timeline";
import {
  DEFAULT_NO_GO_DEG,
  GALE_ELEVATION_RANGE,
  hillshadeColor,
  opticalColor,
  reliefColor,
  slopeColor,
  walkabilityColor,
} from "./layers/terrainStyle";
import { LegendCard } from "./overlays/LegendCard";
import { MapStatusBar, type CursorReadout } from "./overlays/MapStatusBar";
import { MapContextMenu, type ContextMenuState } from "./overlays/MapContextMenu";
import { MapNotices, type Notice } from "./overlays/MapNotice";
import { TimeSlider, type TimeMode } from "./overlays/TimeSlider";
import { ZoomButtons } from "./overlays/ZoomButtons";

interface Map2DProps {
  places?: Place[];
  layers?: LayerMeta[];
  onSelectPlace?: (place: Place) => void;
  onCursorMove?: (coords: { lat: number; lon: number } | null) => void;
  onMapContextMenu?: (coords: { lat: number; lon: number }) => void;
  /** Called once with the OpenLayers map (the route builder attaches its interactions here). */
  onMapReady?: (map: Map) => void;
  localizationEllipse?: {
    lat: number;
    lon: number;
    a_m: number;
    b_m: number;
    angle_deg: number;
  } | null;
}

/** Drawing order. */
const Z = { elevation: 1, optical: 2, snapshot: 3, hillshade: 4, slope: 5, walkability: 6, viewshed: 8, traverse: 9, isochrones: 11, routes: 12, ellipse: 15, places: 20 } as const;

const NODATA_DEM = -32768; // data/pipeline/common.py NODATA (elevation, walkability uses 255)
const FALLBACK_ELEVATION = { cog_url: "/data/gale/L1/elevation.tif", resolution_m: 200 };
const ISOCHRONE_MINUTES = [15, 30, 60, 90, 120];
const VIEWSHED_RADIUS_M = 3000;

/** Key -> layer id (the same ids the layer switcher writes to the store). */
const KEY_LAYER: Record<string, { id: string; fallback: boolean }> = {
  "1": { id: "elevation", fallback: true },
  "2": { id: "optical", fallback: true },
  "3": { id: "slope", fallback: false },
  "4": { id: "hillshade", fallback: false },
  "5": { id: "walkability", fallback: false },
  "6": { id: "traverse", fallback: true },
};

function makeSource(url: string, nodata: number): GeoTIFF {
  return new GeoTIFF({
    sources: [{ url, nodata }],
    convertToRGB: false,
    // float elevations: without this OpenLayers rescales band values to 0..1 and every metre value in the styles collapses
    normalize: false,
  });
}

function newRasterLayer(z: number, visible: boolean, opacity: number): WebGLTileLayer {
  return new WebGLTileLayer({ zIndex: z, visible, opacity, style: { variables: { resM: 200 }, color: ["color", 0, 0, 0, 0] } });
}

export function Map2D({ places = [], layers = [], onSelectPlace, onCursorMove, onMapContextMenu, onMapReady, localizationEllipse }: Map2DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<View | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const routesSourceRef = useRef<VectorSource | null>(null);
  const traverseSourceRef = useRef<VectorSource | null>(null);
  const ellipseSourceRef = useRef<VectorSource | null>(null);
  const isoSourceRef = useRef<VectorSource | null>(null);
  const isoLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const traverseLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const viewshedLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  const viewshedMarkRef = useRef<VectorSource | null>(null);
  const rasters = useRef<{
    elevation: WebGLTileLayer | null;
    optical: WebGLTileLayer | null;
    hillshade: WebGLTileLayer | null;
    slope: WebGLTileLayer | null;
    walkability: WebGLTileLayer | null;
  }>({ elevation: null, optical: null, hillshade: null, slope: null, walkability: null });
  const sourceUrls = useRef<{ elevation: string | null; optical: string | null; walkability: string | null }>({ elevation: null, optical: null, walkability: null });
  const cellRef = useRef<{ elevation: number; optical: number | null }>({ elevation: 200, optical: null });
  const isoLoadedRef = useRef(false);
  const snapLayers = useRef<Record<string, WebGLTileLayer>>({});
  const swipeRef = useRef(0.5);
  const noticeSeq = useRef(0);

  const [rasterStatus, setRasterStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [mpp, setMpp] = useState(30);
  const [cursor, setCursor] = useState<CursorReadout | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [timeActive, setTimeActive] = useState<string | null>(null);
  const [timeCompare, setTimeCompare] = useState<string | null>(null);
  const [timeMode, setTimeMode] = useState<TimeMode>("single");
  const [swipe, setSwipe] = useState(0.5);

  const flyTo = useAppStore((s) => s.flyTo);
  const clearFlyTo = useAppStore((s) => s.clearFlyTo);
  const camera = useAppStore((s) => s.camera);
  const setCamera = useAppStore((s) => s.setCamera);
  const layerStates = useAppStore((s) => s.layers);
  const setLayerState = useAppStore((s) => s.setLayerState);
  const storeEllipse = useAppStore((s) => s.localizationEllipse);
  const routes = useAppStore((s) => s.routes);
  const selectedRouteId = useAppStore((s) => s.selectedRouteId);
  const reducedMotion = useAppStore((s) => s.settings.reducedMotion);

  const activeEllipse = localizationEllipse ?? storeEllipse;

  // Stable access to the latest callbacks / state from long-lived OpenLayers listeners.
  const cb = useRef({ onSelectPlace, onCursorMove, onMapContextMenu });
  cb.current = { onSelectPlace, onCursorMove, onMapContextMenu };
  const live = useRef({ layerStates, reducedMotion });
  live.current = { layerStates, reducedMotion };

  const elevMeta = useMemo(() => getBestElevationLayer(layers), [layers]);
  const opticalMeta = useMemo(() => getOpticalLayer(layers), [layers]);
  const walkMeta = useMemo(() => getWalkabilityLayer(layers), [layers]);
  const snapshots = useMemo(() => datedSnapshots(layers), [layers]);
  const walkBands = useMemo(() => readClasses(walkMeta), [walkMeta]);
  const metaRef = useRef({ walkBands });
  metaRef.current = { walkBands };

  const pushNotice = useCallback((text: string, tone: Notice["tone"] = "info", ttlMs = 6000) => {
    const id = ++noticeSeq.current;
    setNotices((n) => [...n.slice(-2), { id, tone, text }]);
    if (ttlMs > 0) window.setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), ttlMs);
  }, []);
  const dismissNotice = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);

  // ---------------------------------------------------------------------------------------------------------------
  // Map creation: once. Layers are created empty and receive their sources when the layer list arrives.
  useEffect(() => {
    if (!mapContainerRef.current) return;
    ensureMarsAoiProjection();
    const st = live.current.layerStates;
    const vis = (id: string, d: boolean) => st[id]?.visible ?? d;
    const opa = (id: string, d: number) => st[id]?.opacity ?? d;

    const view = new View({
      projection: PROJ_CODE,
      center: toMarsAoi([camera.center.lon, camera.center.lat]),
      zoom: camera.zoom,
      minZoom: 9,
      maxZoom: 18,
    });
    viewRef.current = view;

    const vectorSource = new VectorSource();
    const routesSource = new VectorSource();
    const traverseSource = new VectorSource();
    const ellipseSource = new VectorSource();
    const isoSource = new VectorSource();
    const viewshedMark = new VectorSource();
    vectorSourceRef.current = vectorSource;
    routesSourceRef.current = routesSource;
    traverseSourceRef.current = traverseSource;
    ellipseSourceRef.current = ellipseSource;
    isoSourceRef.current = isoSource;
    viewshedMarkRef.current = viewshedMark;

    const traverseLayer = new VectorLayer({
      source: traverseSource,
      zIndex: Z.traverse,
      visible: vis("traverse", true),
      opacity: opa("traverse", 1),
      style: [
        new Style({ stroke: new Stroke({ color: "rgba(8,12,16,0.85)", width: 5, lineCap: "round", lineJoin: "round" }) }),
        new Style({ stroke: new Stroke({ color: "#E3B341", width: 2.5, lineCap: "round", lineJoin: "round" }) }),
      ],
    });
    traverseLayerRef.current = traverseLayer;

    const isoLayer = new VectorLayer({ source: isoSource, zIndex: Z.isochrones, visible: vis("isochrones", false), opacity: opa("isochrones", 1) });
    isoLayerRef.current = isoLayer;
    const routesLayer = new VectorLayer({ source: routesSource, zIndex: Z.routes });
    const ellipseLayer = new VectorLayer({ source: ellipseSource, zIndex: Z.ellipse });
    const viewshedMarkLayer = new VectorLayer({
      source: viewshedMark,
      zIndex: Z.viewshed + 1,
      style: new Style({
        image: new CircleStyle({ radius: 6, fill: new Fill({ color: "#14B8A6" }), stroke: new Stroke({ color: "#FFFFFF", width: 2 }) }),
      }),
    });
    // overlapping labels thin out instead of stacking
    const vectorLayer = new VectorLayer({ source: vectorSource, zIndex: Z.places, declutter: true });

    const R = rasters.current;
    R.elevation = newRasterLayer(Z.elevation, vis("elevation", true), opa("elevation", 1));
    R.optical = newRasterLayer(Z.optical, vis("optical", true), opa("optical", 1));
    R.hillshade = newRasterLayer(Z.hillshade, vis("hillshade", false), opa("hillshade", 0.8));
    R.slope = newRasterLayer(Z.slope, vis("slope", false), opa("slope", 0.8));
    R.walkability = newRasterLayer(Z.walkability, vis("walkability", false), opa("walkability", 0.85));

    const map = new Map({
      target: mapContainerRef.current,
      layers: [R.elevation, R.optical, R.hillshade, R.slope, R.walkability, traverseLayer, isoLayer, routesLayer, ellipseLayer, viewshedMarkLayer, vectorLayer],
      view,
      controls: [],
    });
    // Alt-drag rotates (the default needs Alt+Shift); pinch rotation stays on.
    map.addInteraction(new DragRotate({ condition: altKeyOnly }));
    mapRef.current = map;

    // Cursor readout: coordinates are cheap, GPU sampling (readPixels) is throttled to ~8 Hz.
    let pending: { pixel: number[]; coordinate: number[] } | null = null;
    let timer: number | null = null;
    const sample = (px: number[]): { elevationM: number | null; slopeDeg: number | null } => {
      const el = rasters.current.elevation;
      if (!el || !el.getVisible()) return { elevationM: null, slopeDeg: null };
      const read = (p: number[]): number => {
        const v = firstBand(el.getData(p));
        return Number.isFinite(v) && v > -30000 ? v : Number.NaN;
      };
      const z = read(px);
      const res = view.getResolution() ?? 1;
      const span = Math.max(1, Math.round(cellRef.current.elevation / res));
      const slope = slopeDegFromSamples(read([px[0]! + span, px[1]!]), read([px[0]! - span, px[1]!]), read([px[0]!, px[1]! - span]), read([px[0]!, px[1]! + span]), span * res);
      return { elevationM: Number.isFinite(z) ? z : null, slopeDeg: Number.isFinite(slope) ? slope : null };
    };
    const flush = (): void => {
      timer = null;
      if (!pending) return;
      const [lon, lat] = fromMarsAoi(pending.coordinate as [number, number]);
      const s = sample(pending.pixel);
      let walkability: CursorReadout["walkability"] = null;
      const wl = rasters.current.walkability;
      if (wl?.getVisible()) {
        const v = firstBand(wl.getData(pending.pixel));
        const band = Number.isFinite(v) && v <= 100 ? classFor(v, metaRef.current.walkBands) : undefined;
        if (band) walkability = { value: Math.round(v), label: band.label, color: band.color };
      }
      setCursor({ lat, lon, ...s, walkability });
      cb.current.onCursorMove?.({ lat, lon });
      pending = null;
    };
    map.on("pointermove", (e) => {
      if (e.dragging) return;
      pending = { pixel: e.pixel, coordinate: e.coordinate };
      if (timer === null) timer = window.setTimeout(flush, 120);
    });

    map.on("click", (e) => {
      const feature = map.forEachFeatureAtPixel(e.pixel, (f) => f);
      const placeData = feature?.get("placeData") as Place | undefined;
      if (placeData) cb.current.onSelectPlace?.(placeData);
    });

    const viewport = map.getViewport();
    const onContext = (e: MouseEvent): void => {
      e.preventDefault();
      const coord = map.getCoordinateFromPixel(map.getEventPixel(e)) as [number, number] | null;
      const box = wrapperRef.current?.getBoundingClientRect();
      if (!coord || !box) return;
      const [lon, lat] = fromMarsAoi(coord);
      setMenu({ x: e.clientX - box.left, y: e.clientY - box.top, lat, lon });
    };
    viewport?.addEventListener("contextmenu", onContext);

    const onRes = (): void => {
      const r = view.getResolution();
      if (r) setMpp(r);
      const z = view.getZoom();
      if (z !== undefined) setCamera({ zoom: Math.round(z * 10) / 10 });
    };
    const onCenter = (): void => {
      const c = view.getCenter();
      if (c) {
        const [lon, lat] = fromMarsAoi(c as [number, number]);
        setCamera({ center: { lat, lon } });
      }
    };
    const onRot = (): void => {
      setCamera({ heading_deg: Math.round((-view.getRotation() * 180) / Math.PI * 10) / 10 });
    };
    view.on("change:resolution", onRes);
    view.on("change:center", onCenter);
    view.on("change:rotation", onRot);
    onRes();
    onMapReady?.(map);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      viewport?.removeEventListener("contextmenu", onContext);
      view.un("change:resolution", onRes);
      view.un("change:center", onCenter);
      view.un("change:rotation", onRot);
      map.setTarget(undefined);
      map.dispose();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; everything else is reached through refs
  }, []);

  // ---------------------------------------------------------------------------------------------------------------
  // The layer list arrives from the API after the map exists: give every raster layer its source and style.
  const applyElevation = useCallback(
    (meta: { cog_url?: string | null; resolution_m?: number | null }) => {
      const R = rasters.current;
      const url = meta.cog_url;
      if (!url || !R.elevation || sourceUrls.current.elevation === url) return;
      sourceUrls.current.elevation = url;
      setRasterStatus("loading");
      const source = makeSource(url, NODATA_DEM);
      source.on("change", () => {
        const s = source.getState();
        if (s === "ready") setRasterStatus("ready");
        else if (s === "error") setRasterStatus("unavailable");
      });
      const resM = meta.resolution_m ?? 200;
      cellRef.current.elevation = resM;
      for (const l of [R.elevation, R.hillshade, R.slope]) l?.setSource(source);
      const variables = { resM };
      R.elevation.setStyle({ variables, color: reliefColor(GALE_ELEVATION_RANGE) });
      R.hillshade?.setStyle({ variables, color: hillshadeColor() });
      R.slope?.setStyle({ variables, color: slopeColor(DEFAULT_NO_GO_DEG) });
    },
    [],
  );

  useEffect(() => {
    const R = rasters.current;
    if (elevMeta) applyElevation(elevMeta);
    if (opticalMeta?.cog_url && R.optical && sourceUrls.current.optical !== opticalMeta.cog_url) {
      sourceUrls.current.optical = opticalMeta.cog_url;
      R.optical.setSource(makeSource(opticalMeta.cog_url, opticalMeta.nodata ?? 0));
      const vr = opticalMeta.value_range;
      R.optical.setStyle({ color: opticalColor(vr && vr.length === 2 ? [vr[0]!, vr[1]!] : [10, 195]) });
      cellRef.current.optical = opticalMeta.resolution_m ?? null;
    }
    if (walkMeta?.cog_url && R.walkability && sourceUrls.current.walkability !== walkMeta.cog_url) {
      sourceUrls.current.walkability = walkMeta.cog_url;
      R.walkability.setSource(makeSource(walkMeta.cog_url, walkMeta.nodata ?? 255));
      R.walkability.setStyle({ color: walkabilityColor(walkBands) });
    }
  }, [elevMeta, opticalMeta, walkMeta, walkBands, applyElevation]);

  // If the API never delivers a layer list, fall back to the coarse L1 file so the map is not empty.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (sourceUrls.current.elevation === null) applyElevation(FALLBACK_ELEVATION);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [applyElevation]);

  // Zoom limit follows the finest visible data: no pretending to show detail the data does not have.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const opticalOn = !!opticalMeta && (layerStates.optical?.visible ?? true);
    const cell = opticalOn && cellRef.current.optical ? Math.min(cellRef.current.elevation, cellRef.current.optical) : cellRef.current.elevation;
    const z = view.getZoomForResolution(finestResolution(cell));
    if (z !== undefined) view.setMaxZoom(Math.min(20, Math.max(12, z)));
  }, [elevMeta, opticalMeta, layerStates.optical?.visible]);

  // ---------------------------------------------------------------------------------------------------------------
  // Visibility / opacity from the store, by ref: layers are never re-created.
  useEffect(() => {
    const st = layerStates;
    const R = rasters.current;
    const snapActive = timeActive !== null && shouldShowTimeline(snapshots);
    const set = (l: { setVisible: (v: boolean) => void; setOpacity: (o: number) => void } | null, id: string, vd: boolean, od: number, extra = true): void => {
      l?.setVisible((st[id]?.visible ?? vd) && extra);
      l?.setOpacity(st[id]?.opacity ?? od);
    };
    set(R.elevation, "elevation", true, 1);
    set(R.optical, "optical", true, 1, !!opticalMeta && !snapActive);
    set(R.hillshade, "hillshade", false, 0.8);
    set(R.slope, "slope", false, 0.8);
    set(R.walkability, "walkability", false, 0.85, !!walkMeta);
    set(traverseLayerRef.current, "traverse", true, 1);
    set(isoLayerRef.current, "isochrones", false, 1);
    set(viewshedLayerRef.current, "viewshed", false, 1);
  }, [layerStates, opticalMeta, walkMeta, timeActive, snapshots]);

  // ---------------------------------------------------------------------------------------------------------------
  // Real Curiosity traverse.
  useEffect(() => {
    const source = traverseSourceRef.current;
    if (!source) return;
    let active = true;
    fetch("/data/gale/traverse.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("traverse unavailable");
        return res.json() as Promise<{ features?: { geometry?: { coordinates?: [number, number][] } }[] }>;
      })
      .then((geojson) => {
        if (!active) return;
        source.clear();
        for (const feat of geojson.features ?? []) {
          const coords = feat.geometry?.coordinates ?? [];
          if (coords.length > 1) source.addFeature(new Feature({ geometry: new LineString(coords.map(([lon, lat]) => toMarsAoi([lon, lat]))), name: "Curiosity traverse (real)" }));
        }
      })
      .catch(() => {
        /* the traverse file is optional */
      });
    return () => {
      active = false;
    };
  }, []);

  // Places.
  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) return;
    source.clear();
    for (const place of places) {
      const [x, y] = toMarsAoi([place.lon, place.lat]);
      const feature = new Feature({ geometry: new Point([x, y]), placeData: place });
      const isBase = place.kind === "base";
      const isScience = place.science_target;
      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: isBase ? 9 : isScience ? 7 : 5,
            fill: new Fill({ color: isBase ? accentColor() : isScience ? "#CC79A7" : "#E69F00" }),
            stroke: new Stroke({ color: "#080C10", width: 2 }),
          }),
          text: new Text({
            text: place.name,
            offsetY: -14,
            font: "12px Inter, sans-serif",
            fill: new Fill({ color: "#FFFFFF" }),
            stroke: new Stroke({ color: "rgba(8,12,16,0.85)", width: 3 }),
          }),
        }),
      );
      source.addFeature(feature);
    }
  }, [places]);

  // Routes with time bubbles on the alternatives.
  useEffect(() => {
    const source = routesSourceRef.current;
    if (!source) return;
    source.clear();
    for (const route of routes) {
      const isSelected = !selectedRouteId || route.route_id === selectedRouteId;
      const baseColor = getProfileColor(route.profile);
      const coords = route.geometry.coordinates.map(([lon, lat]) => toMarsAoi([lon!, lat!]) as Coordinate);
      const routeFeature = new Feature({ geometry: new LineString(coords), routeData: route });
      const styles: Style[] = [
        new Style({ stroke: new Stroke({ color: "rgba(8, 12, 16, 0.8)", width: isSelected ? 7 : 4 }) }),
        new Style({ stroke: new Stroke({ color: isSelected ? baseColor : `${baseColor}66`, width: isSelected ? 4 : 2 }) }),
      ];
      if (!isSelected && coords.length > 1) {
        styles.push(
          new Style({
            geometry: new Point(coords[Math.floor(coords.length / 2)]!),
            text: new Text({
              text: formatRouteTimeBubble(route.totals.time_s),
              font: "bold 11px Inter, sans-serif",
              fill: new Fill({ color: "#FFFFFF" }),
              backgroundFill: new Fill({ color: "rgba(16, 24, 38, 0.85)" }),
              backgroundStroke: new Stroke({ color: baseColor, width: 1.5 }),
              padding: [3, 6, 3, 6],
              offsetY: -10,
            }),
          }),
        );
      }
      routeFeature.setStyle(styles);
      source.addFeature(routeFeature);
    }
  }, [routes, selectedRouteId]);

  // Localization error ellipse.
  useEffect(() => {
    const source = ellipseSourceRef.current;
    if (!source) return;
    source.clear();
    if (!activeEllipse) return;
    const [cx, cy] = toMarsAoi([activeEllipse.lon, activeEllipse.lat]);
    const ellipse = new Feature({ geometry: new Polygon([createEllipseCoordinates(cx, cy, activeEllipse.a_m, activeEllipse.b_m, activeEllipse.angle_deg)]) });
    ellipse.setStyle(new Style({ stroke: new Stroke({ color: "#ffb000", width: 2, lineDash: [6, 4] }), fill: new Fill({ color: "rgba(255, 176, 0, 0.15)" }) }));
    const centre = new Feature({ geometry: new Point([cx, cy]) });
    centre.setStyle(
      new Style({
        image: new CircleStyle({ radius: 5, fill: new Fill({ color: "#ffb000" }), stroke: new Stroke({ color: "#FFFFFF", width: 1.5 }) }),
        text: new Text({ text: `Fix (±${Math.round(activeEllipse.a_m)}m)`, offsetY: 16, font: "11px Inter, sans-serif", fill: new Fill({ color: "#ffb000" }), stroke: new Stroke({ color: "#080C10", width: 2 }) }),
      }),
    );
    source.addFeature(ellipse);
    source.addFeature(centre);
  }, [activeEllipse]);

  // ---------------------------------------------------------------------------------------------------------------
  // Return-time isochrones (loaded the first time the layer is switched on).
  useEffect(() => {
    if (!(layerStates.isochrones?.visible ?? false) || isoLoadedRef.current) return;
    isoLoadedRef.current = true;
    const qs = ISOCHRONE_MINUTES.join(",");
    apiFetch(`/api/v1/sites/gale/isochrones?minutes=${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseIsochrones(await res.json());
      })
      .then((lines) => {
        const source = isoSourceRef.current;
        if (!source) return;
        if (lines.length === 0) throw new Error("empty");
        source.clear();
        lines.forEach((iso, i) => {
          const color = isochroneColor(i, lines.length);
          for (const line of iso.lines) {
            const f = new Feature({ geometry: new LineString(line.map(([lon, lat]) => toMarsAoi([lon, lat]))) });
            f.setStyle([
              new Style({ stroke: new Stroke({ color: "rgba(8,12,16,0.7)", width: 4 }) }),
              new Style({
                stroke: new Stroke({ color, width: 2 }),
                text: new Text({ text: iso.label, placement: "line", repeat: 480, font: "bold 11px Inter, sans-serif", fill: new Fill({ color: "#FFFFFF" }), stroke: new Stroke({ color: "rgba(8,12,16,0.9)", width: 3 }) }),
              }),
            ]);
            source.addFeature(f);
          }
        });
      })
      .catch((err: unknown) => {
        isoLoadedRef.current = false;
        setLayerState("isochrones", { visible: false });
        pushNotice(`Return-time isochrones are not available from the API yet (${err instanceof Error ? err.message : "error"}).`, "warn");
      });
  }, [layerStates.isochrones?.visible, setLayerState, pushNotice]);

  // Line of sight from a point (right-click -> "What can I see from here?").
  const runViewshed = useCallback(
    async (lat: number, lon: number) => {
      const map = mapRef.current;
      if (!map) return;
      pushNotice("Computing line of sight…", "info", 2500);
      try {
        const res = await apiFetch(`/api/v1/sites/gale/viewshed?lat=${lat}&lon=${lon}&radius_m=${VIEWSHED_RADIUS_M}&height_m=2`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message ?? `HTTP ${res.status}`);
        }
        const v = (await res.json()) as ViewshedPayload;
        const { rows, cols } = v.crop;
        const rgba = viewshedRgba(unpackBits(v.visible_b64, rows, cols), unpackBits(v.in_range_b64, rows, cols));
        const canvas = document.createElement("canvas");
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.putImageData(new ImageData(rgba, cols, rows), 0, 0);
        if (viewshedLayerRef.current) map.removeLayer(viewshedLayerRef.current);
        const layer = new ImageLayer({
          zIndex: Z.viewshed,
          source: new ImageStatic({ url: canvas.toDataURL("image/png"), imageExtent: viewshedExtent(v.bounds), projection: PROJ_CODE, interpolate: false }),
        });
        viewshedLayerRef.current = layer;
        map.addLayer(layer);
        const mark = viewshedMarkRef.current;
        mark?.clear();
        mark?.addFeature(new Feature({ geometry: new Point(toMarsAoi([lon, lat])) }));
        setLayerState("viewshed", { visible: true, opacity: 1 });
        pushNotice(`${Math.round(v.visible_fraction * 100)} % of the area within ${VIEWSHED_RADIUS_M / 1000} km is visible from here (observer height 2 m).`, "info", 9000);
      } catch (err) {
        pushNotice(`Line of sight is not available: ${err instanceof Error ? err.message : "error"}.`, "warn");
      }
    },
    [pushNotice, setLayerState],
  );

  // ---------------------------------------------------------------------------------------------------------------
  // TIME-MARS: dated snapshots as layers (only when there are at least two real ones).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !shouldShowTimeline(snapshots)) return;
    for (const s of snapshots) {
      if (snapLayers.current[s.id] || !s.meta.cog_url) continue;
      const layer = newRasterLayer(Z.snapshot, false, 1);
      layer.setSource(makeSource(s.meta.cog_url, s.meta.nodata ?? 0));
      const vr = s.meta.value_range;
      layer.setStyle({ color: opticalColor(vr && vr.length === 2 ? [vr[0]!, vr[1]!] : [10, 195]) });
      // swipe: the compared layer is drawn only to the right of the line
      layer.on("prerender", (e: RenderEvent) => {
        if (swipeActiveRef.current !== s.id) return;
        const gl = e.context as WebGL2RenderingContext | null;
        const size = map.getSize();
        if (!gl || !size) return;
        const r = swipeScissor(swipeRef.current, size[0]!, size[1]!, window.devicePixelRatio || 1);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(r.x, r.y, r.w, r.h);
      });
      layer.on("postrender", (e: RenderEvent) => {
        (e.context as WebGL2RenderingContext | null)?.disable((e.context as WebGL2RenderingContext).SCISSOR_TEST);
      });
      map.addLayer(layer);
      snapLayers.current[s.id] = layer;
    }
    setTimeActive((a) => a ?? snapshots[snapshots.length - 1]!.id);
  }, [snapshots]);
  const swipeActiveRef = useRef<string | null>(null);

  useEffect(() => {
    swipeRef.current = swipe;
    mapRef.current?.render();
  }, [swipe]);

  useEffect(() => {
    swipeActiveRef.current = timeMode === "swipe" ? timeCompare : null;
    for (const [id, layer] of Object.entries(snapLayers.current)) {
      layer.setVisible(id === timeActive || (timeMode === "swipe" && id === timeCompare));
      layer.setZIndex(id === timeCompare && timeMode === "swipe" ? Z.snapshot + 0.5 : Z.snapshot);
    }
    mapRef.current?.render();
  }, [timeActive, timeCompare, timeMode]);

  // ---------------------------------------------------------------------------------------------------------------
  // Rotation: store -> view (the north button resets it), view -> store is in the map effect.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const target = (-camera.heading_deg * Math.PI) / 180;
    if (Math.abs(view.getRotation() - target) > 1e-3) view.animate({ rotation: target, duration: reducedMotion ? 0 : 250 });
  }, [camera.heading_deg, reducedMotion]);

  // flyTo from the store.
  useEffect(() => {
    if (!flyTo || !viewRef.current) return;
    viewRef.current.animate({ center: toMarsAoi([flyTo.target.lon, flyTo.target.lat]), zoom: flyTo.zoomHint ?? 14, duration: reducedMotion ? 0 : 1200 });
    clearFlyTo();
  }, [flyTo, reducedMotion, clearFlyTo]);

  // Keys 1-6 toggle layers (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const entry = KEY_LAYER[e.key];
      if (!entry) return;
      const current = live.current.layerStates[entry.id]?.visible ?? entry.fallback;
      setLayerState(entry.id, { visible: !current });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLayerState]);

  // ---------------------------------------------------------------------------------------------------------------
  const zoomBy = (d: number): void => {
    const view = viewRef.current;
    if (view) view.animate({ zoom: (view.getZoom() ?? 12) + d, duration: live.current.reducedMotion ? 0 : 200 });
  };
  const fit = (): void => viewRef.current?.animate({ center: toMarsAoi([137.4, -4.72]), zoom: 12, rotation: 0, duration: live.current.reducedMotion ? 0 : 400 });

  const legend = useMemo(
    () => buildLegend(layerStates, { elevation: elevMeta, optical: opticalMeta, walkability: walkMeta, noGoDeg: DEFAULT_NO_GO_DEG, isochroneMinutes: ISOCHRONE_MINUTES }),
    [layerStates, elevMeta, opticalMeta, walkMeta],
  );

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Reference grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {timeMode === "swipe" && shouldShowTimeline(snapshots) && <div className="map2d-swipe-line" style={{ left: `${swipe * 100}%` }} />}

      <LegendCard entries={legend} />
      <MapStatusBar metersPerPixel={mpp} cursor={cursor} cellM={opticalMetaVisible(layerStates, opticalMeta) && cellRef.current.optical ? Math.min(cellRef.current.elevation, cellRef.current.optical) : cellRef.current.elevation} />
      <ZoomButtons onIn={() => zoomBy(1)} onOut={() => zoomBy(-1)} onFit={fit} />
      <TimeSlider
        snapshots={snapshots}
        activeId={timeActive}
        compareId={timeCompare ?? snapshots.find((s) => s.id !== timeActive)?.id ?? null}
        mode={timeMode}
        swipe={swipe}
        onActive={setTimeActive}
        onCompare={setTimeCompare}
        onMode={(m) => {
          setTimeMode(m);
          if (m === "swipe" && !timeCompare) setTimeCompare(snapshots.find((s) => s.id !== timeActive)?.id ?? null);
        }}
        onSwipe={setSwipe}
      />
      <MapNotices notices={notices} onDismiss={dismissNotice} />
      <MapContextMenu
        state={menu}
        onClose={() => setMenu(null)}
        onWhatsHere={(lat, lon) => cb.current.onMapContextMenu?.({ lat, lon })}
        onViewshed={(lat, lon) => void runViewshed(lat, lon)}
        onCopy={(lat, lon) => void navigator.clipboard?.writeText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)}
      />

      {rasterStatus !== "ready" && (
        <div
          role="status"
          style={{
            position: "absolute",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(22, 27, 34, 0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            padding: "8px 16px",
            borderRadius: "20px",
            fontSize: "12px",
            color: "#8B949E",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            zIndex: 100,
          }}
        >
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: rasterStatus === "loading" ? "#E3B341" : "#8B949E" }} />
          {rasterStatus === "loading" ? "Loading elevation raster…" : "Elevation raster unavailable (vector layers only)"}
        </div>
      )}
    </div>
  );
}

function opticalMetaVisible(states: Record<string, { visible: boolean } | undefined>, meta: LayerMeta | undefined): boolean {
  return !!meta && (states.optical?.visible ?? true);
}
