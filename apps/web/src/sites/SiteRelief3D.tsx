import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { reducedMotion } from "./LocationIntro";
import { accentColor } from "../app/accent";
import { AdaptiveDpr } from "../app/AdaptiveDpr";
import { useAppStore } from "../state/store";
import { Line, OrbitControls } from "@react-three/drei";
import { CanvasTexture, CatmullRomCurve3, DataTexture, DoubleSide, LinearFilter, RGBAFormat, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Texture, TextureLoader, TubeGeometry, Vector3 } from "three";
import { demHeight } from "../fpv/fpvMath";
import { demToTerrainRaster } from "./terrainData";
import type { EvaPlanner } from "./eva/useEvaPlanner";
import type { RangeRing } from "./eva/range";
import { pinInfo, type PinInfo } from "./eva/pin";
import { latLonToLocal } from "./terrainData";
import { formatLatLon } from "../globe/coords";
import { groundSizeM, reliefStats, type DemMeta } from "./reliefMath";
import { naturalImagery } from "./naturalImagery";
import { registerReliefDirector } from "../app/director";
import { displayGrid, layerValues, pixelSizeM, renderRaster, specFor, type RasterKind } from "./demRaster";
import { formatMetres } from "./scale";
import type { SiteDem } from "./useSiteDem";


type Mode = "imagery" | RasterKind;
const MODES: Array<[Mode, string]> = [
  ["imagery", "Imagery"],
  ["elevation", "Elevation"],
  ["slope", "Slope"],
  ["radiation", "Radiation"],
  ["pressure", "Pressure"],
  ["hazard", "Hazard"],
];

function rasterTexture(dem: SiteDem, kind: RasterKind): Texture {
  // 1024 pixels on the long side (15 m on the 10 m Gale tile): the surface colours are smooth anyway, and a mode switch stays quick
  const g = displayGrid(dem.heights, dem.meta.width, dem.meta.height, dem.meta, useAppStore.getState().autopilotRunning ? 640 : 1024);
  const { data } = renderRaster(kind, g.h, g.w, g.ht, g.meta, { shade: kind === "elevation" ? 0.45 : 0.35 });
  const c = document.createElement("canvas");
  c.width = g.w;
  c.height = g.ht;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(data), c.width, c.height), 0, 0);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

/** The EVA plan in the 3D scene: route tube, stops, point of no return, EV1, and the follow camera. */
function EvaLayer3D({ eva, dem, base, exaggeration, sizeW }: { eva: EvaPlanner; dem: SiteDem; base: number; exaggeration: number; sizeW: number }) {
  const raster = useMemo(() => demToTerrainRaster(dem), [dem]);
  const s = Math.max(25, sizeW * 0.006);
  const plan = eva.plan;
  // scene position of a local point: x east, height up, -z north
  const at3 = (x: number, y: number, lift = 0) => new Vector3(x, (demHeight(raster, x, y) - base) * exaggeration + lift, -y);

  const tube = useMemo(() => {
    if (!plan) return null;
    const pts = plan.nodes.filter((n) => n.kind === "path").map((n) => at3(n.x, n.y, s * 0.6));
    if (pts.length < 2) return null;
    return new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0.2), Math.min(1500, pts.length * 2), s * 0.14, 6, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, raster, base, exaggeration, s]);
  useEffect(() => () => tube?.dispose(), [tube]);

  const stops = plan ? plan.stopNodes.map((i) => at3(plan.nodes[i]!.x, plan.nodes[i]!.y, s * 1.4)) : [];
  const nr = plan && plan.noReturn !== null ? at3(plan.nodes[plan.noReturn]!.x, plan.nodes[plan.noReturn]!.y, s * 1.2) : null;
  const ev1 = eva.at ? at3(eva.at.x, eva.at.y, s * 1.6) : null;
  const ev1Color = eva.at?.state === "reserve" ? "#ff3b30" : eva.at?.state === "past-no-return" ? "#ffb000" : "#ffffff";

  return (
    <group>
      {tube && (
        <mesh geometry={tube}>
          <meshBasicMaterial color="#5ec8ff" />
        </mesh>
      )}
      {stops.map((p, i) => (
        <mesh key={i} position={p} scale={[s * 0.8, s * 1.1, s * 0.8]}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color="#5ec8ff" />
        </mesh>
      ))}
      {nr && (
        <mesh position={nr}>
          <sphereGeometry args={[s * 0.9, 16, 16]} />
          <meshBasicMaterial color="#ff5a4d" />
        </mesh>
      )}
      {ev1 && (
        <mesh position={ev1} scale={[s * 0.9, s * 1.4, s * 0.9]}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color={ev1Color} />
        </mesh>
      )}
      <FollowCam target={eva.followCam && eva.playing ? ev1 : null} />
    </group>
  );
}

/**
 * The entry fly-in: the camera starts far out, off to the side and high, and swings in to the viewing position while
 * the orbit controls are locked; a click or a key (handled by the page) is not needed, it lasts under three seconds.
 */
function Swoop({ to, ms = 2800 }: { to: Vector3; ms?: number }) {
  const camera = useThree((st) => st.camera);
  const controls = useThree((st) => st.controls) as unknown as { enabled: boolean; update: () => void } | null;
  // elapsed time is summed per frame with each step clamped: building the terrain mesh stalls the first frames for a
  // second or more, and a wall clock would then jump straight to the end of the fly-in
  const elapsed = useRef(0);
  const done = useRef(reducedMotion());
  useFrame((_, delta) => {
    if (done.current) return;
    elapsed.current += Math.min(delta, 1 / 30) * 1000;
    const k = Math.min(1, elapsed.current / ms);
    const e = 1 - Math.pow(1 - k, 3);
    if (controls) controls.enabled = k >= 1;
    const angle = 1.3 * (1 - e);
    const grow = 1 + 1.9 * (1 - e);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    camera.position.set((to.x * c + to.z * s) * grow, to.y * (1 + 1.2 * (1 - e)), (-to.x * s + to.z * c) * grow);
    camera.lookAt(0, 0, 0);
    if (k >= 1) done.current = true;
  });
  return null;
}

/** Rings that go out from the dropped pin, flat on the terrain. */
function PinPulse({ radius }: { radius: number }) {
  const rings = useRef<Array<Mesh | null>>([]);
  useFrame(() => {
    const t = performance.now() / 1000;
    rings.current.forEach((m, i) => {
      if (!m) return;
      const p = ((t + i * 0.8) % 2.4) / 2.4;
      m.scale.setScalar(0.3 + p * 4.2);
      (m.material as MeshBasicMaterial).opacity = 0.9 * (1 - p);
    });
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => (rings.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 0.9, radius, 48]} />
          <meshBasicMaterial color="#3aa0ff" transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

/** Moves the orbit target (and the camera with it, keeping the viewing angle) along with EV1. */
function FollowCam({ target }: { target: Vector3 | null }) {
  const controls = useThree((st) => st.controls) as unknown as { target: Vector3; update: () => void } | null;
  const camera = useThree((st) => st.camera);
  useFrame(() => {
    if (!target || !controls) return;
    const d = target.clone().sub(controls.target).multiplyScalar(0.2);
    controls.target.add(d);
    camera.position.add(d);
    controls.update();
  });
  return null;
}

export interface ReliefPoi {
  name: string;
  x: number;
  y: number;
  kind: "station" | "stop";
  /** Year of the expedition, written after the name of the landing station. */
  year?: string;
}

export interface ReliefZone {
  name: string;
  bounds: { west: number; east: number; north: number; south: number };
  onEnter: () => void;
}

/**
 * Places on the terrain (landing station, science stops) and the button that enters the finer tile. The labels are plain
 * DOM nodes in an overlay next to the canvas; this component projects each place to the screen every frame, moves its
 * label there and hides the ones that would sit on top of a more important label (the zone button first, then the
 * landing station, then the stops in the order given). drei's <Html> is not used: it re-targets its root while React
 * renders and left the first label empty.
 */
type LabelRefs = { current: Array<HTMLElement | null> };

/** Corners of a finer tile draped on the ground (closed ring); the 12 % point is where the enter button sits. */
function zoneOutlinePoints(dem: SiteDem, raster: ReturnType<typeof demToTerrainRaster>, base: number, exaggeration: number, bounds: ReliefZone["bounds"]): Vector3[] {
  const b = bounds;
  const corners = [latLonToLocal(dem, b.north, b.west), latLonToLocal(dem, b.north, b.east), latLonToLocal(dem, b.south, b.east), latLonToLocal(dem, b.south, b.west)];
  const out: Vector3[] = [];
  for (let e = 0; e < 4; e++) {
    const a = corners[e]!;
    const c = corners[(e + 1) % 4]!;
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const x = a.x + (c.x - a.x) * t;
      const y = a.y + (c.y - a.y) * t;
      out.push(new Vector3(x, (demHeight(raster, x, y) - base) * exaggeration + 40, -y));
    }
  }
  out.push(out[0]!.clone());
  return out;
}

function PoiProjector({
  dem,
  base,
  exaggeration,
  pois,
  zone,
  sizeW,
  labels,
}: {
  dem: SiteDem;
  base: number;
  exaggeration: number;
  pois: ReliefPoi[];
  zone?: ReliefZone | null;
  sizeW: number;
  labels: LabelRefs;
}) {
  const raster = useMemo(() => demToTerrainRaster(dem), [dem]);
  const world = useMemo(() => {
    const lift = Math.max(25, sizeW * 0.006) * 2;
    const out = pois.map((p) => new Vector3(p.x, (demHeight(raster, p.x, p.y) - base) * exaggeration + lift, -p.y));
    if (zone) {
      const pts = zoneOutlinePoints(dem, raster, base, exaggeration, zone.bounds);
      out.push(pts[Math.floor(pts.length * 0.12)]!);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dem, raster, pois, base, exaggeration, sizeW, zone?.bounds]);
  const v = useMemo(() => new Vector3(), []);
  // the zone button (the last entry) wins, then the places in the given order
  const order = useMemo(() => {
    const n = world.length;
    return zone ? [n - 1, ...Array.from({ length: n - 1 }, (_, i) => i)] : Array.from({ length: n }, (_, i) => i);
  }, [world, zone]);
  const sizes = useMemo(() => new Float32Array(world.length * 2), [world]);
  const lastStyle = useMemo(() => new Array<string>(world.length).fill(""), [world]);
  useFrame(({ camera, size }) => {
    const n = world.length;
    // measure every label first and write afterwards: reading a size right after writing a neighbour's transform would
    // force a layout per label and per frame
    for (let i = 0; i < n; i++) {
      const el = labels.current[i];
      if (!el) continue;
      sizes[i * 2] = el.offsetWidth;
      sizes[i * 2 + 1] = el.offsetHeight;
    }
    const kept: Array<{ l: number; t: number; r: number; b: number }> = [];
    for (const i of order) {
      const el = labels.current[i];
      const w = world[i];
      if (!el || !w) continue;
      v.copy(w).project(camera);
      const bw = sizes[i * 2]!;
      const bh = sizes[i * 2 + 1]!;
      const sx = ((v.x + 1) / 2) * size.width;
      // the zone button sits above its anchor so it does not cover the landing station label
      const sy = ((1 - v.y) / 2) * size.height - (zone && i === n - 1 ? bh / 2 + 10 : 0);
      const box = { l: sx - bw / 2 - 3, t: sy - bh / 2 - 2, r: sx + bw / 2 + 3, b: sy + bh / 2 + 2 };
      const off = v.z > 1 || sx < -bw || sx > size.width + bw || sy < -bh || sy > size.height + bh;
      const clash = kept.some((k) => box.l < k.r && box.r > k.l && box.t < k.b && box.b > k.t);
      const show = !off && !clash;
      if (show) kept.push(box);
      const style = `${show ? "v" : "h"}translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
      if (style === lastStyle[i]) continue; // nothing moved: no style write, no style recalculation
      lastStyle[i] = style;
      el.style.visibility = show ? "visible" : "hidden";
      el.style.transform = style.slice(1);
    }
  });
  return null;
}

/** The outline of the finer tile inside this one, following the ground (its enter button is a label, see PoiProjector). */
function ZoneOutline({ dem, base, exaggeration, zone }: { dem: SiteDem; base: number; exaggeration: number; zone: ReliefZone }) {
  const raster = useMemo(() => demToTerrainRaster(dem), [dem]);
  const pts = useMemo(() => zoneOutlinePoints(dem, raster, base, exaggeration, zone.bounds), [dem, zone.bounds, raster, base, exaggeration]);
  return (
    <group>
      <Line points={pts} color={accentColor()} lineWidth={2} />
    </group>
  );
}

/** Distance from the camera to what it looks at, reported about three times a second. */
function RangeProbe({ onRange }: { onRange: (km: number) => void }) {
  const controls = useThree((st) => st.controls) as unknown as { target: Vector3 } | null;
  const camera = useThree((st) => st.camera);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (!controls || clock.elapsedTime - last.current < 0.3) return;
    last.current = clock.elapsedTime;
    onRange(camera.position.distanceTo(controls.target) / 1000);
  });
  return null;
}

/** The blue range ring of the pin, draped on the terrain. */
function RangeRing3D({ ring, dem, base, exaggeration, sizeW }: { ring: Array<{ x: number; y: number }>; dem: SiteDem; base: number; exaggeration: number; sizeW: number }) {
  const raster = useMemo(() => demToTerrainRaster(dem), [dem]);
  const lift = Math.max(25, sizeW * 0.006) * 0.5;
  const pts = useMemo(() => {
    const out = ring.map((p) => new Vector3(p.x, (demHeight(raster, p.x, p.y) - base) * exaggeration + lift, -p.y));
    if (out.length) out.push(out[0]!.clone());
    return out;
  }, [ring, raster, base, exaggeration, lift]);
  if (pts.length < 4) return null;
  return <Line points={pts} color="#3aa0ff" lineWidth={2.5} dashed dashSize={lift * 4} gapSize={lift * 2.5} />;
}

function Terrain({
  dem,
  exaggeration,
  texture,
  eva,
  pin,
  range,
  onPin,
  onHover,
  pois,
  labels,
  zone,
}: {
  dem: SiteDem;
  exaggeration: number;
  texture: Texture | null;
  labels?: LabelRefs;
  eva?: EvaPlanner;
  pin?: PinInfo | null;
  range?: RangeRing | null;
  onPin?: (x: number, y: number) => void;
  onHover?: (p: { x: number; y: number } | null) => void;
  pois?: ReliefPoi[];
  zone?: ReliefZone | null;
}) {
  const { meta, heights } = dem;
  const size = useMemo(() => groundSizeM(meta.bounds, meta.centre.lat), [meta]);
  const base = useMemo(() => reliefStats(heights).min, [heights]);
  const placeholder = useMemo(() => {
    const t = new DataTexture(new Uint8Array([138, 106, 85, 255]), 1, 1, RGBAFormat);
    t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => () => placeholder.dispose(), [placeholder]);
  const geometry = useMemo(() => {
    // the mesh has at most about 600 x 600 vertices; the texture (with its own shaded relief) keeps the full detail of big tiles
    const stride = Math.max(1, Math.ceil(Math.max(meta.width, meta.height) / 600));
    const cols = Math.max(1, Math.floor((meta.width - 1) / stride));
    const rows = Math.max(1, Math.floor((meta.height - 1) / stride));
    const g = new PlaneGeometry(size.w, size.h, cols, rows);
    const pos = g.attributes["position"]!;
    for (let i = 0; i < pos.count; i++) {
      const c = Math.round(((i % (cols + 1)) / cols) * (meta.width - 1));
      const r = Math.round((Math.floor(i / (cols + 1)) / rows) * (meta.height - 1));
      pos.setZ(i, (heights[r * meta.width + c]! - base) * exaggeration);
    }
    g.rotateX(-Math.PI / 2); // plane +y (north) becomes -z
    g.computeVertexNormals();
    return g;
  }, [size, meta, heights, exaggeration, base]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const cx = Math.floor(meta.width / 2);
  const cy = Math.floor(meta.height / 2);
  const siteY = (heights[cy * meta.width + cx]! - base) * exaggeration;
  const k = Math.max(0.03, size.w / 118000); // the marker was drawn for a 118 km patch

  return (
    <group>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          // a click on the terrain drops a pin there (a drag is not a click)
          if (!onPin || e.delta > 5) return;
          e.stopPropagation();
          onPin(e.point.x, -e.point.z);
        }}
        onPointerMove={(e) => onHover?.({ x: e.point.x, y: -e.point.z })}
        onPointerOut={() => onHover?.(null)}
      >
        {/* a brown 1 x 1 map stands in until the real texture arrives: the material keeps one shader and never flashes white */}
        <meshStandardMaterial map={texture ?? placeholder} roughness={1} metalness={0} side={DoubleSide} />
      </mesh>
      {eva && <EvaLayer3D eva={eva} dem={dem} base={base} exaggeration={exaggeration} sizeW={size.w} />}
      {labels && ((pois && pois.length > 0) || zone) && <PoiProjector dem={dem} base={base} exaggeration={exaggeration} pois={pois ?? []} zone={zone} sizeW={size.w} labels={labels} />}
      {zone && <ZoneOutline dem={dem} base={base} exaggeration={exaggeration} zone={zone} />}
      {range && range.ring.length > 2 && <RangeRing3D ring={range.ring} dem={dem} base={base} exaggeration={exaggeration} sizeW={size.w} />}
      {pin && (
        <group position={[pin.x, (pin.elevation - base) * exaggeration + Math.max(25, size.w * 0.006), -pin.y]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[Math.max(25, size.w * 0.006) * 2, Math.max(25, size.w * 0.006) * 0.18, 8, 40]} />
            <meshBasicMaterial color="#5ec8ff" />
          </mesh>
          <mesh>
            <sphereGeometry args={[Math.max(25, size.w * 0.006) * 0.7, 12, 12]} />
            <meshBasicMaterial color="#5ec8ff" />
          </mesh>
          <PinPulse radius={Math.max(25, size.w * 0.006) * 3} />
        </group>
      )}
      <mesh position={[0, siteY + 1500 * k, 0]}>
        <cylinderGeometry args={[120 * k, 120 * k, 3000 * k, 12]} />
        <meshBasicMaterial color="#00e5ff" />
      </mesh>
      <mesh position={[0, siteY + 3200 * k, 0]}>
        <sphereGeometry args={[420 * k, 16, 16]} />
        <meshBasicMaterial color="#00e5ff" />
      </mesh>
    </group>
  );
}

type TerrainProps = Parameters<typeof Terrain>[0];

const sameXY = (a: { x: number; y: number }[] | undefined, b: { x: number; y: number }[] | undefined): boolean =>
  a === b || (!!a && !!b && a.length === b.length && a.every((p, i) => p.x === b[i]!.x && p.y === b[i]!.y));

/**
 * The 3D scene redraws only when something it shows changed. The page above it re-renders for its clock, hover readout and
 * plan edits, and hands down fresh `eva`, `pin`, `pois` and `zone` objects each time; comparing the fields the scene uses
 * keeps the terrain, route and labels from being reconciled on every one of those renders.
 */
const TerrainMemo = memo(Terrain, (a: TerrainProps, b: TerrainProps) =>
  a.dem === b.dem &&
  a.exaggeration === b.exaggeration &&
  a.texture === b.texture &&
  a.labels === b.labels &&
  a.onPin === b.onPin &&
  a.onHover === b.onHover &&
  a.eva?.plan === b.eva?.plan &&
  a.eva?.at === b.eva?.at &&
  a.eva?.followCam === b.eva?.followCam &&
  a.eva?.playing === b.eva?.playing &&
  a.range?.ring === b.range?.ring &&
  (a.pin === b.pin || (!!a.pin && !!b.pin && a.pin.x === b.pin.x && a.pin.y === b.pin.y && a.pin.elevation === b.pin.elevation)) &&
  (a.pois === b.pois || (!!a.pois && !!b.pois && a.pois.length === b.pois.length && a.pois.every((p, i) => p.name === b.pois![i]!.name && p.x === b.pois![i]!.x && p.y === b.pois![i]!.y && p.year === b.pois![i]!.year))) &&
  (a.zone === b.zone || (!!a.zone && !!b.zone && a.zone.bounds === b.zone.bounds && a.zone.name === b.zone.name)) &&
  sameXY(a.range?.ring, b.range?.ring),
);

/** 3D relief of a site from the MOLA 463 m elevation grid, with imagery, elevation colour or a modeled data layer draped on it. */
export function SiteRelief3D({
  dem,
  error,
  eva,
  pin,
  range,
  onPin,
  pois,
  zone,
  onBack,
  backLabel,
}: {
  dem: SiteDem | null;
  error: string | null;
  eva?: EvaPlanner;
  pin?: PinInfo | null;
  range?: RangeRing | null;
  onPin?: (x: number, y: number) => void;
  pois?: ReliefPoi[];
  zone?: ReliefZone | null;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [rangeKm, setRangeKm] = useState<number | null>(null);
  const [exaggeration, setExaggeration] = useState(4);
  const [mode, setMode] = useState<Mode>("imagery");
  // the autopilot tour switches the surface colour like a click on the buttons
  const hasDem = useRef(false);
  hasDem.current = !!dem && !error;
  useEffect(
    () =>
      registerReliefDirector((cmd) => {
        if (cmd.type === "ready") return hasDem.current;
        setMode(cmd.mode);
      }),
    [],
  );
  const [imagery, setImagery] = useState<Texture | null>(null);
  const [ctxTiles, setCtxTiles] = useState(0);
  const labels = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (!dem) return;
    setExaggeration(dem.meta.pixel_m < 30 ? 2 : 4); // fine tiles are already steep enough; the 463 m grid needs help
    setMode("imagery"); // natural colour: the orthophoto where there is one, else the Viking colour mosaic (brown until it loads)
    let alive = true;
    let made: Texture | null = null; // the imagery texture of this patch: freed on the GPU when the patch changes or the view closes
    setImagery(null);
    setCtxTiles(0);
    if (dem.meta.imagery) {
      new TextureLoader().load(`${dem.dir}/${dem.meta.imagery}`, (t) => {
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
        if (alive) {
          made = t;
          setImagery(t);
        } else t.dispose();
      });
    } else {
      void naturalImagery(dem.dir, dem.meta).then((r) => {
        if (!alive) return;
        if (r) {
          // the worker's bitmap is flipped already (WebGL cannot flip a bitmap on upload), a canvas is flipped by three
          const t = r.flipped ? new Texture(r.canvas) : new CanvasTexture(r.canvas as HTMLCanvasElement);
          if (r.flipped) {
            t.flipY = false;
            t.needsUpdate = true;
          }
          t.colorSpace = SRGBColorSpace;
          t.minFilter = LinearFilter;
          t.anisotropy = 8;
          made = t;
          setImagery(t);
        } else setImagery(null);
        setCtxTiles(r?.ctxTiles ?? 0);
      });
    }
    return () => {
      alive = false;
      made?.dispose();
    };
  }, [dem]);

  const texture = useMemo(() => {
    if (!dem) return null;
    return mode === "imagery" ? imagery : rasterTexture(dem, mode);
  }, [dem, mode, imagery]);
  useEffect(() => () => void (mode !== "imagery" && texture?.dispose()), [texture, mode]);

  // derived once per patch / mode, not on every render (the hover readout and the range probe re-render this component often)
  const st = useMemo(() => (dem ? reliefStats(dem.heights) : null), [dem]);
  const size = useMemo(() => (dem ? groundSizeM(dem.meta.bounds, dem.meta.centre.lat) : null), [dem]);
  const spec = useMemo(() => {
    if (!dem || mode === "imagery") return null;
    const { dx, dy } = pixelSizeM(dem.meta);
    return specFor(mode, layerValues(mode, dem.heights, dem.meta.width, dem.meta.height, dx, dy));
  }, [dem, mode]);
  // a click handler that stays the same function while the page hands down a new one each render
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const pinStable = useCallback((x: number, y: number) => onPinRef.current?.(x, y), []);
  const pinCb = onPin ? pinStable : undefined;

  if (error) return <div className="site-note">3D relief is not available: {error}. Run data/pipeline/fetch_site_dems.py (and make_hires_tiers.py) to create it.</div>;
  if (!dem) return <div className="site-note">Loading the elevation tile…</div>;

  if (!st || !size) return null;
  const camDist = size.w * 0.9;
  return (
    <div className="site-relief" data-testid="site-relief">
      <Canvas key={dem.dir} camera={{ position: [0, camDist * 0.6, camDist * 0.8], fov: 40, near: Math.max(1, size.w * 0.0008), far: size.w * 8 }} gl={{ antialias: true }}>
        <color attach="background" args={["#070b12"]} />
        <fog attach="fog" args={["#0a1019", size.w * 1.5, size.w * 5]} />
        {/* grading: cool sky fill, warm ground bounce, a low cool back light to separate the ridges from the dark */}
        <hemisphereLight args={["#c4d4ea", "#8a6a58", 0.95]} />
        <directionalLight position={[-size.w, size.w * 0.5, size.w * 0.6]} intensity={2.4} color="#fff1e0" />
        <directionalLight position={[size.w, size.w * 0.18, -size.w * 0.8]} intensity={0.35} color="#7aa6e8" />
        <TerrainMemo dem={dem} exaggeration={exaggeration} texture={texture} eva={eva} pin={pin} range={range} onPin={pinCb} onHover={setHover} pois={pois} labels={labels} zone={zone} />
        <AdaptiveDpr />
        <RangeProbe onRange={setRangeKm} />
        <Swoop to={new Vector3(0, camDist * 0.6, camDist * 0.8)} />
        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI * 0.49} minDistance={size.w * 0.08} maxDistance={size.w * 3} target={[0, 0, 0]} />
      </Canvas>
      <div className="relief-labels" translate="no" aria-hidden="true">
        {(pois ?? []).map((p, i) => (
          <div key={`${p.kind}-${p.name}`} ref={(el) => void (labels.current[i] = el)} className={`relief-poi relief-poi--${p.kind}`} style={{ visibility: "hidden" }}>
            <i />
            <span>{p.name}</span>
            {p.year && <em>{p.year}</em>}
          </div>
        ))}
        {zone && (
          <button type="button" ref={(el) => void (labels.current[(pois ?? []).length] = el)} className="relief-zone" style={{ visibility: "hidden" }} onClick={zone.onEnter}>
            ▣ {zone.name} · ENTER
          </button>
        )}
      </div>
      <div className="site-relief__hud" translate="no">
        <div>
          {(dem.meta.label ?? "MOLA terrain").toUpperCase()} · {dem.meta.pixel_m < 10 ? dem.meta.pixel_m.toFixed(1) : Math.round(dem.meta.pixel_m)} m/px · {formatMetres(size.w)} × {formatMetres(size.h)}
        </div>
        <div>
          Elevation {Math.round(st.min)} to {Math.round(st.max)} m ({Math.round(st.range)} m range)
        </div>
        <div className="site-relief__modes" role="group" aria-label="Surface colour">
          {MODES.map(([m, label]) => (
            <button key={m} type="button" className={mode === m ? "is-active" : ""} onClick={() => setMode(m)} aria-pressed={mode === m}>
              {label}
            </button>
          ))}
        </div>
        {spec && (
          <div>
            {spec.name}: {Number(spec.min.toFixed(spec.digits))} to {Number(spec.max.toFixed(spec.digits))} {spec.unit}
            {spec.modeled ? " (MODELED)" : ""}
          </div>
        )}
        <label>
          Vertical exaggeration ×{exaggeration}
          <input type="range" min={1} max={12} step={1} value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} aria-label="Vertical exaggeration" />
        </label>
        <div className="site-relief__tile" data-testid="tile-info">
          <div>
            <i>TILE</i> {formatMetres(size.w)} × {formatMetres(size.h)}
          </div>
          <div>
            <i>LOWEST</i> {Math.round(st.min)} m
          </div>
          <div>
            <i>HIGHEST</i> {Math.round(st.max)} m
          </div>
          <div>
            <i>RELIEF</i> {Math.round(st.range)} m
          </div>
          <div>
            <i>IMAGERY / DEM</i> {dem.meta.imagery ? "orthophoto" : ctxTiles > 0 ? "Viking MDIM + CTX" : "Viking MDIM"} / {dem.meta.pixel_m < 10 ? dem.meta.pixel_m.toFixed(1) : Math.round(dem.meta.pixel_m)} m
          </div>
        </div>
        {onBack && (
          <button type="button" className="site-relief__back" onClick={onBack}>
            ◂ {backLabel ?? "Back"}
          </button>
        )}
        <div className="site-relief__note">Drag to orbit, right-drag to pan, scroll to zoom. Click the terrain to drop a pin. Coarse grids are not a rover-scale view.</div>
      </div>
      <div className="site-detail__telemetry" translate="no" data-testid="relief-telemetry">
        {(() => {
          const h = hover ? pinInfo(dem, hover.x, hover.y, { x: 0, y: 0 }) : null;
          return (
            <>
              <span>
                <i>RANGE</i> {rangeKm === null ? "…" : rangeKm < 10 ? rangeKm.toFixed(2) : rangeKm.toFixed(1)} km
              </span>
              {h ? (
                <>
                  <span>
                    <i>LAT</i> {h.lat.toFixed(4)}°
                  </span>
                  <span>
                    <i>LON</i> {(((h.lon % 360) + 360) % 360).toFixed(4)}°E
                  </span>
                  <span>
                    <i>ELEV</i> {Math.round(h.elevation)} m
                  </span>
                  <span>
                    <i>SLOPE</i> {h.slopeDeg.toFixed(1)}°
                  </span>
                </>
              ) : (
                <span>
                  <i>CURSOR</i> {pin ? formatLatLon(pin.lat, pin.lon, 4) : "move over the terrain"}
                </span>
              )}
              <span className="site-detail__hints">CLICK pin &amp; route · DRAG orbit · RMB pan · SCROLL zoom</span>
            </>
          );
        })()}
      </div>
    </div>
  );
}
