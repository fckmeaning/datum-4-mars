import { useEffect, useRef, useState, useCallback } from "react";
import Map from "ol/Map";
import View from "ol/View";
import WebGLTileLayer from "ol/layer/WebGLTile";
import GeoTIFF from "ol/source/GeoTIFF";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from "ol/style";
import type { Coordinate } from "ol/coordinate";
import { ensureMarsAoiProjection, toMarsAoi, fromMarsAoi, PROJ_CODE } from "./projection";
import { useAppStore } from "../state/store";
import type { Place } from "../api/client";

interface Map2DProps {
  places?: Place[];
  onSelectPlace?: (place: Place) => void;
  onCursorMove?: (coords: { lat: number; lon: number } | null) => void;
}

export function Map2D({ places = [], onSelectPlace, onCursorMove }: Map2DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<View | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const routesSourceRef = useRef<VectorSource | null>(null);

  const [rasterStatus, setRasterStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  const flyTo = useAppStore((s) => s.flyTo);
  const clearFlyTo = useAppStore((s) => s.clearFlyTo);
  const camera = useAppStore((s) => s.camera);
  const setCamera = useAppStore((s) => s.setCamera);
  const layers = useAppStore((s) => s.layers);
  const routes = useAppStore((s) => s.routes);
  const selectedRouteId = useAppStore((s) => s.selectedRouteId);
  const reducedMotion = useAppStore((s) => s.settings.reducedMotion);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    ensureMarsAoiProjection();

    const initialCenter = toMarsAoi([camera.center.lon, camera.center.lat]);

    const view = new View({
      projection: PROJ_CODE,
      center: initialCenter,
      zoom: camera.zoom,
      minZoom: 9,
      maxZoom: 18,
    });
    viewRef.current = view;

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const routesSource = new VectorSource();
    routesSourceRef.current = routesSource;

    // Vector layer for routes
    const routesLayer = new VectorLayer({
      source: routesSource,
      zIndex: 10,
    });

    // Vector layer for Places / Waypoints
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      zIndex: 20,
    });

    // Elevation GeoTIFF Layer
    let tileLayer: WebGLTileLayer | null = null;
    try {
      const geoTiffSource = new GeoTIFF({
        sources: [
          {
            url: "/data/gale/L0/elevation.tif",
            nodata: -9999,
          },
        ],
        convertToRGB: false,
      });

      tileLayer = new WebGLTileLayer({
        source: geoTiffSource,
        zIndex: 1,
        style: {
          color: [
            "interpolate",
            ["linear"],
            ["band", 1],
            -4500, [0.0, 0.13, 0.28, 1], // cividis dark
            -3500, [0.18, 0.26, 0.43, 1],
            -2800, [0.38, 0.42, 0.45, 1],
            -2200, [0.60, 0.58, 0.41, 1],
            -1500, [0.99, 0.90, 0.14, 1], // cividis yellow
          ],
        },
      });

      geoTiffSource.on("error", () => {
        setRasterStatus("unavailable");
      });
      geoTiffSource.on("change", () => {
        if (geoTiffSource.getState() === "ready") {
          setRasterStatus("ready");
        } else if (geoTiffSource.getState() === "error") {
          setRasterStatus("unavailable");
        }
      });
    } catch {
      setRasterStatus("unavailable");
    }

    const map = new Map({
      target: mapContainerRef.current,
      layers: tileLayer ? [tileLayer, routesLayer, vectorLayer] : [routesLayer, vectorLayer],
      view,
      controls: [], // custom HUD controls
    });
    mapRef.current = map;

    // Pointer move listener
    map.on("pointermove", (e) => {
      const coord = e.coordinate as [number, number];
      if (coord && onCursorMove) {
        const [lon, lat] = fromMarsAoi(coord);
        onCursorMove({ lat, lon });
      }
    });

    // Click on features
    map.on("click", (e) => {
      const feature = map.forEachFeatureAtPixel(e.pixel, (f) => f);
      if (feature) {
        const placeData = feature.get("placeData") as Place | undefined;
        if (placeData && onSelectPlace) {
          onSelectPlace(placeData);
        }
      }
    });

    // View change listener to update store camera
    view.on("change:resolution", () => {
      const z = view.getZoom();
      if (z !== undefined) {
        setCamera({ zoom: Math.round(z * 10) / 10 });
      }
    });

    view.on("change:center", () => {
      const c = view.getCenter();
      if (c) {
        const [lon, lat] = fromMarsAoi(c as [number, number]);
        setCamera({ center: { lat, lon } });
      }
    });

    return () => {
      map.setTarget(undefined);
    };
  }, []);

  // Update Places markers
  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) return;

    source.clear();

    for (const place of places) {
      const [x, y] = toMarsAoi([place.lon, place.lat]);
      const feature = new Feature({
        geometry: new Point([x, y]),
        placeData: place,
      });

      const isBase = place.kind === "base";
      const isScience = place.science_target;

      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: isBase ? 9 : isScience ? 7 : 5,
            fill: new Fill({
              color: isBase ? "#56B4E9" : isScience ? "#CC79A7" : "#E69F00",
            }),
            stroke: new Stroke({
              color: "#080C10",
              width: 2,
            }),
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

  // Update Routes
  useEffect(() => {
    const source = routesSourceRef.current;
    if (!source) return;

    source.clear();

    const profileColors: Record<string, string> = {
      FASTEST: "#56B4E9",
      SAFEST: "#009E73",
      BALANCED: "#E69F00",
      SCIENCE: "#CC79A7",
    };

    for (const route of routes) {
      const isSelected = !selectedRouteId || route.route_id === selectedRouteId;
      const baseColor = profileColors[route.profile] ?? "#56B4E9";

      const coords = route.geometry.coordinates.map(
        ([lon, lat]) => toMarsAoi([lon!, lat!]) as Coordinate,
      );

      const feature = new Feature({
        geometry: new LineString(coords),
        routeData: route,
      });

      // Dark casing + profile color line
      feature.setStyle([
        new Style({
          stroke: new Stroke({
            color: "rgba(8, 12, 16, 0.8)",
            width: isSelected ? 7 : 4,
          }),
        }),
        new Style({
          stroke: new Stroke({
            color: isSelected ? baseColor : `${baseColor}66`,
            width: isSelected ? 4 : 2,
          }),
        }),
      ]);

      source.addFeature(feature);
    }
  }, [routes, selectedRouteId]);

  // Handle flyTo animation
  useEffect(() => {
    if (!flyTo || !viewRef.current) return;

    const [x, y] = toMarsAoi([flyTo.target.lon, flyTo.target.lat]);
    const duration = reducedMotion ? 0 : 1200;

    viewRef.current.animate({
      center: [x, y],
      zoom: flyTo.zoomHint ?? 14,
      duration,
    });

    clearFlyTo();
  }, [flyTo, reducedMotion, clearFlyTo]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Grid overlay for Mars terrain reference */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Raster Status Toast */}
      {rasterStatus !== "ready" && (
        <div
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
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: rasterStatus === "loading" ? "#E3B341" : "#8B949E",
            }}
          />
          {rasterStatus === "loading"
            ? "Loading elevation raster (L0)..."
            : "Elevation raster awaiting pipeline (vector grid active)"}
        </div>
      )}
    </div>
  );
}
