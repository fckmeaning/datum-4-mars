/**
 * FirstPersonView.tsx - the astronaut's-eye view: walk the selected route over the real DEM.
 *
 * Camera at 1.7 m above the ground, moving along the route at the speed of each leg (route model times), looking along the path
 * (smoothed) with free look on top. Terrain = geometry clipmap fed by the L3/L2/L1 DEM texture, shadows from the real sun,
 * Martian sky, aerial perspective, the surface falling away by d^2/(2R). HUD in fpvHud.tsx.
 *
 * Limits worth knowing (also in the report): only the AOI has terrain data, so beyond its edge the surface dissolves into haze
 * and the crater rim is NOT drawn; fine grain closer than ~400 m is procedural (display only), the DEM resolves 10 m.
 */

import { Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  BackSide,
  BufferGeometry,
  DoubleSide,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadBestElevationCOG } from "../map3d/terrainLoader";
import { aoiToGeo } from "../map3d/projection";
import { computeApproximateMarsSun, fetchSunPosition, sunAnglesToVector3 } from "../map3d/sun";
import type { TerrainRasterData } from "../map3d/types";
import { useAppStore } from "../state/store";
import {
  MARS_RADIUS_M,
  angleDiffDeg,
  bearingDistance,
  buildPathData,
  cumulativeAlong,
  demHeight,
  distanceAtTime,
  eyeElevation,
  horizonAngleDeg,
  nearestDistanceOnPath,
  pathSpeedAt,
  pathStateAtDistance,
  slopeAlongHeadingDeg,
  smoothHeadingDeg,
  timeAtDistance,
  wrapDeg360,
  type PathData,
} from "./fpvMath";
import { FpvHud, type FpvTelemetry } from "./fpvHud";
import {
  ribbonFragmentShader,
  ribbonVertexShader,
  skyFragmentShader,
  skyVertexShader,
  terrainFragmentShader,
  terrainVertexShader,
} from "./fpvShaders";
import {
  RING_CELLS,
  buildRibbonGeometry,
  buildRingGeometry,
  clipmapLevels,
  createHeightTexture,
  disposeFpvResources,
  disposeObject3D,
  placeRoverModel,
  snapToLattice,
} from "./fpvTerrain";

export const FPV_FOV_DEG = 70;
const REACH_M = 20_000;
const WALK_FREE_M_S = 1.4;
const SPEEDS = [1, 4, 16] as const;
/** The rover model is requested (11 MB) only once the walker is this close to it. */
const ROVER_LOAD_RADIUS_M = 1500;
const ROVER_CREDIT_RADIUS_M = 450;
/**
 * Yaw [deg] that turns the model's front axis onto the heading direction. The NASA model is 3.95 m long along Z (the arm and
 * mast side included); which end is the front was checked on screen, see the report.
 */
export const ROVER_FORWARD_YAW_DEG = 180;

export interface FpvWaypoint {
  name: string;
  /** AOI metres (x East, y North). */
  x: number;
  y: number;
}

/** The parts of an API RouteResult the view needs (a RouteResult satisfies this structurally). */
export interface FpvRouteLike {
  xy: number[][];
  profile?: string;
  segments?: ReadonlyArray<{ length_m?: number; duration_s?: number; limiting_factor?: string; o2_l?: number; energy_kJ?: number }>;
  totals?: { o2_l?: number; energy_kJ?: number };
}

/** Test/benchmark hook (not used by the app): drive frames deterministically and jump along the route. */
export interface FpvDebugApi {
  /** Renders `frames` frames back to back and waits for the GPU (`finish`); works in a hidden tab where rAF is paused. */
  run: (frames: number) => Promise<{ frames: number; ms: number; msPerFrame: number; fps: number }>;
  /** Jumps to a distance along the route [m]. */
  seek: (distM: number) => void;
}

export interface FirstPersonViewProps {
  route: FpvRouteLike;
  /** Pre-loaded DEM; when omitted the best available level is loaded (L3 > L2 > L1 > L0). */
  elevation?: TerrainRasterData;
  /**
   * Geographic position of the DEM's local origin (AOI x=0, y=0). Omit for Gale (the AOI projection of contracts/projection.json);
   * for any other site the sun is computed for this position, with x east and y north in metres from it.
   */
  siteGeo?: { lat: number; lon: number };
  /** Name of the area for the loading text. */
  areaName?: string;
  waypoints?: FpvWaypoint[];
  /** Base position for the back-to-base arrow (AOI metres). */
  base?: { x: number; y: number } | null;
  /** Position of the Curiosity rover now (AOI metres): always a marker, plus the model when `roverModelUrl` loads. */
  roverNow?: { x: number; y: number } | null;
  /** Compass heading of the rover model (deg clockwise from North), e.g. the direction of the last traverse leg. */
  roverHeadingDeg?: number;
  /** Mission time at the start of the walk (ISO UTC); defaults to the app's time. */
  utc?: string;
  /** Start walking immediately (ignored when reduced motion is on). Default true. */
  autoPlay?: boolean;
  initialSpeed?: 1 | 4 | 16;
  /** "low" uses fewer shadow steps (integrated GPUs). */
  quality?: "high" | "low";
  roverModelUrl?: string;
  onExit?: () => void;
  onFps?: (fps: number) => void;
  /** Receives the debug API once the scene is running. */
  onDebug?: (api: FpvDebugApi) => void;
}

interface Controls {
  speed: number;
  paused: boolean;
  free: boolean;
  hud: boolean;
}

interface Inputs {
  yawOff: number;
  pitch: number;
  dragging: boolean;
  keys: Set<string>;
  lastInteract: number;
}

interface SceneProps {
  dem: TerrainRasterData;
  base: number;
  path: PathData;
  route: FpvRouteLike;
  waypoints: FpvWaypoint[];
  baseAt: { x: number; y: number } | null;
  roverNow: { x: number; y: number } | null;
  roverHeadingDeg: number;
  roverModelUrl: string;
  startUtc: string;
  siteGeo?: { lat: number; lon: number };
  quality: "high" | "low";
  reducedMotion: boolean;
  controls: React.MutableRefObject<Controls>;
  inputs: React.MutableRefObject<Inputs>;
  onTelemetry: (t: FpvTelemetry) => void;
  onFps?: (fps: number) => void;
  onDebug?: (api: FpvDebugApi) => void;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** True when a WebGL context can be created (the check itself is cheap and the canvas is discarded). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Scene({ dem, base, path, route, waypoints, baseAt, roverNow, roverHeadingDeg, roverModelUrl, startUtc, siteGeo, quality, reducedMotion, controls, inputs, onTelemetry, onFps, onDebug }: SceneProps): ReactElement {
  const { camera, gl, advance, setFrameloop } = useThree();
  const rig = useRef({
    simT: 0,
    free: { x: path.xy[0]?.[0] ?? 0, y: path.xy[0]?.[1] ?? 0, heading: 0 },
    heading: pathStateAtDistance(path, 8).headingDeg,
    eyeY: null as number | null,
    sun: computeApproximateMarsSun(startUtc),
    sunFetchedAtSimT: -1e9,
    telemAcc: 1,
    horizonAcc: 1,
    horizon: 0,
    fpsFrames: 0,
    fpsAcc: 0,
    labelAcc: 1,
  });
  const [visibleLabels, setVisibleLabels] = useState<number[]>([]);
  const [rover, setRover] = useState<Group | null>(null);
  const [roverWanted, setRoverWanted] = useState(false);
  const [roverCredit, setRoverCredit] = useState(false);
  const sunLight = useRef<DirectionalLight>(null);

  // labelled points: the route's waypoints, plus the rover's marker (which also stands in when the model cannot be loaded)
  const labelPoints = useMemo<FpvWaypoint[]>(
    () => (roverNow ? [...waypoints, { name: "Curiosity, latest position", x: roverNow.x, y: roverNow.y }] : waypoints),
    [waypoints, roverNow],
  );

  const o2Per = useMemo(() => route.segments?.map((s) => s.o2_l), [route.segments]);
  const enPer = useMemo(() => route.segments?.map((s) => s.energy_kJ), [route.segments]);

  // GPU resources, created once per DEM / route and disposed on unmount
  const gpu = useMemo(() => {
    const demCell = (dem.bbox[2] - dem.bbox[0]) / dem.width;
    const cell0 = clamp(demCell / 4, 1.25, 5);
    const levels = clipmapLevels(cell0, REACH_M);
    const heightTex = createHeightTexture(dem, base);
    const common = {
      uHeight: { value: heightTex },
      uBBox: { value: new Vector4(dem.bbox[0], dem.bbox[1], dem.bbox[2], dem.bbox[3]) },
      uTexSize: { value: new Vector2(dem.width, dem.height) },
      uBase: { value: base },
      uCam: { value: new Vector2() },
      uCamPos: { value: new Vector3() },
      uCurv: { value: 1 / (2 * MARS_RADIUS_M) },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uDemCell: { value: demCell },
      uFogDist: { value: 16_000 },
      uShadowSteps: { value: quality === "low" ? 14 : 30 },
    };
    const rings: Array<{ mesh: Mesh; offset: Vector2; step: number }> = [];
    const geometries: BufferGeometry[] = [];
    const materials: ShaderMaterial[] = [];
    for (let k = 0; k < levels; k++) {
      const cell = cell0 * 2 ** k;
      const geometry = buildRingGeometry(RING_CELLS, cell, k > 0);
      const offset = new Vector2();
      const material = new ShaderMaterial({
        uniforms: { ...common, uOffset: { value: offset }, uCell: { value: cell }, uHalf: { value: (RING_CELLS / 2) * cell } },
        vertexShader: terrainVertexShader,
        fragmentShader: terrainFragmentShader,
      });
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      rings.push({ mesh, offset, step: 2 * cell });
      geometries.push(geometry);
      materials.push(material);
    }
    const skyGeo = new SphereGeometry(40_000, 40, 20);
    const skyMat = new ShaderMaterial({
      uniforms: { uSunDir: common.uSunDir },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const sky = new Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;

    const ribbonGeo = buildRibbonGeometry(path, dem, base, route.segments ?? [], route.profile ?? "FASTEST");
    const ribbonMat = new ShaderMaterial({
      uniforms: { uCam: common.uCam, uCamPos: common.uCamPos, uCurv: common.uCurv, uSunDir: common.uSunDir, uFogDist: common.uFogDist },
      vertexShader: ribbonVertexShader,
      fragmentShader: ribbonFragmentShader,
      vertexColors: true,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const ribbon = new Mesh(ribbonGeo, ribbonMat);
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 2;

    // beacons: a thin vertical line per waypoint
    const beaconPts: number[] = [];
    const markers: FpvWaypoint[] = roverNow ? [...waypoints, { name: "rover", x: roverNow.x, y: roverNow.y }] : waypoints;
    for (const w of markers) {
      const y = demHeight(dem, w.x, w.y) - base;
      beaconPts.push(w.x, y, -w.y, w.x, y + 14, -w.y);
    }
    const beaconGeo = new BufferGeometry();
    beaconGeo.setAttribute("position", new Float32BufferAttribute(beaconPts, 3));
    const beaconMat = new LineBasicMaterial({ color: 0xe06a3b, transparent: true, opacity: 0.85, depthWrite: false });
    const beacons = new LineSegments(beaconGeo, beaconMat);
    beacons.frustumCulled = false;

    return { common, rings, sky, ribbon, beacons, heightTex, geometries: [...geometries, skyGeo, ribbonGeo, beaconGeo], materials: [...materials, skyMat, ribbonMat, beaconMat] };
  }, [dem, base, path, route.segments, route.profile, waypoints, roverNow, quality]);

  useEffect(() => {
    return () => {
      disposeFpvResources({ geometries: gpu.geometries, materials: gpu.materials, textures: [gpu.heightTex] });
    };
  }, [gpu]);

  useEffect(() => {
    if (!onDebug || !gl || !advance || !setFrameloop) return;
    onDebug({
      seek: (distM) => {
        rig.current.simT = timeAtDistance(path, distM);
      },
      run: async (frames) => {
        // R3F only honours advance() when its own loop is off; the GPU is waited for with finish() so the time is real
        setFrameloop("never");
        const t0 = performance.now();
        let ts = t0;
        for (let i = 0; i < frames; i++) {
          ts += 100; // the simulation advances 0.1 s of wall time per frame, like a slow real frame
          advance(ts / 1000);
        }
        gl.getContext().finish();
        const ms = performance.now() - t0;
        setFrameloop("always");
        return { frames, ms, msPerFrame: ms / frames, fps: (frames * 1000) / ms };
      },
    });
  }, [onDebug, gl, advance, setFrameloop, path]);

  // Official NASA Curiosity model (11 MB): requested lazily when the walker comes within ROVER_LOAD_RADIUS_M, and only if the file
  // exists; on any failure the marker and label of the rover stay and nothing else changes.
  useEffect(() => {
    if (!roverNow || !roverWanted) return undefined;
    let cancelled = false;
    let loaded: Group | null = null;
    (async () => {
      try {
        const head = await fetch(roverModelUrl, { method: "HEAD" });
        if (!head.ok || cancelled) return;
        const gltf = await new GLTFLoader().loadAsync(roverModelUrl);
        if (cancelled) {
          disposeObject3D(gltf.scene);
          return;
        }
        loaded = placeRoverModel(gltf.scene, dem, base, roverNow.x, roverNow.y, roverHeadingDeg, ROVER_FORWARD_YAW_DEG);
        setRover(loaded);
      } catch {
        /* no model: the marker remains */
      }
    })();
    return () => {
      cancelled = true;
      if (loaded) disposeObject3D(loaded);
      setRover(null);
    };
  }, [roverNow, roverWanted, roverModelUrl, roverHeadingDeg, dem, base]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const r = rig.current;
    const ctl = controls.current;
    const inp = inputs.current;
    const now = performance.now();

    // ---- time and position
    let x: number;
    let y: number;
    let walkHeading: number;
    let dist: number;
    if (ctl.free) {
      // WASD relative to the look direction; stays on the terrain through the eye-height clamp below
      const yaw = ((r.free.heading + inp.yawOff) * Math.PI) / 180;
      const fwd = (inp.keys.has("w") ? 1 : 0) - (inp.keys.has("s") ? 1 : 0);
      const side = (inp.keys.has("d") ? 1 : 0) - (inp.keys.has("a") ? 1 : 0);
      const sp = WALK_FREE_M_S * (inp.keys.has("shift") ? 4 : 1) * dt;
      if (fwd || side) {
        r.free.x += (Math.sin(yaw) * fwd + Math.cos(yaw) * side) * sp;
        r.free.y += (Math.cos(yaw) * fwd - Math.sin(yaw) * side) * sp;
        r.free.x = clamp(r.free.x, dem.bbox[0], dem.bbox[2]);
        r.free.y = clamp(r.free.y, dem.bbox[1], dem.bbox[3]);
      }
      x = r.free.x;
      y = r.free.y;
      walkHeading = r.free.heading;
      dist = nearestDistanceOnPath(path, x, y);
    } else {
      if (!ctl.paused) r.simT = Math.min(path.totalTime, r.simT + dt * ctl.speed);
      dist = distanceAtTime(path, r.simT);
      const st = pathStateAtDistance(path, dist);
      x = st.x;
      y = st.y;
      // look a few metres ahead so the heading turns before the corner instead of snapping at it
      walkHeading = pathStateAtDistance(path, dist + 8).headingDeg;
      r.heading = smoothHeadingDeg(r.heading, walkHeading, dt, reducedMotion ? 0 : 0.7);
    }
    const baseHeading = ctl.free ? r.free.heading : r.heading;

    // ---- look input
    const k = inp.keys;
    const lookRate = 70 * dt;
    if (k.has("arrowleft")) inp.yawOff -= lookRate;
    if (k.has("arrowright")) inp.yawOff += lookRate;
    if (k.has("arrowup")) inp.pitch = clamp(inp.pitch + lookRate, -70, 70);
    if (k.has("arrowdown")) inp.pitch = clamp(inp.pitch - lookRate, -70, 70);
    const idle = !inp.dragging && !k.has("arrowleft") && !k.has("arrowright") && !k.has("arrowup") && !k.has("arrowdown") && now - inp.lastInteract > 1500;
    if (idle && !ctl.free && !reducedMotion) {
      inp.yawOff += (0 - inp.yawOff) * (1 - Math.exp(-dt / 5));
      inp.pitch += (0 - inp.pitch) * (1 - Math.exp(-dt / 7));
    }
    inp.yawOff = clamp(inp.yawOff, -180, 180);
    const heading = wrapDeg360(baseHeading + inp.yawOff);

    // ---- camera
    const ground = demHeight(dem, x, y);
    const eye = eyeElevation(ground, r.eyeY, dt);
    r.eyeY = eye;
    const cam = camera as PerspectiveCamera;
    cam.position.set(x, eye - base, -y);
    cam.rotation.order = "YXZ";
    cam.rotation.set((inp.pitch * Math.PI) / 180, (-heading * Math.PI) / 180, 0);

    // ---- uniforms and rings
    const c = gpu.common;
    c.uCam.value.set(x, -y);
    c.uCamPos.value.set(x, eye - base, -y);
    for (const ring of gpu.rings) {
      ring.offset.set(snapToLattice(x, ring.step), snapToLattice(-y, ring.step));
    }
    gpu.sky.position.copy(cam.position);

    // ---- sun: real API value, refreshed every 10 minutes of simulated time
    if (r.simT - r.sunFetchedAtSimT > 600) {
      r.sunFetchedAtSimT = r.simT;
      const [lon, lat] = siteGeo ? localToGeo(siteGeo, x, y) : aoiToGeo(x, y);
      const utc = new Date(Date.parse(startUtc) + r.simT * 1000).toISOString();
      void fetchSunPosition(lat, lon, utc).then((s) => {
        r.sun = s;
      });
    }
    const sv = sunAnglesToVector3(r.sun.azimuth_deg, r.sun.elevation_deg);
    c.uSunDir.value.set(sv.x, sv.y, sv.z);
    if (sunLight.current) {
      sunLight.current.position.set(x + sv.x * 100, eye - base + sv.y * 100, -y + sv.z * 100);
      sunLight.current.intensity = clamp(sv.y * 4.2, 0, 3.2);
    }

    // ---- fps
    r.fpsFrames += 1;
    r.fpsAcc += rawDt;
    if (r.fpsAcc >= 1) {
      onFps?.(r.fpsFrames / r.fpsAcc);
      r.fpsFrames = 0;
      r.fpsAcc = 0;
    }

    // ---- horizon (5 Hz) and telemetry (10 Hz)
    r.horizonAcc += rawDt;
    if (r.horizonAcc > 0.2) {
      r.horizonAcc = 0;
      r.horizon = horizonAngleDeg(dem, x, y, eye, heading, REACH_M, 40);
    }
    r.labelAcc += rawDt;
    if (r.labelAcc > 0.5) {
      r.labelAcc = 0;
      const next: number[] = [];
      labelPoints.forEach((w, i) => {
        const d = Math.hypot(w.x - x, w.y - y);
        const bearing = bearingDistance(x, y, w.x, w.y).bearingDeg;
        if (d < 3500 && Math.abs(angleDiffDeg(heading, bearing)) < 75) next.push(i);
      });
      if (roverNow) {
        const dr = bearingDistance(x, y, roverNow.x, roverNow.y);
        if (dr.distanceM < ROVER_LOAD_RADIUS_M) setRoverWanted(true);
        setRoverCredit(dr.distanceM < ROVER_CREDIT_RADIUS_M && Math.abs(angleDiffDeg(heading, dr.bearingDeg)) < 60);
      }
      setVisibleLabels((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    }
    r.telemAcc += rawDt;
    if (r.telemAcc > 0.1) {
      r.telemAcc = 0;
      const bd = baseAt ? bearingDistance(x, y, baseAt.x, baseAt.y) : null;
      const o2Total = route.totals?.o2_l ?? null;
      const enTotal = route.totals?.energy_kJ ?? null;
      onTelemetry({
        headingDeg: heading,
        pitchDeg: inp.pitch,
        elevationM: ground,
        slopeDeg: slopeAlongHeadingDeg(dem, x, y, ctl.free ? heading : walkHeading),
        speedMps: ctl.free ? (k.has("w") || k.has("s") || k.has("a") || k.has("d") ? WALK_FREE_M_S : 0) : ctl.paused ? 0 : pathSpeedAt(path, dist),
        distanceWalkedM: dist,
        distanceRemainingM: Math.max(0, path.totalLength - dist),
        etaS: Math.max(0, path.totalTime - (ctl.free ? timeAtDistance(path, dist) : r.simT)),
        o2LeftL: o2Total !== null && o2Per ? Math.max(0, o2Total - cumulativeAlong(path, o2Per, dist)) : null,
        o2TotalL: o2Total,
        energyLeftKJ: enTotal !== null && enPer ? Math.max(0, enTotal - cumulativeAlong(path, enPer, dist)) : null,
        energyTotalKJ: enTotal,
        sunAzimuthDeg: r.sun.azimuth_deg,
        sunElevationDeg: r.sun.elevation_deg,
        missionUtc: new Date(Date.parse(startUtc) + (ctl.free ? timeAtDistance(path, dist) : r.simT) * 1000).toISOString(),
        baseBearingDeg: bd ? bd.bearingDeg : null,
        baseDistanceM: bd ? bd.distanceM : null,
        terrainHorizonDeg: r.horizon,
        playbackSpeed: ctl.speed,
        paused: ctl.paused,
        freeRoam: ctl.free,
      });
    }
  });

  // entering free roam keeps the current position and heading; leaving it rejoins the route at the nearest point
  useEffect(() => {
    const id = window.setInterval(() => {
      const ctl = controls.current;
      const r = rig.current;
      if (ctl.free && !(r as { wasFree?: boolean }).wasFree) {
        const st = pathStateAtDistance(path, distanceAtTime(path, r.simT));
        r.free.x = st.x;
        r.free.y = st.y;
        r.free.heading = r.heading;
        (r as { wasFree?: boolean }).wasFree = true;
      } else if (!ctl.free && (r as { wasFree?: boolean }).wasFree) {
        r.simT = timeAtDistance(path, nearestDistanceOnPath(path, r.free.x, r.free.y));
        (r as { wasFree?: boolean }).wasFree = false;
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [controls, path]);

  return (
    <>
      <primitive object={gpu.sky} />
      {gpu.rings.map((ring, i) => (
        <primitive key={i} object={ring.mesh} />
      ))}
      <primitive object={gpu.ribbon} />
      <primitive object={gpu.beacons} />
      {rover && (
        <>
          <primitive object={rover} />
          <ambientLight intensity={0.55} color={0xd9b79a} />
          <directionalLight ref={sunLight} color={0xfff0d6} />
        </>
      )}
      {rover && roverNow && roverCredit && (
        <Html position={[roverNow.x, demHeight(dem, roverNow.x, roverNow.y) - base + 0.4, -roverNow.y]} zIndexRange={[20, 0]} pointerEvents="none">
          <div className="fpv-credit">Curiosity 3D model: NASA/JPL-Caltech</div>
        </Html>
      )}
      {visibleLabels.map((i) => {
        const w = labelPoints[i];
        if (!w) return null;
        return (
          <Html key={`${w.name}-${i}`} position={[w.x, demHeight(dem, w.x, w.y) - base + 15, -w.y]} zIndexRange={[20, 0]} pointerEvents="none">
            <div className="fpv-beacon-label">{w.name}</div>
          </Html>
        );
      })}
    </>
  );
}

/** Local metres (x east, y north) around a site to lat/lon: good to a few metres within some tens of kilometres. */
export function localToGeo(origin: { lat: number; lon: number }, x: number, y: number): [number, number] {
  const R = 3_396_190;
  const lat = origin.lat + (y / R) * (180 / Math.PI);
  const lon = origin.lon + (x / (R * Math.cos((origin.lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lon, lat];
}

export function FirstPersonView({
  route,
  elevation,
  siteGeo,
  areaName = "the Gale area",
  waypoints = [],
  base: baseAt = null,
  roverNow = null,
  roverHeadingDeg = 0,
  utc,
  autoPlay = true,
  initialSpeed = 4,
  quality = "high",
  roverModelUrl = "/models/curiosity.glb",
  onExit,
  onFps,
  onDebug,
}: FirstPersonViewProps): ReactElement {
  const reducedMotion = useAppStore((s) => s.settings.reducedMotion);
  const storeUtc = useAppStore((s) => s.utc);
  const startUtc = utc ?? storeUtc;
  const hasGl = useMemo(() => webglAvailable(), []);

  const [dem, setDem] = useState<TerrainRasterData | null>(elevation ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  const [hudVisible, setHudVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls>({ speed: initialSpeed, paused: reducedMotion || !autoPlay, free: false, hud: true });
  const inputs = useRef<Inputs>({ yawOff: 0, pitch: 0, dragging: false, keys: new Set(), lastInteract: 0 });
  const path = useMemo(() => buildPathData(route.xy, route.segments ?? []), [route.xy, route.segments]);
  const base = useMemo(() => (dem ? Math.floor(dem.minElevation / 100) * 100 : 0), [dem]);

  const startAt = path.xy[0];
  const [telemetry, setTelemetry] = useState<FpvTelemetry>(() => {
    const [bx, by] = baseAt ? [baseAt.x, baseAt.y] : [NaN, NaN];
    const bd = baseAt && startAt ? bearingDistance(startAt[0], startAt[1], bx, by) : null;
    const sun = computeApproximateMarsSun(startUtc);
    return {
      headingDeg: pathStateAtDistance(path, 8).headingDeg,
      pitchDeg: 0,
      elevationM: elevation && startAt ? demHeight(elevation, startAt[0], startAt[1]) : 0,
      slopeDeg: 0,
      speedMps: 0,
      distanceWalkedM: 0,
      distanceRemainingM: path.totalLength,
      etaS: path.totalTime,
      o2LeftL: route.totals?.o2_l ?? null,
      o2TotalL: route.totals?.o2_l ?? null,
      energyLeftKJ: route.totals?.energy_kJ ?? null,
      energyTotalKJ: route.totals?.energy_kJ ?? null,
      sunAzimuthDeg: sun.azimuth_deg,
      sunElevationDeg: sun.elevation_deg,
      missionUtc: startUtc,
      baseBearingDeg: bd ? bd.bearingDeg : null,
      baseDistanceM: bd ? bd.distanceM : null,
      terrainHorizonDeg: 0,
      playbackSpeed: initialSpeed,
      paused: reducedMotion || !autoPlay,
      freeRoam: false,
    };
  });

  // load the best DEM when none was given
  useEffect(() => {
    if (elevation) {
      setDem(elevation);
      return undefined;
    }
    let cancelled = false;
    loadBestElevationCOG()
      .then((d) => {
        if (!cancelled) setDem(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Terrain could not be loaded");
      });
    return () => {
      cancelled = true;
    };
  }, [elevation]);

  // size of the view (for the pixel scale of the elevation ruler)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const apply = (): void => setSize({ w: el.clientWidth || 1280, h: el.clientHeight || 720 });
    apply();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggleHud = useCallback(() => {
    controls.current.hud = !controls.current.hud;
    setHudVisible(controls.current.hud);
  }, []);

  // keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      const ctl = controls.current;
      inputs.current.lastInteract = performance.now();
      if (key === " ") {
        ctl.paused = !ctl.paused;
        e.preventDefault();
      } else if (key === "1" || key === "2" || key === "3") {
        ctl.speed = SPEEDS[Number(key) - 1] ?? 4;
        ctl.paused = false;
      } else if (key === "f") {
        ctl.free = !ctl.free;
      } else if (key === "h") {
        toggleHud();
      } else if (key === "escape") {
        onExit?.();
      } else if (key.startsWith("arrow") || "wasd".includes(key) || key === "shift") {
        inputs.current.keys.add(key);
        if (key.startsWith("arrow")) e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent): void => {
      inputs.current.keys.delete(e.key.toLowerCase());
    };
    const onBlur = (): void => inputs.current.keys.clear();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [onExit, toggleHud]);

  // pointer look
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    inputs.current.dragging = true;
    inputs.current.lastInteract = performance.now();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const inp = inputs.current;
    if (!inp.dragging) return;
    inp.yawOff += e.movementX * 0.18;
    inp.pitch = clamp(inp.pitch - e.movementY * 0.14, -70, 70);
    inp.lastInteract = performance.now();
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    inputs.current.dragging = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  if (!hasGl) {
    return (
      <div className="fpv-root" role="region" aria-label="First-person view">
        <div className="fpv-status">
          <strong>3D graphics are not available</strong>
          <span>This view needs WebGL. Try another browser or enable hardware acceleration; the 2D map and the route table still work.</span>
          {onExit && (
            <button type="button" className="fpv-exit" style={{ position: "static", justifySelf: "center" }} onClick={onExit}>
              Back to map
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="fpv-root"
      role="region"
      aria-label="First-person view of the route"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {dem ? (
        <Canvas
          dpr={[1, 1.5]}
          camera={{ fov: FPV_FOV_DEG, near: 0.4, far: 50_000, position: [0, 0, 0] }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          flat
        >
          <Scene
            dem={dem}
            base={base}
            path={path}
            route={route}
            waypoints={waypoints}
            baseAt={baseAt}
            roverNow={roverNow}
            roverHeadingDeg={roverHeadingDeg}
            roverModelUrl={roverModelUrl}
            startUtc={startUtc}
            siteGeo={siteGeo}
            quality={quality}
            reducedMotion={reducedMotion}
            controls={controls}
            inputs={inputs}
            onTelemetry={setTelemetry}
            onFps={onFps}
            onDebug={onDebug}
          />
        </Canvas>
      ) : (
        <div className="fpv-status" role="status">
          <strong>{loadError ? "Terrain could not be loaded" : "Loading terrain"}</strong>
          <span>{loadError ?? `Reading the elevation model of ${areaName}`}</span>
        </div>
      )}
      <FpvHud telemetry={telemetry} fovDeg={FPV_FOV_DEG} viewportHeight={size.h} viewportWidth={size.w} hudVisible={hudVisible && Boolean(dem)} />
      {onExit && (
        <button type="button" className="fpv-exit" onClick={onExit} onPointerDown={(e) => e.stopPropagation()}>
          Exit first person (Esc)
        </button>
      )}
    </div>
  );
}
