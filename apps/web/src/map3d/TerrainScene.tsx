/**
 * TerrainScene.tsx - 3D terrain viewer for Gale Crater AOI.
 * 
 * Features:
 * - Loads elevation COG via geotiff.js (with offline synthetic fallback).
 * - Plane geometry displaced on GPU via float height texture.
 * - Vertical exaggeration control (default: 2.0).
 * - Perceptually uniform Cividis colormap LUT texture.
 * - OrbitControls for user exploration (pan/orbit/tilt).
 * - Reacts to store.flyTo with smooth 1.5s camera path without terrain clipping.
 * - Complete GPU resource disposal on unmount.
 */

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
  DataTexture,
} from "three";
import {
  loadElevationCOG,
  createHeightDataTexture,
  sampleTerrainElevation,
  type DEFAULT_AOI_BBOX,
} from "./terrainLoader";
import { createCividisLutTexture } from "./cividis";
import { geoToAoi } from "./projection";
import {
  interpolateCameraPose,
  createLookAtPose,
  type CameraPose,
} from "./flyTo";
import type { TerrainRasterData, TerrainSceneProps, AppStoreFlyTo } from "./types";

// GPU Terrain Displacement & Cividis Colormap Shader
const terrainVertexShader = `
  uniform sampler2D uHeightMap;
  uniform float uMinElevation;
  uniform float uMaxElevation;
  uniform float uExaggeration;

  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;

    // Flip V so row 0 (North) aligns with scene -Z (North)
    vec2 sampleUv = vec2(uv.x, 1.0 - uv.y);
    float elev = texture2D(uHeightMap, sampleUv).r;
    vElevation = elev;

    // Displace along plane normal (Z axis before rotation)
    vec3 displaced = position;
    displaced.z += (elev - uMinElevation) * uExaggeration;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const terrainFragmentShader = `
  uniform sampler2D uLut;
  uniform float uMinElevation;
  uniform float uMaxElevation;
  uniform vec3 uSunDir;

  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vWorldPosition;

  void main() {
    // Exact screen-space derivatives give per-pixel surface normal
    vec3 fdx = dFdx(vWorldPosition);
    vec3 fdy = dFdy(vWorldPosition);
    vec3 normal = normalize(cross(fdy, fdx));

    // Ensure normal points upward into the sky
    if (normal.y < 0.0) {
      normal = -normal;
    }

    // Normalized elevation in [0, 1] for Cividis LUT sampling
    float range = max(1.0, uMaxElevation - uMinElevation);
    float normElev = clamp((vElevation - uMinElevation) / range, 0.0, 1.0);

    // Sample Cividis colormap LUT
    vec3 cividisColor = texture2D(uLut, vec2(normElev, 0.5)).rgb;

    // Martian Sun lighting + ambient skylight
    vec3 sun = normalize(uSunDir);
    float diff = max(dot(normal, sun), 0.0);
    float ambient = 0.22;
    float skyBounce = max(normal.y, 0.0) * 0.08;

    vec3 finalColor = cividisColor * (ambient + (1.0 - ambient) * diff + skyBounce);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface TerrainMeshProps {
  data: TerrainRasterData;
  verticalExaggeration: number;
  flyTo?: AppStoreFlyTo | null;
  onFlyToComplete?: () => void;
}

function TerrainMesh({
  data,
  verticalExaggeration,
  flyTo,
  onFlyToComplete,
}: TerrainMeshProps) {
  const { camera, scene } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  // Flight animation state
  const isFlying = useRef(false);
  const flyProgress = useRef(0);
  const startPoseRef = useRef<CameraPose | null>(null);
  const endPoseRef = useRef<CameraPose | null>(null);
  const lastNonceRef = useRef<number | undefined>(undefined);

  // Set scene background and fog
  useEffect(() => {
    scene.background = new Color("#0B0F14");
    scene.fog = new FogExp2("#0B0F14", 0.000035);
  }, [scene]);

  // Dimensions in AOI meters
  const sizeX = data.bbox[2] - data.bbox[0]; // ~15600m
  const sizeZ = data.bbox[3] - data.bbox[1]; // ~20400m

  // GPU Height texture and Cividis LUT texture
  const heightTexture = useMemo(() => createHeightDataTexture(data), [data]);
  const lutTexture = useMemo(() => createCividisLutTexture(), []);

  // Plane geometry
  const planeGeo = useMemo(() => {
    return new PlaneGeometry(sizeX, sizeZ, 128, 128);
  }, [sizeX, sizeZ]);

  // Shader material
  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      uniforms: {
        uHeightMap: { value: heightTexture },
        uLut: { value: lutTexture },
        uMinElevation: { value: data.minElevation },
        uMaxElevation: { value: data.maxElevation },
        uExaggeration: { value: verticalExaggeration },
        uSunDir: { value: new Vector3(0.6, 0.8, 0.4).normalize() },
      },
      side: DoubleSide,
    });
  }, [heightTexture, lutTexture, data.minElevation, data.maxElevation, verticalExaggeration]);

  // Update uniforms when props change
  useEffect(() => {
    material.uniforms["uExaggeration"]!.value = verticalExaggeration;
    material.uniforms["uMinElevation"]!.value = data.minElevation;
    material.uniforms["uMaxElevation"]!.value = data.maxElevation;
    material.needsUpdate = true;
  }, [verticalExaggeration, data, material]);

  // Clean up GPU resources on unmount
  useEffect(() => {
    return () => {
      planeGeo.dispose();
      material.dispose();
      heightTexture.dispose();
      lutTexture.dispose();
    };
  }, [planeGeo, material, heightTexture, lutTexture]);

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

  // Animation frame: interpolate camera and update OrbitControls
  useFrame((_, delta) => {
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
      <directionalLight position={[10000, 15000, 8000]} intensity={1.8} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        minDistance={300}
        maxDistance={45000}
        maxPolarAngle={Math.PI / 2 - 0.05} // Prevent going below horizon
      />

      {/* Terrain mesh: rotated -90 deg around X so normal points up (+Y) */}
      <mesh
        geometry={planeGeo}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      />
    </>
  );
}

/**
 * TerrainScene component for Lane W7.
 */
export function TerrainScene({
  cogUrl = "/data/gale/L1/elevation.tif",
  verticalExaggeration = 2.0,
  flyTo,
  onFlyToComplete,
  initialData,
}: TerrainSceneProps) {
  const [data, setData] = useState<TerrainRasterData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    loadElevationCOG(cogUrl)
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
          Loading Gale Crater 3D Terrain...
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
          camera={{
            position: [0, 8500, 14000],
            fov: 45,
            near: 10,
            far: 100000,
          }}
          gl={{ antialias: true }}
          style={{ width: "100%", height: "100%" }}
        >
          <TerrainMesh
            data={data}
            verticalExaggeration={verticalExaggeration}
            flyTo={flyTo}
            onFlyToComplete={onFlyToComplete}
          />
        </Canvas>
      )}

      {/* Overlay telemetry badge */}
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
            background: "rgba(11, 15, 20, 0.8)",
            backdropFilter: "blur(6px)",
            padding: "5px 10px",
            borderRadius: 4,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <span>GALE CRATER 3D TERRAIN (L1 HRSC/MOLA)</span>
          <span>
            ELEVATION: {data.minElevation.toFixed(0)}m to {data.maxElevation.toFixed(0)}m • EXAGGERATION: {verticalExaggeration}x
          </span>
          <span style={{ color: "#56B4E9" }}>COLORMAP: CIVIDIS (LUT)</span>
        </div>
      )}
    </div>
  );
}
