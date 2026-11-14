/**
 * TerrainScene.tsx - High-performance 3D Terrain Viewer for Gale Crater AOI.
 * 
 * Features:
 * - Real COG elevation loading (with automatic best-level L3/L2/L1 fallback and overview support).
 * - Chunked / LOD grid mesh guaranteed <= 1,000,000 triangles.
 * - Manual bilinear height sampling in vertex and fragment shaders (immune to float linear filtering limits).
 * - Finite-difference normal calculation matching Horn slope F05.
 * - Multi-layer shader draping: Elevation (Cividis), Slope (Magma), Dynamic Hillshade (solar vector).
 * - 3D Route Tube 1.0m above terrain with per-segment limiting-factor coloring from design tokens.
 * - Waypoint and Place markers with beacon pins and ground rings.
 * - Real Curiosity traverse path line 0.5m above terrain.
 * - Directional sunlight and shadow mapping synchronized to simulation time / API /sun.
 * - Complete GPU resource disposal on unmount.
 */

import { AdaptiveDpr } from "../app/AdaptiveDpr";
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  Vector3,
  Color,
  PlaneGeometry,
  ShaderMaterial,
  DoubleSide,
  FogExp2,
  CylinderGeometry,
  RingGeometry,
  MeshBasicMaterial,
  LineBasicMaterial,
  BufferGeometry,
  Group,
  Mesh,
  DataTexture,
  CanvasTexture,
  SRGBColorSpace,
} from "three";
import {
  loadElevationCOG,
  loadBestElevationCOG,
  createHeightDataTexture,
  sampleTerrainElevation,
} from "./terrainLoader";
import { createCividisLutTexture } from "./cividis";
import { createMagmaLutTexture } from "./colormap";
import { selectTerrainLOD } from "./lod";
import { sunAnglesToVector3, fetchSunPosition } from "./sun";
import { geoToAoi } from "./projection";
import {
  interpolateCameraPose,
  createLookAtPose,
  type CameraPose,
} from "./flyTo";
import {
  buildRouteTubeSegments,
  buildTraversePathPoints,
  type RouteSegment3D,
} from "./routeTube";
import {
  buildPlaceMarkers,
  buildWaypointMarkers,
  type Marker3DItem,
  type PlaceInput,
} from "./markers";
import { RoverModel } from "./RoverModel";
import {
  terrainDisplacementVertexShader,
  terrainDrapingFragmentShader,
} from "./shaders";
import type {
  TerrainRasterData,
  TerrainSceneProps,
  AppStoreFlyTo,
} from "./types";
import { useAppStore } from "../state/store";

export interface TerrainGPUResources {
  planeGeo?: BufferGeometry;
  terrainMaterial?: ShaderMaterial;
  heightTexture?: DataTexture;
  cividisTexture?: DataTexture;
  magmaTexture?: DataTexture;
}

/**
 * Disposes all GPU resources associated with terrain rendering to prevent WebGL memory leaks.
 */
export function disposeTerrainGPUResources(res: TerrainGPUResources): void {
  res.planeGeo?.dispose();
  res.terrainMaterial?.dispose();
  res.heightTexture?.dispose();
  res.cividisTexture?.dispose();
  res.magmaTexture?.dispose();
}

interface TerrainMeshInternalProps {
  data: TerrainRasterData;
  verticalExaggeration: number;
  flyTo?: AppStoreFlyTo | null;
  onFlyToComplete?: () => void;
  sunVector: Vector3;
  elevationOpacity: number;
  slopeOpacity: number;
  hillshadeOpacity: number;
  routeSegments: RouteSegment3D[];
  placeMarkers: Marker3DItem[];
  waypointMarkers: Marker3DItem[];
  traversePoints: Vector3[];
  onFpsUpdate?: (fps: number, frameTimeMs: number) => void;
}

function TerrainMeshInternal({
  data,
  verticalExaggeration,
  flyTo,
  onFlyToComplete,
  sunVector,
  elevationOpacity,
  slopeOpacity,
  hillshadeOpacity,
  routeSegments,
  placeMarkers,
  waypointMarkers,
  traversePoints,
  onFpsUpdate,
}: TerrainMeshInternalProps) {
  const { camera, scene } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  // Flight animation state
  const isFlying = useRef(false);
  const flyProgress = useRef(0);
  const startPoseRef = useRef<CameraPose | null>(null);
  const endPoseRef = useRef<CameraPose | null>(null);
  const lastNonceRef = useRef<number | undefined>(undefined);

  // FPS tracking
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  // Set scene background and fog matching Martian atmosphere
  // The sky is a vertical gradient, deep ink at the zenith and dusty haze at the horizon, so the relief sits in an
  // atmosphere instead of floating on flat black. The fog uses the haze colour.
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const g = c.getContext("2d");
    let sky: CanvasTexture | null = null;
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#04070d");
      grad.addColorStop(0.55, "#0c1522");
      grad.addColorStop(0.86, "#2a2a33");
      grad.addColorStop(1, "#3d332f");
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 256);
      sky = new CanvasTexture(c);
      sky.colorSpace = SRGBColorSpace;
      scene.background = sky;
    } else {
      scene.background = new Color("#0B0F14");
    }
    scene.fog = new FogExp2("#2a2a33", 0.000032);
    return () => {
      sky?.dispose();
    };
  }, [scene]);

  // Dimensions in AOI meters
  const sizeX = data.bbox[2] - data.bbox[0]; // ~15600m
  const sizeZ = data.bbox[3] - data.bbox[1]; // ~20400m
  const cellDx = sizeX / Math.max(1, data.width - 1);
  const cellDy = sizeZ / Math.max(1, data.height - 1);

  // LOD calculation: ensures mesh never exceeds 800k triangles (<= 1M limit)
  const lod = useMemo(() => {
    return selectTerrainLOD(data.width, data.height, 800_000);
  }, [data.width, data.height]);

  // GPU Textures
  const heightTexture = useMemo(() => createHeightDataTexture(data), [data]);
  const cividisTexture = useMemo(() => createCividisLutTexture(), []);
  const magmaTexture = useMemo(() => createMagmaLutTexture(), []);

  // Plane Geometry based on LOD segments
  const planeGeo = useMemo(() => {
    return new PlaneGeometry(sizeX, sizeZ, lod.segmentsX, lod.segmentsZ);
  }, [sizeX, sizeZ, lod.segmentsX, lod.segmentsZ]);

  // Multi-layer Shader Material
  const terrainMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: terrainDisplacementVertexShader,
      fragmentShader: terrainDrapingFragmentShader,
      uniforms: {
        uHeightMap: { value: heightTexture },
        uHeightMapSize: { value: [data.width, data.height] },
        uCividisLut: { value: cividisTexture },
        uMagmaLut: { value: magmaTexture },
        uMinElevation: { value: data.minElevation },
        uMaxElevation: { value: data.maxElevation },
        uExaggeration: { value: verticalExaggeration },
        uSunDir: { value: sunVector },
        uCellSize: { value: [cellDx, cellDy] },
        uElevationOpacity: { value: elevationOpacity },
        uSlopeOpacity: { value: slopeOpacity },
        uHillshadeOpacity: { value: hillshadeOpacity },
        uAmbient: { value: 0.18 },
      },
      side: DoubleSide,
    });
  }, [
    heightTexture,
    cividisTexture,
    magmaTexture,
    data,
    verticalExaggeration,
    sunVector,
    cellDx,
    cellDy,
    elevationOpacity,
    slopeOpacity,
    hillshadeOpacity,
  ]);

  // Update dynamic uniforms
  useEffect(() => {
    terrainMaterial.uniforms["uExaggeration"]!.value = verticalExaggeration;
    terrainMaterial.uniforms["uSunDir"]!.value = sunVector;
    terrainMaterial.uniforms["uElevationOpacity"]!.value = elevationOpacity;
    terrainMaterial.uniforms["uSlopeOpacity"]!.value = slopeOpacity;
    terrainMaterial.uniforms["uHillshadeOpacity"]!.value = hillshadeOpacity;
    terrainMaterial.needsUpdate = true;
  }, [
    verticalExaggeration,
    sunVector,
    elevationOpacity,
    slopeOpacity,
    hillshadeOpacity,
    terrainMaterial,
  ]);

  // Traverse path line geometry
  const traverseGeo = useMemo(() => {
    if (traversePoints.length < 2) return null;
    const geom = new BufferGeometry().setFromPoints(traversePoints);
    return geom;
  }, [traversePoints]);

  const traverseMaterial = useMemo(() => {
    return new LineBasicMaterial({
      color: "#56B4E9",
      transparent: true,
      opacity: 0.65,
    });
  }, []);

  // Cleanup all GPU resources on unmount
  useEffect(() => {
    return () => {
      disposeTerrainGPUResources({
        planeGeo,
        terrainMaterial,
        heightTexture,
        cividisTexture,
        magmaTexture,
      });
      if (traverseGeo) traverseGeo.dispose();
      traverseMaterial.dispose();
    };
  }, [
    planeGeo,
    terrainMaterial,
    heightTexture,
    cividisTexture,
    magmaTexture,
    traverseGeo,
    traverseMaterial,
  ]);

  // Elevation sampler for clearance calculation
  const getGroundY = useCallback(
    (sceneX: number, sceneZ: number): number => {
      const rawElev = sampleTerrainElevation(data, sceneX, sceneZ);
      return (rawElev - data.minElevation) * verticalExaggeration;
    },
    [data, verticalExaggeration]
  );

  // Trigger flyTo camera animation when flyTo prop changes
  useEffect(() => {
    if (!flyTo) return;
    if (flyTo.nonce !== undefined && flyTo.nonce === lastNonceRef.current) return;
    lastNonceRef.current = flyTo.nonce;

    const [aoiX, aoiY] = geoToAoi(flyTo.target.lat, flyTo.target.lon);
    const sceneX = aoiX;
    const sceneZ = -aoiY;
    const groundY = getGroundY(sceneX, sceneZ);

    const distance = flyTo.zoomHint ? Math.max(800, 3000 / flyTo.zoomHint) : 2200;
    const endPose = createLookAtPose(
      { x: sceneX, z: sceneZ, elevation: groundY },
      distance,
      40,
      20
    );

    const currentControlsTarget = controlsRef.current
      ? controlsRef.current.target
      : new Vector3(0, 0, 0);

    const startPose: CameraPose = {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      target: {
        x: currentControlsTarget.x,
        y: currentControlsTarget.y,
        z: currentControlsTarget.z,
      },
    };

    startPoseRef.current = startPose;
    endPoseRef.current = endPose;
    flyProgress.current = 0;
    isFlying.current = true;
  }, [flyTo, camera, getGroundY]);

  // Frame animation loop
  useFrame((_, delta) => {
    // Measure FPS and frame time
    frameCount.current += 1;
    const now = performance.now();
    if (now - lastTime.current >= 500) {
      const fps = Math.round((frameCount.current * 1000) / (now - lastTime.current));
      const frameTimeMs = (now - lastTime.current) / frameCount.current;
      onFpsUpdate?.(fps, frameTimeMs);
      frameCount.current = 0;
      lastTime.current = now;
    }

    if (!isFlying.current || !startPoseRef.current || !endPoseRef.current) {
      return;
    }

    flyProgress.current += delta / 1.5; // ~1.5 seconds transition
    const t = Math.min(1.0, flyProgress.current);

    const currentPose = interpolateCameraPose(
      startPoseRef.current,
      endPoseRef.current,
      t,
      {
        minClearance: 120, // Keep camera well above mountain peaks
        getTerrainElevation: (x, z) => getGroundY(x, z),
      }
    );

    camera.position.set(
      currentPose.position.x,
      currentPose.position.y,
      currentPose.position.z
    );

    if (controlsRef.current) {
      controlsRef.current.target.set(
        currentPose.target.x,
        currentPose.target.y,
        currentPose.target.z
      );
      controlsRef.current.update();
    }

    if (t >= 1.0) {
      isFlying.current = false;
      onFlyToComplete?.();
    }
  });

  return (
    <>
      <ambientLight intensity={0.2} />

      {/* Directional Sunlight with Shadows */}
      <directionalLight
        position={[sunVector.x * 20000, sunVector.y * 20000, sunVector.z * 20000]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={100}
        shadow-camera-far={50000}
        shadow-camera-left={-12000}
        shadow-camera-right={12000}
        shadow-camera-top={12000}
        shadow-camera-bottom={-12000}
        shadow-bias={-0.0004}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        minDistance={200}
        maxDistance={48000}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />

      {/* Main displaced terrain mesh */}
      <mesh
        geometry={planeGeo}
        material={terrainMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        castShadow
        receiveShadow
      />

      {/* Route Tube (1m above surface, per-segment colors) */}
      <group>
        {routeSegments.map((seg, idx) => (
          <RouteTubeItem key={`seg-${idx}`} segment={seg} />
        ))}
      </group>

      {/* Curiosity Traverse Line */}
      {traverseGeo && (
        <primitive object={new Mesh(traverseGeo, traverseMaterial)} />
      )}

      {/* Place Markers */}
      <group>
        {placeMarkers.map((m) =>
          m.kind === "rover" ? (
            <RoverModel
              key={`rover-${m.id}`}
              position={m.position}
              normal={m.normal}
              color={m.color}
            />
          ) : (
            <MarkerItem key={`place-${m.id}`} marker={m} />
          )
        )}
      </group>

      {/* Waypoint Markers */}
      <group>
        {waypointMarkers.map((m) => (
          <MarkerItem key={`wp-${m.id}`} marker={m} />
        ))}
      </group>
    </>
  );
}

/**
 * Single segment of the 3D route tube.
 */
function RouteTubeItem({ segment }: { segment: RouteSegment3D }) {
  const meshRef = useRef<Mesh>(null);

  const geom = useMemo(() => {
    // Cylinder oriented along Y axis by default, radius 2m
    return new CylinderGeometry(2.0, 2.0, segment.length, 12);
  }, [segment.length]);

  const mat = useMemo(() => {
    return new MeshBasicMaterial({ color: segment.color });
  }, [segment.color]);

  useEffect(() => {
    if (!meshRef.current) return;
    // Align cylinder from +Y up vector to segment direction
    meshRef.current.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), segment.direction);
  }, [segment.direction]);

  useEffect(() => {
    return () => {
      geom.dispose();
      mat.dispose();
    };
  }, [geom, mat]);

  return (
    <mesh
      ref={meshRef}
      geometry={geom}
      material={mat}
      position={[segment.midpoint.x, segment.midpoint.y, segment.midpoint.z]}
    />
  );
}

/**
 * 3D Marker Item with ground concentric ring, vertical pin beacon, and billboard.
 */
function MarkerItem({ marker }: { marker: Marker3DItem }) {
  const pinGeo = useMemo(() => new CylinderGeometry(1.5, 1.5, 30, 16), []);
  const pinMat = useMemo(() => new MeshBasicMaterial({ color: marker.color }), [marker.color]);

  const ringGeo = useMemo(() => new RingGeometry(4, 8, 32), []);
  const ringMat = useMemo(
    () => new MeshBasicMaterial({ color: marker.color, side: DoubleSide, transparent: true, opacity: 0.8 }),
    [marker.color]
  );

  useEffect(() => {
    return () => {
      pinGeo.dispose();
      pinMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    };
  }, [pinGeo, pinMat, ringGeo, ringMat]);

  return (
    <group position={[marker.position.x, marker.position.y, marker.position.z]}>
      {/* Ground ring */}
      <mesh geometry={ringGeo} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} />

      {/* Vertical pin beacon */}
      <mesh geometry={pinGeo} material={pinMat} position={[0, 15, 0]} />

      {/* Beacon top sphere */}
      <mesh position={[0, 30, 0]}>
        <sphereGeometry args={[4, 16, 16]} />
        <meshBasicMaterial color={marker.color} />
      </mesh>
    </group>
  );
}

/**
 * Exported TerrainScene component for Lane W7.
 */
export function TerrainScene({
  cogUrl,
  verticalExaggeration = 2.0,
  flyTo: propFlyTo,
  onFlyToComplete,
  initialData,
  timeOfDay,
  sunAngles,
  elevationOpacity: propElevOpacity,
  slopeOpacity: propSlopeOpacity,
  hillshadeOpacity: propHillshadeOpacity,
  showRouteTube = true,
  showMarkers = true,
  showTraverse = true,
  onFpsUpdate,
}: TerrainSceneProps) {
  // Store integration (fallback gracefully if store not populated)
  const storeMode = useAppStore((s) => s.mode);
  const storeFlyTo = useAppStore((s) => s.flyTo);
  const storeLayers = useAppStore((s) => s.layers);
  const storeRoutes = useAppStore((s) => s.routes);
  const storeSelectedRouteId = useAppStore((s) => s.selectedRouteId);
  const storeUtc = useAppStore((s) => s.utc);
  const storeWaypoints = useAppStore((s) => s.waypoints);

  const activeFlyTo = propFlyTo ?? storeFlyTo;

  // Layer visibility & opacity derived from store or props
  const elevationOpacity =
    propElevOpacity ?? (storeLayers["elevation"]?.visible !== false ? (storeLayers["elevation"]?.opacity ?? 1.0) : 0.0);
  const slopeOpacity =
    propSlopeOpacity ?? (storeLayers["slope"]?.visible ? (storeLayers["slope"]?.opacity ?? 0.8) : 0.0);
  const hillshadeOpacity =
    propHillshadeOpacity ?? (storeLayers["hillshade"]?.visible !== false ? (storeLayers["hillshade"]?.opacity ?? 0.85) : 0.0);

  // Terrain raster data state
  const [data, setData] = useState<TerrainRasterData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  // Solar position state
  const [solarAngles, setSolarAngles] = useState(
    sunAngles ?? { azimuth_deg: 135, elevation_deg: 45 }
  );

  // Places and traverse data
  const [places, setPlaces] = useState<PlaceInput[]>([]);
  const [traverseCoords, setTraverseCoords] = useState<Array<[number, number, number?]>>([]);

  // Load elevation COG
  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const loadPromise = cogUrl
      ? loadElevationCOG(cogUrl)
      : loadBestElevationCOG("L1");

    loadPromise
      .then((raster) => {
        if (isMounted) {
          setData(raster);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [cogUrl, initialData]);

  // Load solar position from API /sun or Mars time
  useEffect(() => {
    if (sunAngles) {
      setSolarAngles(sunAngles);
      return;
    }

    const utc = timeOfDay ?? storeUtc ?? new Date().toISOString();
    let isMounted = true;

    fetchSunPosition(-4.72, 137.4, utc).then((angles) => {
      if (isMounted) {
        setSolarAngles(angles);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [sunAngles, timeOfDay, storeUtc]);

  // Load places and traverse GeoJSON
  useEffect(() => {
    let isMounted = true;

    // Load places
    fetch("/data/gale/places.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (isMounted && json?.places) {
          setPlaces(json.places);
        }
      })
      .catch(() => {});

    // Load traverse
    fetch("/data/gale/traverse.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((geojson) => {
        if (isMounted && geojson?.features?.[0]?.geometry?.coordinates) {
          setTraverseCoords(geojson.features[0].geometry.coordinates);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute 3D light vector from solar angles
  const sunVector = useMemo(() => {
    const v = sunAnglesToVector3(solarAngles.azimuth_deg, solarAngles.elevation_deg);
    return new Vector3(v.x, v.y, v.z);
  }, [solarAngles]);

  // Active route
  const activeRoute = useMemo(() => {
    if (!storeRoutes || storeRoutes.length === 0) return null;
    return storeRoutes.find((r) => r.route_id === storeSelectedRouteId) ?? storeRoutes[0]!;
  }, [storeRoutes, storeSelectedRouteId]);

  // Build 3D route tube segments
  const routeSegments = useMemo(() => {
    if (!showRouteTube || !data || !activeRoute || !activeRoute.xy) return [];
    return buildRouteTubeSegments(
      activeRoute.xy as Array<[number, number]>,
      activeRoute.segments ?? [],
      data,
      verticalExaggeration,
      activeRoute.profile ?? "FASTEST",
      1.0
    );
  }, [showRouteTube, data, activeRoute, verticalExaggeration]);

  // Build 3D markers
  const placeMarkers = useMemo(() => {
    if (!showMarkers || !data || places.length === 0) return [];
    return buildPlaceMarkers(places, data, verticalExaggeration, 2.0);
  }, [showMarkers, data, places, verticalExaggeration]);

  const waypointMarkers = useMemo(() => {
    if (!showMarkers || !data || !storeWaypoints || storeWaypoints.length === 0) return [];
    return buildWaypointMarkers(storeWaypoints, data, verticalExaggeration, 2.5);
  }, [showMarkers, data, storeWaypoints, verticalExaggeration]);

  // Build traverse points
  const traversePoints = useMemo(() => {
    if (!showTraverse || !data || traverseCoords.length === 0) return [];
    return buildTraversePathPoints(traverseCoords, data, verticalExaggeration, 0.5);
  }, [showTraverse, data, traverseCoords, verticalExaggeration]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 360,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0B0F14",
      }}
      role="region"
      aria-label="3D Gale Crater Terrain"
    >
      {loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#E6EDF3",
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            zIndex: 10,
          }}
        >
          Loading Gale Crater 3D Topography...
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            color: "#ff6b6b",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            zIndex: 10,
          }}
        >
          Failed to load terrain: {error}
        </div>
      )}

      {data && (
        <Canvas
          shadows
          camera={{
            position: [0, 8500, 14000],
            fov: 45,
            near: 10,
            far: 100000,
          }}
          gl={{ antialias: true }}
          style={{ width: "100%", height: "100%" }}
        >
          <AdaptiveDpr />
          <TerrainMeshInternal
            data={data}
            verticalExaggeration={verticalExaggeration}
            flyTo={activeFlyTo}
            onFlyToComplete={onFlyToComplete}
            sunVector={sunVector}
            elevationOpacity={elevationOpacity}
            slopeOpacity={slopeOpacity}
            hillshadeOpacity={hillshadeOpacity}
            routeSegments={routeSegments}
            placeMarkers={placeMarkers}
            waypointMarkers={waypointMarkers}
            traversePoints={traversePoints}
            onFpsUpdate={onFpsUpdate}
          />
        </Canvas>
      )}

      {/* Telemetry and Layer overlay badge */}
      {data && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            color: "#8899a6",
            background: "rgba(11, 15, 20, 0.84)",
            backdropFilter: "blur(8px)",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ color: "#E6EDF3", fontWeight: 700 }}>
            GALE CRATER 3D TOPOGRAPHY
          </div>
          <div>
            RELIEF: {data.minElevation.toFixed(0)}m to {data.maxElevation.toFixed(0)}m (span: {(data.maxElevation - data.minElevation).toFixed(0)}m) • EXAGGERATION: {verticalExaggeration}x
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "#56B4E9" }}>
              ELEV: CIVIDIS ({(elevationOpacity * 100).toFixed(0)}%)
            </span>
            <span style={{ color: "#fcffa4" }}>
              SLOPE: MAGMA ({(slopeOpacity * 100).toFixed(0)}%)
            </span>
            <span style={{ color: "var(--hz-accent, #2dd4bf)" }}>
              SUN: {solarAngles.azimuth_deg.toFixed(0)}° / {solarAngles.elevation_deg.toFixed(0)}°
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
