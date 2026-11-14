/**
 * MarsGlobe.tsx - Interactive 3D Mars globe with procedural shading, atmosphere glow,
 * AOI marker, circular placeholder orbiters, and fly-in camera animation.
 * 
 * Used for:
 * 1. Start-menu background (rotates with pointer/touch and slow idle auto-rotation).
 * 2. Globe mode (/globe).
 * 3. Cinematic fly-in transition from space to Gale Crater AOI.
 */

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Vector3,
  Color,
  ShaderMaterial,
  SphereGeometry,
  BufferGeometry,
  DoubleSide,
  AdditiveBlending,
  TextureLoader,
  Texture,
  Group,
  Mesh,
} from "three";
import {
  latLonToVector3,
  computeOrbiterPosition,
  generateOrbitTrackPoints,
  DEFAULT_ORBITERS,
  type OrbiterDef,
} from "./orbit";

export interface MarsGlobeProps {
  /**
   * Whether mouse and touch rotation interaction is enabled (default: true).
   */
  interactive?: boolean;
  /**
   * Whether the globe rotates slowly when idle (default: true).
   */
  autoRotate?: boolean;
  /**
   * Whether to display placeholder orbiters and their trajectories (default: true).
   */
  showOrbiters?: boolean;
  /**
   * Area of Interest coordinates (defaults to Gale Crater: lat: -4.72, lon: 137.40).
   */
  aoi?: { lat: number; lon: number };
  /**
   * Callback fired when fly-in camera transition finishes.
   */
  onFlyInComplete?: () => void;
  /**
   * Triggers cinematic fly-in animation from orbit to AOI.
   */
  flyIn?: boolean;
  /**
   * Optional custom URL for global Mars mosaic texture (falls back to procedural).
   */
  textureUrl?: string;
  /**
   * Custom style overrides for the container.
   */
  className?: string;
  style?: React.CSSProperties;
}

// Procedural Mars Shader
const marsVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const marsFragmentShader = `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform sampler2D uTexture;
  uniform float uUseTexture;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  // Procedural noise for Mars terrain synthesis
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.877, 0.479, -0.479, 0.877);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 col;
    if (uUseTexture > 0.5) {
      col = texture2D(uTexture, vUv).rgb;
    } else {
      // Planetocentric latitude parameter: 0 at equator, 1 at poles
      float latNorm = abs(vUv.y - 0.5) * 2.0;

      // Coordinate scaling for procedural surface features
      vec2 coord = vec2(vUv.x * 16.0, vUv.y * 8.0);
      float n1 = fbm(coord);
      float n2 = fbm(coord * 2.4 + vec2(2.3, 5.1));
      float detail = mix(n1, n2, 0.45);

      // Mars Color Palette
      vec3 rustOchre   = vec3(0.74, 0.36, 0.20); // Martian dust / highlands
      vec3 darkBasalt  = vec3(0.24, 0.17, 0.14); // Dark volcanic lowlands
      vec3 sandOrange  = vec3(0.85, 0.51, 0.28); // Bright desert sands
      vec3 polarIce    = vec3(0.92, 0.94, 0.98); // White ice caps

      vec3 surface = mix(darkBasalt, rustOchre, smoothstep(0.36, 0.64, detail));
      surface = mix(surface, sandOrange, smoothstep(0.64, 0.86, detail));

      // Polar ice caps
      float capMask = smoothstep(0.82, 0.92, latNorm + (detail - 0.5) * 0.08);
      surface = mix(surface, polarIce, capMask);

      col = surface;
    }

    // Directional Sun lighting with soft ambient and terminator
    vec3 sunDir = normalize(uSunDir);
    float NdotL = max(dot(vNormal, sunDir), 0.0);
    float ambient = 0.08;
    float light = ambient + (1.0 - ambient) * NdotL;

    gl_FragColor = vec4(col * light, 1.0);
  }
`;

// Atmosphere Rim Glow Fresnel Shader
const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Fresnel effect
    float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
    float intensity = pow(fresnel, 2.8);

    // Delicate Martian atmospheric haze: warm amber at inner edge, soft blue-peach at rim
    vec3 innerColor = vec3(0.82, 0.52, 0.38);
    vec3 outerColor = vec3(0.52, 0.68, 0.92);
    vec3 atmosColor = mix(innerColor, outerColor, fresnel * 0.7);

    gl_FragColor = vec4(atmosColor, intensity * 0.85);
  }
`;

/**
 * Inner Three.js globe scene component.
 */
interface GlobeSceneProps {
  interactive: boolean;
  autoRotate: boolean;
  showOrbiters: boolean;
  aoi: { lat: number; lon: number };
  flyIn: boolean;
  onFlyInComplete?: () => void;
  textureUrl?: string;
  isDragging: boolean;
  dragDelta: { x: number; y: number };
}

function GlobeScene({
  autoRotate,
  showOrbiters,
  aoi,
  flyIn,
  onFlyInComplete,
  textureUrl,
  isDragging,
  dragDelta,
}: GlobeSceneProps) {
  const { camera } = useThree();
  const globeGroupRef = useRef<Group>(null);
  const rotX = useRef(0.12);
  const rotY = useRef(0.0);
  const velX = useRef(0.0);
  const velY = useRef(0.0);
  const flyProgress = useRef(0);
  const flyCompleteRef = useRef(false);

  // Check user preference for reduced motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  }, []);

  // Shared geometry
  const sphereGeo = useMemo(() => new SphereGeometry(1.0, 64, 64), []);
  const atmosGeo = useMemo(() => new SphereGeometry(1.025, 64, 64), []);

  // Texture loading if provided
  const [loadedTexture, setLoadedTexture] = useState<Texture | null>(null);
  useEffect(() => {
    if (!textureUrl) {
      setLoadedTexture(null);
      return;
    }
    const loader = new TextureLoader();
    let isMounted = true;
    loader.load(
      textureUrl,
      (tex) => {
        if (isMounted) setLoadedTexture(tex);
      },
      undefined,
      () => {
        if (isMounted) setLoadedTexture(null);
      }
    );
    return () => {
      isMounted = false;
    };
  }, [textureUrl]);

  // Procedural Mars Shader Material
  const marsMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: marsVertexShader,
      fragmentShader: marsFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new Vector3(1.2, 0.4, 0.8).normalize() },
        uTexture: { value: null },
        uUseTexture: { value: 0.0 },
      },
    });
  }, []);

  useEffect(() => {
    if (loadedTexture) {
      marsMaterial.uniforms["uTexture"]!.value = loadedTexture;
      marsMaterial.uniforms["uUseTexture"]!.value = 1.0;
    } else {
      marsMaterial.uniforms["uTexture"]!.value = null;
      marsMaterial.uniforms["uUseTexture"]!.value = 0.0;
    }
    marsMaterial.needsUpdate = true;
  }, [loadedTexture, marsMaterial]);

  // Atmosphere Material
  const atmosphereMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Orbiters geometries and definitions
  const orbiterTracks = useMemo(() => {
    return DEFAULT_ORBITERS.map((orbiter) => {
      const points = generateOrbitTrackPoints(orbiter, 96);
      const geom = new BufferGeometry().setFromPoints(
        points.map((p) => new Vector3(p.x, p.y, p.z))
      );
      return { orbiter, geom };
    });
  }, []);

  // Cleanup geometries & materials on unmount
  useEffect(() => {
    return () => {
      sphereGeo.dispose();
      atmosGeo.dispose();
      marsMaterial.dispose();
      atmosphereMaterial.dispose();
      if (loadedTexture) loadedTexture.dispose();
      for (const t of orbiterTracks) {
        t.geom.dispose();
      }
    };
  }, [sphereGeo, atmosGeo, marsMaterial, atmosphereMaterial, loadedTexture, orbiterTracks]);

  // AOI 3D coordinates on sphere
  const aoiVec = useMemo(() => latLonToVector3(aoi.lat, aoi.lon, 1.002), [aoi.lat, aoi.lon]);

  // Track drag input
  useEffect(() => {
    if (isDragging) {
      const sensitivity = 0.005;
      rotY.current += dragDelta.x * sensitivity;
      rotX.current += dragDelta.y * sensitivity;
      // Clamp tilt so poles don't flip
      rotX.current = Math.max(-1.2, Math.min(1.2, rotX.current));
      velY.current = dragDelta.x * sensitivity;
      velX.current = dragDelta.y * sensitivity;
    }
  }, [isDragging, dragDelta]);

  // Animation frame loop
  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();
    marsMaterial.uniforms["uTime"]!.value = elapsed;

    // Handle rotation & inertia
    if (!isDragging) {
      rotY.current += velY.current;
      rotX.current += velX.current;
      rotX.current = Math.max(-1.2, Math.min(1.2, rotX.current));

      // Friction
      velY.current *= 0.94;
      velX.current *= 0.94;

      // Slow auto-rotation when idle
      if (autoRotate && Math.hypot(velX.current, velY.current) < 0.0005) {
        rotY.current += 0.06 * delta;
      }
    }

    if (globeGroupRef.current) {
      globeGroupRef.current.rotation.x = rotX.current;
      globeGroupRef.current.rotation.y = rotY.current;
    }

    // Fly-in camera animation towards AOI
    if (flyIn && !flyCompleteRef.current) {
      if (prefersReducedMotion) {
        flyProgress.current = 1.0;
        flyCompleteRef.current = true;
        onFlyInComplete?.();
        return;
      }

      flyProgress.current += delta / 2.5; // ~2.5 seconds
      const t = Math.min(1.0, flyProgress.current);
      // Smooth ease-in-out cubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Starting camera pose: [0, 0, 3.2], looking at origin
      const startPos = new Vector3(0, 0, 3.2);

      // Target camera pose: positioned close to AOI in world space
      // Convert local AOI position to current world rotation of globe
      const aoiLocal = new Vector3(aoiVec.x, aoiVec.y, aoiVec.z);
      const aoiWorld = aoiLocal.clone();
      if (globeGroupRef.current) {
        aoiWorld.applyEuler(globeGroupRef.current.rotation);
      }

      // Camera flies to 1.15 radius above AOI
      const targetPos = aoiWorld.clone().multiplyScalar(1.18);
      camera.position.lerpVectors(startPos, targetPos, eased);
      camera.lookAt(aoiWorld);

      if (t >= 1.0) {
        flyCompleteRef.current = true;
        onFlyInComplete?.();
      }
    } else if (!flyIn) {
      flyProgress.current = 0;
      flyCompleteRef.current = false;
    }
  });

  return (
    <>
      {/* Lights */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 2, 4]} intensity={1.6} />

      {/* Main rotating globe group */}
      <group ref={globeGroupRef}>
        {/* Mars Planet Surface */}
        <mesh geometry={sphereGeo} material={marsMaterial} />

        {/* Atmosphere Rim Glow */}
        <mesh geometry={atmosGeo} material={atmosphereMaterial} />

        {/* AOI Marker */}
        <group position={[aoiVec.x, aoiVec.y, aoiVec.z]}>
          {/* Surface ring */}
          <mesh>
            <ringGeometry args={[0.015, 0.025, 32]} />
            <meshBasicMaterial color="#56B4E9" side={DoubleSide} transparent opacity={0.9} />
          </mesh>
          {/* Vertical beacon pin */}
          <mesh position={[0, 0, 0.02]}>
            <cylinderGeometry args={[0.003, 0.003, 0.04, 16]} />
            <meshBasicMaterial color="#56B4E9" />
          </mesh>
        </group>

        {/* Orbiters and Orbital Tracks */}
        {showOrbiters && (
          <group>
            {orbiterTracks.map(({ orbiter, geom }) => (
              <OrbiterItem key={orbiter.id} orbiter={orbiter} geom={geom} />
            ))}
          </group>
        )}
      </group>
    </>
  );
}

/**
 * Individual orbiter track line and dynamic orbiter satellite sprite.
 */
function OrbiterItem({ orbiter, geom }: { orbiter: OrbiterDef; geom: BufferGeometry }) {
  const spriteRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!spriteRef.current) return;
    const t = state.clock.getElapsedTime();
    const pos = computeOrbiterPosition(orbiter, t);
    spriteRef.current.position.set(pos.x, pos.y, pos.z);
  });

  return (
    <group>
      {/* Orbit track line loop */}
      <lineLoop geometry={geom}>
        <lineBasicMaterial color={orbiter.color} transparent opacity={0.32} />
      </lineLoop>

      {/* Dynamic moving satellite marker */}
      <mesh ref={spriteRef}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial color={orbiter.color} />
      </mesh>
    </group>
  );
}

/**
 * Exported MarsGlobe component.
 */
export function MarsGlobe({
  interactive = true,
  autoRotate = true,
  showOrbiters = true,
  aoi = { lat: -4.72, lon: 137.4 }, // Gale Crater
  onFlyInComplete,
  flyIn = false,
  textureUrl,
  className,
  style,
}: MarsGlobeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const prevPointer = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      setIsDragging(true);
      prevPointer.current = { x: e.clientX, y: e.clientY };
      setDragDelta({ x: 0, y: 0 });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [interactive]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !interactive) return;
      const dx = e.clientX - prevPointer.current.x;
      const dy = e.clientY - prevPointer.current.y;
      prevPointer.current = { x: e.clientX, y: e.clientY };
      setDragDelta({ x: dx, y: dy });
    },
    [isDragging, interactive]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    setDragDelta({ x: 0, y: 0 });
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 320,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0B0F14",
        touchAction: "none",
        cursor: interactive ? (isDragging ? "grabbing" : "grab") : "default",
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="region"
      aria-label="Interactive 3D Mars Globe"
    >
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 42, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: "100%", height: "100%" }}
      >
        <GlobeScene
          interactive={interactive}
          autoRotate={autoRotate}
          showOrbiters={showOrbiters}
          aoi={aoi}
          flyIn={flyIn}
          onFlyInComplete={onFlyInComplete}
          textureUrl={textureUrl}
          isDragging={isDragging}
          dragDelta={dragDelta}
        />
      </Canvas>

      {/* Subtle overlay badge indicating placeholder procedural texture */}
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
          background: "rgba(11, 15, 20, 0.78)",
          backdropFilter: "blur(6px)",
          padding: "5px 10px",
          borderRadius: 4,
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <span>
          {textureUrl ? "GLOBAL MOSAIC" : "PROCEDURAL SHADING (placeholder texture)"}
        </span>
        {showOrbiters && (
          <span style={{ color: "#E69F00" }}>
            ORBITERS: APPROXIMATE
          </span>
        )}
      </div>

      {/* AOI Indicator label */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          pointerEvents: "none",
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
          color: "#E6EDF3",
          background: "rgba(18, 24, 33, 0.8)",
          backdropFilter: "blur(6px)",
          padding: "4px 10px",
          borderRadius: 4,
          border: "1px solid rgba(86, 180, 233, 0.3)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            backgroundColor: "#56B4E9",
            display: "inline-block",
          }}
        />
        <span>AOI: Gale Crater ({aoi.lat.toFixed(2)}°, {aoi.lon.toFixed(2)}°)</span>
      </div>
    </div>
  );
}
