/**
 * OpenLayers side of the route builder. `attachRouteBuilder(map)` adds its own vector layer (numbered, draggable
 * markers, a dashed preview line and the dashed AOI boundary), a Modify interaction for dragging, click-to-add,
 * right-click-to-remove and a crosshair cursor while "Plan route" mode is on. It returns a detach function.
 *
 * The 3D view can reuse the same state: call `useRouteBuilderStore.getState().addPointAt(lat, lon)` with a picked
 * terrain coordinate; the 2D markers and the list follow automatically.
 */
import Collection from "ol/Collection";
import Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import type OlMap from "ol/Map";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import Modify, { type ModifyEvent } from "ol/interaction/Modify";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import CircleStyle from "ol/style/Circle";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import Text from "ol/style/Text";
import { ensureMarsAoiProjection, fromMarsAoi, toMarsAoi } from "../map2d/projection";
import type { BBox, BuilderPoint, PointRole } from "./model";
import { useRouteBuilderStore } from "./routeBuilderStore";

export const ROLE_COLORS: Record<PointRole, string> = {
  start: "#56B4E9",
  via: "#E69F00",
  science: "#CC79A7",
  goal: "#3FB950",
};

const KIND = "rb-kind";
const POINT_ID = "rb-id";

export function markerStyle(index: number, role: PointRole, selected: boolean): Style {
  return new Style({
    image: new CircleStyle({
      radius: selected ? 14 : 12,
      fill: new Fill({ color: ROLE_COLORS[role] }),
      stroke: new Stroke({ color: selected ? "#FFFFFF" : "#080C10", width: selected ? 3 : 2 }),
    }),
    text: new Text({
      text: role === "start" ? "A" : role === "goal" ? String.fromCharCode(65 + index) : String(index),
      font: "700 12px Inter, system-ui, sans-serif",
      fill: new Fill({ color: "#080C10" }),
    }),
    zIndex: selected ? 3 : 2,
  });
}

const PREVIEW_STYLE = [
  new Style({ stroke: new Stroke({ color: "rgba(8,12,16,0.7)", width: 5, lineCap: "round" }), zIndex: 0 }),
  new Style({ stroke: new Stroke({ color: "#FFFFFF", width: 2, lineDash: [8, 8], lineCap: "round" }), zIndex: 1 }),
];
const AOI_STYLE = new Style({ stroke: new Stroke({ color: "rgba(227, 179, 65, 0.75)", width: 1.5, lineDash: [4, 6] }), zIndex: 0 });

function aoiFeature(bbox: BBox): Feature<Polygon> {
  const c = (lat: number, lon: number): number[] => toMarsAoi([lon, lat]);
  const ring = [
    c(bbox.lat_min, bbox.lon_min),
    c(bbox.lat_min, bbox.lon_max),
    c(bbox.lat_max, bbox.lon_max),
    c(bbox.lat_max, bbox.lon_min),
    c(bbox.lat_min, bbox.lon_min),
  ];
  const f = new Feature(new Polygon([ring]));
  f.set(KIND, "aoi");
  f.setStyle(AOI_STYLE);
  return f;
}

/** Rebuilds the layer content from the store: AOI frame, preview line, one marker per point. */
export function syncFeatures(
  source: VectorSource,
  points: BuilderPoint[],
  bbox: BBox,
  selectedId: string | null,
  active: boolean,
): Feature<Point>[] {
  source.clear(true);
  const features: Feature[] = [];
  const markers: Feature<Point>[] = [];
  if (active) features.push(aoiFeature(bbox));
  if (points.length >= 2) {
    const line = new Feature(new LineString(points.map((p) => toMarsAoi([p.lon, p.lat]))));
    line.set(KIND, "preview");
    line.setStyle(PREVIEW_STYLE);
    features.push(line);
  }
  points.forEach((p, i) => {
    const f = new Feature(new Point(toMarsAoi([p.lon, p.lat])));
    f.set(KIND, "point");
    f.set(POINT_ID, p.id);
    f.setStyle(markerStyle(i, p.role, p.id === selectedId));
    features.push(f);
    markers.push(f);
  });
  source.addFeatures(features);
  return markers;
}

export function isPointFeature(f: FeatureLike | null | undefined): f is Feature<Point> {
  return !!f && f.get(KIND) === "point";
}

export function pointIdOf(f: FeatureLike): string | null {
  const id = f.get(POINT_ID);
  return typeof id === "string" ? id : null;
}

/** Map click -> store (also used by tests and by the 3D picker). Returns whether a point was added. */
export function addFromMapCoordinate(coordinate: number[]): boolean {
  const [lon, lat] = fromMarsAoi([coordinate[0] ?? 0, coordinate[1] ?? 0]);
  return useRouteBuilderStore.getState().addPointAt(lat, lon).ok;
}

/** Drag end -> store: every modified marker is moved to its new coordinate. */
export function applyModifiedFeatures(features: Feature[]): void {
  for (const f of features) {
    if (!isPointFeature(f)) continue;
    const id = pointIdOf(f);
    const coord = f.getGeometry()?.getCoordinates();
    if (!id || !coord) continue;
    const [lon, lat] = fromMarsAoi([coord[0] ?? 0, coord[1] ?? 0]);
    useRouteBuilderStore.getState().movePointTo(id, lat, lon);
  }
}

export interface AttachOptions {
  /** Layer z-index (above routes and places) */
  zIndex?: number;
}

/**
 * Wires the builder into a 2D map. Returns `detach()`; call it on unmount.
 */
export function attachRouteBuilder(map: OlMap, source: VectorSource = new VectorSource(), options: AttachOptions = {}): () => void {
  ensureMarsAoiProjection();
  const layer = new VectorLayer({ source, zIndex: options.zIndex ?? 40, updateWhileInteracting: true });
  map.addLayer(layer);

  // only the markers are draggable (not the AOI frame or the preview line)
  const draggable = new Collection<Feature<Point>>();
  const modify = new Modify({ features: draggable as unknown as Collection<Feature> });
  modify.setActive(useRouteBuilderStore.getState().active);
  map.addInteraction(modify);

  const viewport = map.getViewport();

  const redraw = () => {
    const s = useRouteBuilderStore.getState();
    const markers = syncFeatures(source, s.points, s.bbox, s.selectedPointId, s.active);
    draggable.clear();
    draggable.extend(markers);
    modify.setActive(s.active);
    if (viewport) viewport.style.cursor = s.active ? "crosshair" : "";
  };
  redraw();
  const unsubscribe = useRouteBuilderStore.subscribe((state, prev) => {
    if (
      state.points !== prev.points ||
      state.active !== prev.active ||
      state.selectedPointId !== prev.selectedPointId ||
      state.bbox !== prev.bbox ||
      state.change !== prev.change
    ) {
      redraw();
    }
  });

  const hitTest = (pixel: number[]): Feature<Point> | null => {
    const hit = map.forEachFeatureAtPixel(pixel, (f) => (isPointFeature(f) ? f : undefined), {
      layerFilter: (l) => l === layer,
      hitTolerance: 6,
    });
    return hit ?? null;
  };

  let dragging = false;
  modify.on("modifystart", () => {
    dragging = true;
  });
  modify.on("modifyend", (e: ModifyEvent) => {
    applyModifiedFeatures(e.features.getArray() as Feature[]);
    // the click that ends a drag must not add a point
    setTimeout(() => {
      dragging = false;
    }, 0);
  });

  const onClick = (e: MapBrowserEvent<PointerEvent | KeyboardEvent | WheelEvent>) => {
    const s = useRouteBuilderStore.getState();
    if (!s.active || dragging) return;
    const hit = hitTest(e.pixel);
    if (hit) {
      s.selectPoint(pointIdOf(hit));
      return;
    }
    addFromMapCoordinate(e.coordinate);
  };
  map.on("singleclick", onClick);

  const onContextMenu = (ev: MouseEvent) => {
    const s = useRouteBuilderStore.getState();
    if (!s.active) return;
    const pixel = map.getEventPixel(ev);
    const hit = hitTest(pixel);
    if (hit) {
      ev.preventDefault();
      ev.stopPropagation();
      const id = pointIdOf(hit);
      if (id) s.removePointById(id);
    }
  };
  // capture phase: runs before the generic context-menu handler of the map component
  viewport?.addEventListener("contextmenu", onContextMenu, true);

  return () => {
    unsubscribe();
    map.un("singleclick", onClick);
    viewport?.removeEventListener("contextmenu", onContextMenu, true);
    if (viewport) viewport.style.cursor = "";
    map.removeInteraction(modify);
    map.removeLayer(layer);
    source.clear(true);
  };
}
