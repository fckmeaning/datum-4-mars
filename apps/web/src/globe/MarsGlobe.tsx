/**
 * MarsGlobe.tsx - Interactive 3D Mars globe with procedural shading, global mosaic texture,
 * atmosphere rim glow, landing site labels (Gale open, others Phase 2), continuous zoom with ALT readout,
 * dynamic orbiter sprites and trails from /api/v1/orbiters/states, and cinematic fly-in camera animation.
 * 
 * Used for:
 * 1. Start-menu background (rotates with pointer/touch and slow idle auto-rotation).
 * 2. Globe mode (/globe).
 * 3. Cinematic fly-in transition from space to Gale Crater AOI.
 */

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { disposeTexture, loadBitmapTexture, whenIdle } from "./bitmapTexture";
import { AdaptiveDpr } from "../app/AdaptiveDpr";
import {
  Vector3,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  RingGeometry,
  CylinderGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  BackSide,
  DoubleSide,
  AdditiveBlending,
  LinearMipmapLinearFilter,
  TextureLoader,
  Texture,
  Group,
  Mesh,
  LineLoop,
  LineBasicMaterial,
  MeshBasicMaterial,
  type PerspectiveCamera,
} from "three";
import { EXPLORATION_ZONES, ZONE_RADIUS_KM, ringPoints } from "./zones";
import { OVERLAY_IDS, OVERLAY_TEXTURE_URL, type OverlayId } from "./globeLayers";
import { formatLatLon } from "./coords";
import { estimateLabelWidth, hideOverlapping } from "./labelLayout";
import {
  latLonToVector3,
  vector3ToLatLon,
  generateOrbitTrackPoints,
  DEFAULT_ORBITERS,
  interpolateOrbiterState,
  ORBITER_METADATA,
  type OrbiterDef,
  type OrbiterApiState,
} from "./orbit";
import {
  DEFAULT_LANDING_SITES,
  loadLandingSites,
  isSiteVisible,
  type LandingSite,
} from "./landingSites";
import {
  MARS_RADIUS_KM,
  MIN_CAMERA_DIST,
  MAX_CAMERA_DIST,
  DEFAULT_CAMERA_DIST,
  radiusToAltitudeKm,
  formatAltitude,
} from "./altitude";
import {
  ATMOSPHERE_SHELL_RADIUS,
  GLOBE_FOV_DEG,
  SHELL_CLEARANCE,
  applyZoomStep,
  setActiveTextureWidth,
  atmosphereFade,
  clampFreeDistance,
  flyInPose,
  freeCameraPose,
  minFreeZoomDistance,
} from "./cameraSafety";
import { descentPoseRef, globeStateRef, type PoseRef } from "./scriptedPose";
import {
  DECK_ROTATE_FACTOR,
  FRAMING_SECONDS,
  arcDuration,
  arcStep,
  deckDistance,
  easeInOutCubic,
  framedDistance,
  pulseEnvelope,
} from "./globeMotion";
import { accentColor } from "../app/accent";
import { apiFetch } from "../static/apiFetch";

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
   * Whether to display orbiters and their trajectories (default: true).
   */
  showOrbiters?: boolean;
  /** Camera script from a director (default: the shared descent pose ref, see scriptedPose.ts). */
  scriptedPose?: PoseRef;
  /** Draw the orbit ellipses (off by default: satellites are shown as moving markers without the track lines). */
  showOrbitTracks?: boolean;
  /**
   * Area of Interest coordinates (defaults to Gale Crater: lat: -4.5895, lon: 137.4417).
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
   * Optional custom URL for global Mars mosaic texture (falls back to /data/globe/mars_color_4k.jpg or procedural).
   */
  textureUrl?: string;
  /**
   * Optional custom landing sites array.
   */
  landingSites?: LandingSite[];
  /**
   * Optional external orbiter states (overrides /api/v1/orbiters/states polling).
   */
  orbiters?: OrbiterApiState[];
  /**
   * Callback reporting camera altitude in kilometers above the Martian surface.
   */
  onAltitude?: (altitudeKm: number) => void;
  /** Called when the user clicks (not drags) the planet surface; lat/lon planetocentric, east-positive. */
  onPick?: (point: { lat: number; lon: number }) => void;
  /** A point to mark on the surface (e.g. the last picked one). */
  pickedPoint?: { lat: number; lon: number } | null;
  /** Opacity 0..1 of each global data layer; a layer's texture is fetched the first time its opacity is above 0. */
  overlays?: Partial<Record<OverlayId, number>>;
  /** 0 = geologic map overlay hidden, up to 1 = fully blended over the mosaic. */
  geologyOpacity?: number;
  /** Draw NASA's proposed human Exploration Zones (100 km rings). */
  showZones?: boolean;
  /** Lat/lon under the cursor while it moves over the planet; null when it leaves the surface. */
  onHover?: (point: { lat: number; lon: number } | null) => void;
  /** A landing-site label on the globe was clicked. */
  onSiteSelect?: (siteId: string) => void;
  /** The site shown as selected (accent border on its label). */
  selectedSiteId?: string | null;
  /** The point of the surface straight below the camera (the centre of the view), about 5 times a second. */
  onViewCenter?: (c: { lat: number; lon: number }) => void;
  /** Turn the globe to face this point; a new `nonce` re-triggers the move for the same point. */
  focusPoint?: { lat: number; lon: number; nonce: number } | null;
  /**
   * Camera framing: "idle" (default) fills the view; "deck" eases (~700 ms) the planet to a smaller size in the centre,
   * so it fits whole between a top and a bottom panel (about 22 % of the height each), and slows the auto-rotation.
   */
  framing?: "idle" | "deck";
  /** A click (not a drag) on empty planet surface: not on a site label, not on the picked-point marker. */
  onPlanetClick?: () => void;
  /**
   * Current simulation time in UTC (ISO 8601 string).
   */
  utc?: string;
  /**
   * Custom style overrides for the container.
   */
  className?: string;
  style?: React.CSSProperties;
}

const Z_AXIS = new Vector3(0, 0, 1);

// Procedural Mars Shader with Equirectangular UV remapping
const marsVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vObj;

  void main() {
    vUv = uv;
    vObj = normalize(position);
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const OVERLAY_GLSL_DECL = OVERLAY_IDS.map((_, i) => `  uniform sampler2D uOv${i};\n  uniform float wOv${i};`).join("\n");
const OVERLAY_GLSL_USE = OVERLAY_IDS.map(
  (_, i) =>
    `    if (wOv${i} > 0.0) {\n      vec3 o${i} = texture2D(uOv${i}, texUv).rgb;\n      float l${i} = dot(col, vec3(0.299, 0.587, 0.114));\n      col = mix(col, o${i} * (0.45 + 1.1 * l${i}), wOv${i} * 0.85);\n    }`,
).join("\n");

const marsFragmentShader = `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform sampler2D uTexture;
  uniform float uUseTexture;
  uniform sampler2D uGeo;
  uniform float uGeoW;
${OVERLAY_GLSL_DECL}

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vObj;

  // 3-D value noise: sampled on the sphere itself, so there is no pinching or streaking at the poles
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 6; i++) {
      v += a * noise3(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }

  // Procedural noise for Mars terrain synthesis (2-D variant kept for reference)
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
    // Remap SphereGeometry UV so that equirectangular texture [0, 1] aligns with [-180, 180] longitude
    // In Three.js SphereGeometry: u=0.25 is lon=0. In equirectangular: u=0.50 is lon=0.
    // Therefore u_tex = fract(vUv.x + 0.25);
    vec2 texUv = vec2(fract(vUv.x + 0.25), vUv.y);

    vec3 col;
    if (uUseTexture > 0.5) {
      col = texture2D(uTexture, texUv).rgb;
    } else {
      // sin(latitude): 0 at the equator, 1 at the poles
      float sinLat = abs(vObj.y);

      // Large albedo provinces plus finer mottling, both on the sphere (no UV seams or polar streaks)
      float n1 = fbm3(vObj * 2.6);
      float n2 = fbm3(vObj * 9.0 + 4.0);
      float detail = mix(n1, n2, 0.35);

      // Mars Color Palette
      vec3 rustOchre   = vec3(0.74, 0.36, 0.20); // Martian dust / highlands
      vec3 darkBasalt  = vec3(0.24, 0.17, 0.14); // Dark volcanic lowlands
      vec3 sandOrange  = vec3(0.85, 0.51, 0.28); // Bright desert sands
      vec3 polarIce    = vec3(0.80, 0.78, 0.76); // dusty CO2/water-ice caps, not pure white

      vec3 surface = mix(darkBasalt, rustOchre, smoothstep(0.36, 0.64, detail));
      surface = mix(surface, sandOrange, smoothstep(0.64, 0.86, detail));

      // Polar ice caps
      float capMask = smoothstep(0.972, 0.988, sinLat + (detail - 0.5) * 0.02); // caps only poleward of about 77 deg
      surface = mix(surface, polarIce, capMask);

      col = surface;
    }

    // Geologic map overlay: unit colours multiplied into the mosaic so relief stays readable
    if (uGeoW > 0.0) {
      vec3 g = texture2D(uGeo, texUv).rgb;
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, g * (0.45 + 1.1 * luma), uGeoW * 0.85);
    }

    // Data layers (topography colour, thermal, slope, radiation, pressure, hazard)
${OVERLAY_GLSL_USE}

    // Directional Sun lighting with soft ambient and terminator
    vec3 sunDir = normalize(uSunDir);
    // soft terminator (wrapped diffuse) and a high ambient floor so the night side keeps its terrain visible
    float NdotL = smoothstep(-0.30, 1.0, dot(vNormal, sunDir));
    float ambient = 0.30;
    float light = ambient + (1.0 - ambient) * NdotL;
    col = pow(col, vec3(0.88)) * 1.12; // lift mid-tones: the mosaic is dark and low contrast

    // twilight: the dark side leans cool and the lit side keeps its own colour, so the terminator reads as a soft gradient
    col *= mix(vec3(0.78, 0.88, 1.12), vec3(1.0), smoothstep(0.0, 0.55, NdotL));
    // limb: fresnel on the planet's own edge, lit warm by the sun side and a faint cool rim elsewhere
    vec3 nW = normalize(vWorldPosition);
    vec3 vW = normalize(cameraPosition - vWorldPosition);
    float fres = pow(1.0 - clamp(dot(nW, vW), 0.0, 1.0), 3.2);
    float sunSide = smoothstep(-0.25, 0.65, dot(nW, sunDir));
    vec3 limb = fres * (vec3(1.0, 0.66, 0.46) * sunSide * 0.42 + vec3(0.42, 0.62, 0.95) * 0.12);

    gl_FragColor = vec4(col * light + limb, 1.0);
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
  uniform float uFade; // 0 when the camera is inside the shell (no milky overlay, ever), 1 outside
  uniform float uGlow; // director-controlled strength of the limb glow
  uniform float uWarm; // 0..1: shifts the glow towards dust colour during atmospheric entry
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    // Rendered on the BACK faces of a shell slightly larger than the planet: n . v is negative there, 0 at the shell's
    // silhouette (glow fades to nothing) and most negative towards the planet's limb. The disc itself stays clean.
    vec3 n = normalize(vNormal);
    float t = clamp(-dot(n, normalize(vViewPosition)), 0.0, 1.0);
    float x = smoothstep(0.0, 0.37, t);
    // two layers: a wide soft halo and a thin bright line hugging the planet
    float halo = pow(x, 4.2);
    float line = pow(x, 12.0);
    // the sun side carries the light, the night limb keeps only a trace
    float sun = mix(0.16, 1.0, smoothstep(-0.35, 0.7, dot(n, normalize(uSunDir))));

    vec3 dust = vec3(0.95, 0.62, 0.40); // butterscotch dust near the limb
    vec3 sky  = vec3(0.40, 0.58, 0.92); // blue scattering at the outer edge, as in Mars sunsets
    vec3 col = mix(sky, dust, smoothstep(0.15, 0.95, x));
    col = mix(col, dust * 1.1, uWarm * 0.55);

    float a = (halo * 0.26 + line * 0.55) * sun * uGlow * uFade;
    gl_FragColor = vec4(col, a);
  }
`;

/**
 * Starfield: ~1600 fixed points on a far sphere, each with its own size, tint and brightness. One draw call, no per-frame work.
 * Sizes are in device pixels (times the pixel ratio) so the stars stay small and crisp on every display.
 */
const starVertexShader = `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPx;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_PointSize = aSize * uPx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const starFragmentShader = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d);
    gl_FragColor = vec4(vColor, a);
  }
`;

function Starfield() {
  const { gl } = useThree();
  const geo = useMemo(() => {
    let seed = 20261114;
    const rnd = () => {
      // small deterministic generator, so the sky is the same on every load
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const n = 1600;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const z = rnd() * 2 - 1;
      const phi = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      pos[i * 3] = Math.cos(phi) * r * 30;
      pos[i * 3 + 1] = z * 30;
      pos[i * 3 + 2] = Math.sin(phi) * r * 30;
      const bright = Math.pow(rnd(), 3.2);
      size[i] = 1.5 + bright * 2.6;
      const tint = rnd();
      const k = 0.5 + bright * 0.5;
      // mostly cool white, a few blue and a few warm
      col[i * 3] = k * (tint < 0.15 ? 1.0 : tint < 0.35 ? 0.72 : 0.92);
      col[i * 3 + 1] = k * (tint < 0.15 ? 0.82 : tint < 0.35 ? 0.84 : 0.95);
      col[i * 3 + 2] = k * (tint < 0.15 ? 0.66 : tint < 0.35 ? 1.0 : 1.0);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("aSize", new Float32BufferAttribute(size, 1));
    g.setAttribute("aColor", new Float32BufferAttribute(col, 3));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        uniforms: { uPx: { value: 1 } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  mat.uniforms["uPx"]!.value = gl.getPixelRatio();
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-1} />;
}

/**
 * Props for the inner Three.js globe scene component.
 */
interface GlobeSceneProps {
  autoRotate: boolean;
  showOrbiters: boolean;
  showOrbitTracks: boolean;
  aoi: { lat: number; lon: number };
  flyIn: boolean;
  onFlyInComplete?: () => void;
  texture: Texture | null;
  landingSites: LandingSite[];
  orbiters: OrbiterApiState[];
  isDragging: boolean;
  dragDelta: { x: number; y: number };
  targetDistance: number;
  /** Camera script written by a director (src/cinematic); null = normal interactive camera. */
  scriptedPose: PoseRef;
  onAltitude?: (altitudeKm: number) => void;
  onPick?: (point: { lat: number; lon: number }) => void;
  pickedPoint?: { lat: number; lon: number } | null;
  geoTexture: Texture | null;
  geologyOpacity: number;
  overlayTextures: Partial<Record<OverlayId, Texture>>;
  overlayOpacity: Partial<Record<OverlayId, number>>;
  showZones: boolean;
  onHover?: (point: { lat: number; lon: number } | null) => void;
  focusPoint?: { lat: number; lon: number; nonce: number; arc?: boolean } | null;
  framing: "idle" | "deck";
  onPlanetClick?: () => void;
  onViewCenter?: (c: { lat: number; lon: number }) => void;
  onUpdateLabels?: (
    siteProjections: Array<{ site: LandingSite; screenX: number; screenY: number; visible: boolean }>,
    orbiterProjections: Array<{ orbiter: OrbiterApiState; name: string; screenX: number; screenY: number; visible: boolean }>
  ) => void;
}

function GlobeScene({
  autoRotate,
  showOrbiters,
  showOrbitTracks,
  aoi,
  flyIn,
  onFlyInComplete,
  texture,
  landingSites,
  orbiters,
  isDragging,
  dragDelta,
  targetDistance,
  scriptedPose,
  onAltitude,
  onPick,
  pickedPoint,
  geoTexture,
  geologyOpacity,
  overlayTextures,
  overlayOpacity,
  showZones,
  onHover,
  focusPoint,
  framing,
  onPlanetClick,
  onViewCenter,
  onUpdateLabels,
}: GlobeSceneProps) {
  const { camera, size, gl } = useThree();
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const lastCenterT = useRef(-1);
  const lastHover = useRef<{ lat: number; lon: number } | null>(null);
  // Check user preference for reduced motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  }, []);
  // turn-to-face request: the globe eases its rotation to (rotX = lat, rotY = -lon), then holds until the user drags.
  // `arc` set: a timed curved move with a slight tilt and a soft landing; otherwise the quick exponential follow (wheel zoom-to-cursor)
  const focusTarget = useRef<{ x: number; y: number } | null>(null);
  const focusArc = useRef<{ fromX: number; fromY: number; dx: number; dy: number; span: number; dur: number; t: number } | null>(null);
  const arcLift = useRef(0);
  const arcRoll = useRef(0);
  const holdFocus = useRef(false);
  const rotX = useRef(0.12);
  const rotY = useRef(0.0);
  useEffect(() => {
    if (!focusPoint) return;
    const tx = (focusPoint.lat * Math.PI) / 180;
    const ty = (-focusPoint.lon * Math.PI) / 180;
    focusTarget.current = { x: tx, y: ty };
    holdFocus.current = true;
    focusArc.current = null;
    if (focusPoint.arc && !prefersReducedMotion) {
      const twoPi = Math.PI * 2;
      let dy = (ty - rotY.current) % twoPi;
      if (dy > Math.PI) dy -= twoPi;
      if (dy < -Math.PI) dy += twoPi;
      const dx = Math.max(-1.2, Math.min(1.2, tx)) - rotX.current;
      const span = Math.hypot(dx, dy);
      if (span > 0.01) {
        focusArc.current = { fromX: rotX.current, fromY: rotY.current, dx, dy, span, dur: arcDuration(span), t: 0 };
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.nonce]);

  // deck framing: 0 = idle, 1 = deck, eased over FRAMING_SECONDS from wherever it currently is (no jump on a mid-flight change)
  const framingTarget = framing === "deck" ? 1 : 0;
  const framingVal = useRef(framingTarget);
  const framingAnim = useRef({ from: framingTarget, to: framingTarget, t: 1 });
  useEffect(() => {
    framingAnim.current = { from: framingVal.current, to: framingTarget, t: prefersReducedMotion ? 1 : 0 };
  }, [framingTarget, prefersReducedMotion]);

  // click pulse: two expanding rings on the surface where the planet was clicked
  const pulseGroupRef = useRef<Group>(null);
  const pulseMeshes = useRef<Array<Mesh | null>>([null, null]);
  const pulseT = useRef(-1);
  const pulseGeo = useMemo(() => new RingGeometry(0.9, 1.0, 64), []);
  const pulseMats = useMemo(
    () =>
      [0, 1].map(
        () =>
          new MeshBasicMaterial({
            color: "#8fe3ff",
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            side: DoubleSide,
            depthWrite: false,
          }),
      ),
    [],
  );
  useEffect(
    () => () => {
      pulseGeo.dispose();
      pulseMats.forEach((m) => m.dispose());
    },
    [pulseGeo, pulseMats],
  );
  const startPulse = (local: { x: number; y: number; z: number }) => {
    if (prefersReducedMotion || !pulseGroupRef.current) return;
    const n = new Vector3(local.x, local.y, local.z).normalize();
    pulseGroupRef.current.position.copy(n).multiplyScalar(1.004);
    pulseGroupRef.current.quaternion.setFromUnitVectors(Z_AXIS, n);
    pulseT.current = 0;
  };
  const pickedVec = useMemo(
    () => (pickedPoint ? latLonToVector3(pickedPoint.lat, pickedPoint.lon, 1.003) : null),
    [pickedPoint]
  );
  const galeRingRef = useRef<Mesh>(null);
  const globeGroupRef = useRef<Group>(null);
  const velX = useRef(0.0);
  const velY = useRef(0.0);
  const currentDistance = useRef(DEFAULT_CAMERA_DIST);
  const flyProgress = useRef(0);
  const flyCompleteRef = useRef(false);

  // Shared geometry
  const sphereGeo = useMemo(() => new SphereGeometry(1.0, 64, 64), []);
  const atmosGeo = useMemo(() => new SphereGeometry(ATMOSPHERE_SHELL_RADIUS, 96, 96), []);

  // Marker geometries
  const galeRingGeo = useMemo(() => new RingGeometry(0.015, 0.025, 32), []);
  const galePinGeo = useMemo(() => new CylinderGeometry(0.003, 0.003, 0.04, 16), []);
  const lockedRingGeo = useMemo(() => new RingGeometry(0.008, 0.014, 24), []);

  // Materials
  const marsMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: marsVertexShader,
      fragmentShader: marsFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new Vector3(1.2, 0.4, 0.8).normalize() },
        uTexture: { value: null },
        uUseTexture: { value: 0.0 },
        uGeo: { value: null },
        uGeoW: { value: 0.0 },
        ...Object.fromEntries(OVERLAY_IDS.flatMap((_, i) => [[`uOv${i}`, { value: null }], [`wOv${i}`, { value: 0.0 }]])),
      },
    });
  }, []);

  useEffect(() => {
    OVERLAY_IDS.forEach((id, i) => {
      const tex = overlayTextures[id] ?? null;
      marsMaterial.uniforms[`uOv${i}`]!.value = tex;
      marsMaterial.uniforms[`wOv${i}`]!.value = tex ? Math.max(0, Math.min(1, overlayOpacity[id] ?? 0)) : 0;
    });
  }, [overlayTextures, overlayOpacity, marsMaterial]);

  useEffect(() => {
    marsMaterial.uniforms["uGeo"]!.value = geoTexture;
    marsMaterial.uniforms["uGeoW"]!.value = geoTexture ? Math.max(0, Math.min(1, geologyOpacity)) : 0;
  }, [geoTexture, geologyOpacity, marsMaterial]);

  const atmosphereMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: { uFade: { value: 1.0 }, uGlow: { value: 1.0 }, uWarm: { value: 0.0 }, uSunDir: { value: new Vector3(1.2, 0.4, 0.8).normalize() } },
      transparent: true,
      blending: AdditiveBlending,
      side: BackSide,
      depthWrite: false,
    });
  }, []);

  useEffect(() => {
    if (texture) {
      // sharpness: mipmaps and anisotropic filtering remove the shimmer and the smear at grazing angles
      texture.generateMipmaps = true;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
      rendererMaxTexture = gl.capabilities.maxTextureSize;
      texture.needsUpdate = true;
      marsMaterial.uniforms["uTexture"]!.value = texture;
      marsMaterial.uniforms["uUseTexture"]!.value = 1.0;
    } else {
      marsMaterial.uniforms["uTexture"]!.value = null;
      marsMaterial.uniforms["uUseTexture"]!.value = 0.0;
    }
    marsMaterial.needsUpdate = true;
  }, [texture, marsMaterial, gl]);

  // Exploration Zones: one LineSegments geometry holding all 100 km rings
  const zoneGeo = useMemo(() => {
    const verts: number[] = [];
    for (const z of EXPLORATION_ZONES) {
      const pts = ringPoints(z.lat, z.lon, ZONE_RADIUS_KM, 64, 1.003);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(verts, 3));
    return g;
  }, []);
  useEffect(() => () => zoneGeo.dispose(), [zoneGeo]);

  // Orbiters and tracks
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
      galeRingGeo.dispose();
      galePinGeo.dispose();
      lockedRingGeo.dispose();
      marsMaterial.dispose();
      atmosphereMaterial.dispose();
      for (const t of orbiterTracks) {
        t.geom.dispose();
      }
    };
  }, [
    sphereGeo,
    atmosGeo,
    galeRingGeo,
    galePinGeo,
    lockedRingGeo,
    marsMaterial,
    atmosphereMaterial,
    orbiterTracks,
  ]);

  // Precomputed site 3D vectors in globe coordinates
  const siteVectors = useMemo(() => {
    return landingSites.map((site) => ({
      site,
      vec: latLonToVector3(site.lat, site.lon, 1.002),
    }));
  }, [landingSites]);

  // AOI 3D coordinates on sphere
  const aoiVec = useMemo(
    () => latLonToVector3(aoi.lat, aoi.lon, 1.002),
    [aoi.lat, aoi.lon]
  );

  // Track drag input
  useEffect(() => {
    if (isDragging) {
      holdFocus.current = false;
      focusTarget.current = null;
      const sensitivity = 0.005;
      rotY.current += dragDelta.x * sensitivity;
      rotX.current += dragDelta.y * sensitivity;
      rotX.current = Math.max(-1.2, Math.min(1.2, rotX.current));
      velY.current = dragDelta.x * sensitivity;
      velX.current = dragDelta.y * sensitivity;
    }
  }, [isDragging, dragDelta]);

  // Animation frame loop
  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();
    marsMaterial.uniforms["uTime"]!.value = elapsed;

    // deck framing progress
    const fa = framingAnim.current;
    if (fa.t < 1) fa.t = Math.min(1, fa.t + delta / FRAMING_SECONDS);
    framingVal.current = fa.from + (fa.to - fa.from) * easeInOutCubic(fa.t);
    const fv = framingVal.current;

    // Click pulse rings
    if (pulseT.current >= 0) {
      pulseT.current += delta;
      const pulseDone = [0, 1].map((i) => {
        const env = pulseEnvelope(pulseT.current - i * 0.16);
        const mesh = pulseMeshes.current[i];
        const started = pulseT.current - i * 0.16 >= 0;
        if (mesh) {
          mesh.visible = started && !env.done;
          mesh.scale.setScalar(0.012 + env.radius * 0.1);
        }
        pulseMats[i]!.opacity = started ? env.opacity * 0.85 : 0;
        return env.done;
      });
      if (pulseDone[1]) pulseT.current = -1;
    }

    // Turn-to-face with an arc (site chosen from a list): timed, curved, tilted, eased landing
    const arc = focusArc.current;
    arcLift.current = 0;
    arcRoll.current = 0;
    if (arc && !isDragging) {
      arc.t += delta / arc.dur;
      const u = Math.min(1, arc.t);
      const s = arcStep(u, arc.span);
      const m = arc.span || 1;
      rotY.current = arc.fromY + arc.dy * s.e + (-arc.dx / m) * s.bulge;
      rotX.current = Math.max(-1.2, Math.min(1.2, arc.fromX + arc.dx * s.e + (arc.dy / m) * s.bulge));
      velX.current = 0;
      velY.current = 0;
      arcLift.current = s.lift;
      arcRoll.current = s.roll * (arc.dy >= 0 ? 1 : -1);
      if (u >= 1) {
        focusArc.current = null;
        focusTarget.current = null;
      }
    } else if (arc && isDragging) {
      focusArc.current = null;
    }

    // Turn-to-face request (clicking a site): shortest way round, ease out, no inertia fighting it
    if (focusTarget.current && !isDragging && !focusArc.current) {
      const t = focusTarget.current;
      const twoPi = Math.PI * 2;
      let dy = (t.y - rotY.current) % twoPi;
      if (dy > Math.PI) dy -= twoPi;
      if (dy < -Math.PI) dy += twoPi;
      const dx = Math.max(-1.2, Math.min(1.2, t.x)) - rotX.current;
      const k = 1 - Math.exp(-5 * delta);
      rotY.current += dy * k;
      rotX.current += dx * k;
      velX.current = 0;
      velY.current = 0;
      if (Math.abs(dy) < 0.002 && Math.abs(dx) < 0.002) focusTarget.current = null;
    }

    // Handle rotation & inertia
    if (!isDragging) {
      rotY.current += velY.current;
      rotX.current += velX.current;
      rotX.current = Math.max(-1.2, Math.min(1.2, rotX.current));

      // Friction
      velY.current *= 0.94;
      velX.current *= 0.94;

      // Slow auto-rotation when idle
      if (autoRotate && !holdFocus.current && Math.hypot(velX.current, velY.current) < 0.0005) {
        rotY.current += 0.06 * (1 - (1 - DECK_ROTATE_FACTOR) * fv) * delta;
      }
    }

    if (globeGroupRef.current) {
      globeGroupRef.current.rotation.x = rotX.current;
      globeGroupRef.current.rotation.y = rotY.current;
    }

    // ---- Camera. Every branch works on the sphere (slerp of the direction + a scalar distance) and is clamped by
    // minRadius, so no path can end up inside Mars or inside the atmosphere shell (see cameraSafety.ts for the root cause).
    const minRadius = ATMOSPHERE_SHELL_RADIUS + SHELL_CLEARANCE;
    const minFree = minFreeZoomDistance({ viewportHeightPx: size.height });
    const persp = camera as PerspectiveCamera;
    const setProjection = (fov: number, near: number, far: number) => {
      if (Math.abs(persp.fov - fov) > 1e-4 || Math.abs(persp.near - near) > near * 1e-3 || Math.abs(persp.far - far) > 1e-3) {
        persp.fov = fov;
        persp.near = near;
        persp.far = far;
        persp.updateProjectionMatrix();
      }
    };
    const aoiWorldVec = () => {
      const v = new Vector3(aoiVec.x, aoiVec.y, aoiVec.z);
      if (globeGroupRef.current) v.applyEuler(globeGroupRef.current.rotation);
      return v;
    };
    const atmosphereUniforms = atmosphereMaterial.uniforms as Record<string, { value: number }>;

    const script = scriptedPose.current;
    if (script) {
      // Scripted descent: the director owns the camera, the planet orientation and the atmosphere
      rotX.current = script.planetRotation.x;
      rotY.current = script.planetRotation.y;
      velX.current = 0;
      velY.current = 0;
      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.x = rotX.current;
        globeGroupRef.current.rotation.y = rotY.current;
      }
      camera.position.set(script.position[0], script.position[1], script.position[2]);
      camera.up.set(script.up[0], script.up[1], script.up[2]);
      camera.lookAt(script.target[0], script.target[1], script.target[2]);
      const r = camera.position.length();
      // near/far follow the altitude: with a fixed near plane of 0.1 the surface would be clipped below 340 km
      setProjection(script.fovDeg, Math.max(1e-5, Math.min(0.1, (r - 1) * 0.2)), r + 2.5);
      currentDistance.current = r;
      onAltitude?.(radiusToAltitudeKm(r));
      atmosphereUniforms["uGlow"]!.value = script.atmosphereGlow;
      atmosphereUniforms["uWarm"]!.value = script.atmosphereWarm;
      atmosphereUniforms["uFade"]!.value = atmosphereFade(r);
      galeRingRef.current?.scale.setScalar(1 + 1.6 * Math.sin(Math.max(0, Math.min(1, script.aoiPulse)) * Math.PI));
      flyCompleteRef.current = false;
    } else {
      galeRingRef.current?.scale.setScalar(1);
      // soft "breathing" of the limb glow, a brief swell on a click and a touch more in deck mode
      const kick = pulseT.current >= 0 ? Math.sin(Math.PI * Math.min(1, pulseT.current / 0.9)) * 0.3 : 0;
      atmosphereUniforms["uGlow"]!.value = prefersReducedMotion ? 1.0 : 1.0 + 0.07 * Math.sin(elapsed * 1.1) + 0.1 * fv + kick;
      atmosphereUniforms["uWarm"]!.value = 0.0;
      if (!flyIn) {
        camera.up.set(Math.sin(arcRoll.current), Math.cos(arcRoll.current), 0);
        setProjection(GLOBE_FOV_DEG, 0.1, 50);
        // zoom damping towards the (clamped) target; also re-clamps after a resize or when a script has just ended
        const target = clampFreeDistance(targetDistance, size.height, MAX_CAMERA_DIST);
        currentDistance.current += (target - currentDistance.current) * 0.12;
        currentDistance.current = clampFreeDistance(currentDistance.current, size.height, MAX_CAMERA_DIST);
        onAltitude?.(radiusToAltitudeKm(currentDistance.current));

        // As the camera zooms in it blends its direction from +Z towards Gale (on the sphere, never along a chord)
        const zoomFactor = Math.max(0, Math.min(1, (DEFAULT_CAMERA_DIST - currentDistance.current) / (DEFAULT_CAMERA_DIST - minFree)));
        // the view stays on +Z: zooming on a point is done by turning that point to the centre (see focusPoint)
        // deck framing and the arc's pull-back change only where the camera sits, never the zoom state itself
        const dDeck = deckDistance(GLOBE_FOV_DEG, size.width / Math.max(1, size.height));
        const shownDist = framedDistance(currentDistance.current, dDeck, fv, DEFAULT_CAMERA_DIST) * (1 + arcLift.current);
        const pose = freeCameraPose(shownDist, 0, [0, 0, 1], minRadius);
        camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
        camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
        flyProgress.current = 0;
        flyCompleteRef.current = false;
        // publish the free state for a descent director (see scriptedPose.ts)
        globeStateRef.current = { rotX: rotX.current, rotY: rotY.current, distance: currentDistance.current };
      } else if (!flyCompleteRef.current) {
        // Legacy fly-in (autopilot, reduced motion): slerp + eased radius, ends at MIN_CAMERA_DIST (611 km), above the shell
        camera.up.set(0, 1, 0);
        setProjection(GLOBE_FOV_DEG, 0.1, 50);
        const aoiWorld = aoiWorldVec();
        const aoiDir: [number, number, number] = [aoiWorld.x, aoiWorld.y, aoiWorld.z];
        if (prefersReducedMotion) {
          flyProgress.current = 1.0;
        } else {
          flyProgress.current += delta / 2.5; // ~2.5 seconds
        }
        const t = Math.min(1.0, flyProgress.current);
        const pose = flyInPose(t, aoiDir, DEFAULT_CAMERA_DIST, MIN_CAMERA_DIST, minRadius);
        currentDistance.current = pose.distance;
        onAltitude?.(radiusToAltitudeKm(pose.distance));
        camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
        camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
        if (t >= 1.0) {
          flyCompleteRef.current = true;
          onFlyInComplete?.();
        }
      }
      atmosphereUniforms["uFade"]!.value = atmosphereFade(camera.position.length());
    }

    // The point below the camera, so the top chip is never a constant
    if (onViewCenter && globeGroupRef.current && elapsed - lastCenterT.current > 0.2) {
      lastCenterT.current = elapsed;
      const local = globeGroupRef.current.worldToLocal(camera.position.clone());
      const ll = vector3ToLatLon({ x: local.x, y: local.y, z: local.z });
      onViewCenter({ lat: ll.lat, lon: ll.lon });
    }

    // Project site labels to screen space with limb culling
    if (onUpdateLabels && globeGroupRef.current) {
      const euler = globeGroupRef.current.rotation;
      const camPos = camera.position;

      const siteProjs = siteVectors.map(({ site, vec }) => {
        const worldPos = new Vector3(vec.x, vec.y, vec.z).applyEuler(euler);
        const visible = isSiteVisible(worldPos, camPos, 1.0, 0.08);

        if (!visible) {
          return { site, screenX: -9999, screenY: -9999, visible: false };
        }

        const projected = worldPos.clone().project(camera);
        const screenX = (projected.x * 0.5 + 0.5) * size.width;
        const screenY = (-projected.y * 0.5 + 0.5) * size.height;

        return {
          site,
          screenX,
          screenY,
          visible:
            projected.z < 1.0 &&
            screenX >= 0 &&
            screenX <= size.width &&
            screenY >= 0 &&
            screenY <= size.height,
        };
      });

      // Project orbiter labels if present
      const orbiterProjs = orbiters.map((orb) => {
        const altKm = orb.alt_m / 1000;
        const radius = 1.0 + altKm / MARS_RADIUS_KM;
        const localVec = latLonToVector3(orb.lat, orb.lon, radius);
        const worldPos = new Vector3(localVec.x, localVec.y, localVec.z).applyEuler(euler);

        const visible = isSiteVisible(worldPos, camPos, 1.0, 0.02);
        const meta = ORBITER_METADATA[orb.id.toLowerCase()];
        const name = meta?.name ?? orb.id.toUpperCase();

        if (!visible) {
          return { orbiter: orb, name, screenX: -9999, screenY: -9999, visible: false };
        }

        const projected = worldPos.clone().project(camera);
        const screenX = (projected.x * 0.5 + 0.5) * size.width;
        const screenY = (-projected.y * 0.5 + 0.5) * size.height;

        return {
          orbiter: orb,
          name,
          screenX,
          screenY,
          visible:
            projected.z < 1.0 &&
            screenX >= 0 &&
            screenX <= size.width &&
            screenY >= 0 &&
            screenY <= size.height,
        };
      });

      onUpdateLabels(siteProjs, orbiterProjs);
    }
  });

  return (
    <>
      <Starfield />

      {/* Lights */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 2, 4]} intensity={1.6} />

      {/* Main rotating globe group */}
      <group ref={globeGroupRef}>
        {/* Mars Planet Surface */}
        <mesh
          geometry={sphereGeo}
          material={marsMaterial}
          onPointerDown={(e) => {
            downPos.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
          }}
          onPointerMove={(e) => {
            if (!onHover || !globeGroupRef.current) return;
            const local = globeGroupRef.current.worldToLocal(e.point.clone());
            const p = vector3ToLatLon({ x: local.x, y: local.y, z: local.z });
            const last = lastHover.current;
            if (last && Math.abs(last.lat - p.lat) < 0.05 && Math.abs(last.lon - p.lon) < 0.05) return;
            lastHover.current = { lat: p.lat, lon: p.lon };
            onHover({ lat: p.lat, lon: p.lon });
          }}
          onPointerOut={() => {
            lastHover.current = null;
            onHover?.(null);
          }}
          onPointerUp={(e) => {
            // own click detection (R3F onClick needs the same hit on down and up, which a rotating globe breaks);
            // a release more than 5 px from the press ends a drag, not a pick
            const d = downPos.current;
            downPos.current = null;
            if ((!onPick && !onPlanetClick) || !d || !globeGroupRef.current) return;
            if (Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) > 5) return;
            e.stopPropagation();
            const local = globeGroupRef.current.worldToLocal(e.point.clone());
            const { lat, lon } = vector3ToLatLon({ x: local.x, y: local.y, z: local.z });
            startPulse(local);
            onPick?.({ lat, lon });
            // a click on the marker of the already picked point is not "empty space"
            const onMarker =
              pickedVec != null &&
              new Vector3(local.x, local.y, local.z).normalize().distanceTo(new Vector3(pickedVec.x, pickedVec.y, pickedVec.z).normalize()) < 0.04;
            if (!onMarker) onPlanetClick?.();
          }}
        />

        {/* Click pulse rings (hidden until a click) */}
        <group ref={pulseGroupRef}>
          {[0, 1].map((i) => (
            <mesh
              key={i}
              ref={(m) => {
                pulseMeshes.current[i] = m;
              }}
              geometry={pulseGeo}
              material={pulseMats[i]}
              visible={false}
              renderOrder={3}
            />
          ))}
        </group>

        {/* NASA Exploration Zones */}
        {showZones && (
          <lineSegments geometry={zoneGeo} renderOrder={2}>
            <lineBasicMaterial color={accentColor()} transparent opacity={0.9} depthWrite={false} />
          </lineSegments>
        )}

        {/* Picked point marker */}
        {pickedPoint && (
          <group position={pickedVec ? [pickedVec.x, pickedVec.y, pickedVec.z] : [0, 0, 0]}>
            <mesh>
              <sphereGeometry args={[0.012, 16, 16]} />
              <meshBasicMaterial color="#00E5FF" depthTest={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.024, 16, 16]} />
              <meshBasicMaterial color="#00E5FF" transparent opacity={0.25} depthTest={false} />
            </mesh>
          </group>
        )}

        {/* Atmosphere Rim Glow */}
        <mesh geometry={atmosGeo} material={atmosphereMaterial} />

        {/* Landing Sites 3D Surface Markers */}
        {siteVectors.map(({ site, vec }) => {
          const isGale = site.id === "gale";
          // Local +Z = outward surface normal, so rings lie tangent to the planet and the pin stands on it
          const normal = new Quaternion().setFromUnitVectors(Z_AXIS, new Vector3(vec.x, vec.y, vec.z).normalize());
          return (
            <group
              key={site.id}
              position={[vec.x, vec.y, vec.z]}
              quaternion={normal}
            >
              {isGale ? (
                <>
                  <mesh ref={galeRingRef} geometry={galeRingGeo}>
                    <meshBasicMaterial
                      color="#56B4E9"
                      side={DoubleSide}
                      transparent
                      opacity={0.9}
                    />
                  </mesh>
                  <mesh geometry={galePinGeo} position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
                    <meshBasicMaterial color="#56B4E9" />
                  </mesh>
                </>
              ) : (
                <mesh geometry={lockedRingGeo}>
                  <meshBasicMaterial
                    color="#8899A6"
                    side={DoubleSide}
                    transparent
                    opacity={0.5}
                  />
                </mesh>
              )}
            </group>
          );
        })}

        {/* Orbiters and Orbital Tracks: only drawn if list is not empty */}
        {showOrbiters && orbiters.length > 0 && (
          <group>
            {orbiters.map((orb) => {
              const meta = ORBITER_METADATA[orb.id.toLowerCase()];
              const color = meta?.color ?? "#56B4E9";
              const r = 1.0 + orb.alt_m / (MARS_RADIUS_KM * 1000);
              const pos = latLonToVector3(orb.lat, orb.lon, r);

              // Find matching default track for line loop
              const track = orbiterTracks.find((t) => t.orbiter.id === orb.id.toLowerCase());

              return (
                <group key={orb.id}>
                  {showOrbitTracks && track && (
                    <lineLoop geometry={track.geom}>
                      <lineBasicMaterial color={color} transparent opacity={0.32} />
                    </lineLoop>
                  )}
                  {/* Dynamic moving satellite marker */}
                  <mesh position={[pos.x, pos.y, pos.z]}>
                    <sphereGeometry args={[0.012, 16, 16]} />
                    <meshBasicMaterial color={color} />
                  </mesh>
                </group>
              );
            })}
          </group>
        )}
      </group>
    </>
  );
}

/** The globe's own renderer reports its texture limit here; asking it is free, a second WebGL context is not. */
let rendererMaxTexture = 0;
let probedMaxTexture = 0;

/** 8k mosaic needs a 8192 px texture and enough memory (about 180 MB of GPU memory); skip it on small devices. */
function canUse8kTexture(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) return false;
    if (window.matchMedia?.("(pointer: coarse)").matches) return false;
    let max = rendererMaxTexture || probedMaxTexture;
    if (!max) {
      // no renderer yet (tests, early call): one throw-away context, released at once so it does not count against the browser's limit
      const gl = document.createElement("canvas").getContext("webgl2") as WebGL2RenderingContext | null;
      max = Number(gl?.getParameter(gl.MAX_TEXTURE_SIZE));
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      if (Number.isFinite(max)) probedMaxTexture = max;
    }
    return Number.isFinite(max) && max >= 8192;
  } catch {
    return false;
  }
}

/**
 * Exported MarsGlobe component.
 */
export function MarsGlobe({
  interactive = true,
  autoRotate = true,
  showOrbiters = true,
  showOrbitTracks = false, // the ellipses cluttered the globe; satellites stay as markers with labels
  aoi = { lat: -4.5895, lon: 137.4417 }, // Gale Crater Bradbury Landing
  onFlyInComplete,
  flyIn = false,
  textureUrl,
  landingSites: customLandingSites,
  orbiters: customOrbiters,
  onAltitude,
  onPick,
  pickedPoint,
  geologyOpacity = 0,
  overlays,
  showZones = false,
  onHover: onHoverProp,
  onSiteSelect,
  selectedSiteId,
  onViewCenter: onViewCenterProp,
  focusPoint,
  framing = "idle",
  onPlanetClick,
  scriptedPose = descentPoseRef,
  utc,
  className,
  style,
}: MarsGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<number | null>(null);
  const viewportHeight = () => containerRef.current?.clientHeight || 900;
  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const prevPointer = useRef({ x: 0, y: 0 });

  // Camera zoom distance
  const [cameraDistance, setCameraDistance] = useState(DEFAULT_CAMERA_DIST);
  const [currentAltitudeKm, setCurrentAltitudeKm] = useState(
    radiusToAltitudeKm(DEFAULT_CAMERA_DIST)
  );

  // Landing sites catalog
  const [landingSites, setLandingSites] = useState<LandingSite[]>(
    customLandingSites || DEFAULT_LANDING_SITES
  );

  useEffect(() => {
    if (customLandingSites) {
      setLandingSites(customLandingSites);
      return;
    }
    let isMounted = true;
    loadLandingSites().then((sites) => {
      if (isMounted) setLandingSites(sites);
    });
    return () => {
      isMounted = false;
    };
  }, [customLandingSites]);

  // Texture loading: the 4k mosaic first (decoded off the main thread, no HEAD round trip); the sharp 8k one only once the
  // globe has been on screen for a while and the browser is idle, and the replaced texture is freed on the GPU
  const [loadedTexture, setLoadedTexture] = useState<Texture | null>(null);
  const [isUsingMosaic, setIsUsingMosaic] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const ctl = new AbortController();
    const targetUrl = textureUrl || "/data/globe/mars_color_4k.jpg";
    let current: Texture | null = null;
    let cancelIdle = () => {};
    let swapTimer = 0;

    const show = (tex: Texture) => {
      const old = current;
      current = tex;
      setLoadedTexture(tex);
      // the old texture is still drawn for this frame: free it a moment after the new one is bound
      if (old) swapTimer = window.setTimeout(() => disposeTexture(old), 600);
    };

    loadBitmapTexture(targetUrl, ctl.signal)
      .then((tex) => {
        if (!isMounted) return disposeTexture(tex);
        show(tex);
        setIsUsingMosaic(true);
        // sharper mosaic for close zoom: swap in the 8k version once it has loaded
        if (!textureUrl) {
          const t = window.setTimeout(() => {
            cancelIdle = whenIdle(() => {
              if (!canUse8kTexture()) return;
              loadBitmapTexture("/data/globe/mars_color_8k.jpg", ctl.signal)
                .then((t8) => {
                  if (!isMounted) return disposeTexture(t8);
                  setActiveTextureWidth(8192);
                  show(t8);
                })
                .catch(() => undefined);
            }, 4000);
          }, 1500);
          const prevCancel = cancelIdle;
          cancelIdle = () => {
            window.clearTimeout(t);
            prevCancel();
          };
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError" || !isMounted) return;
        // procedural shading stays when there is no mosaic
        setLoadedTexture(null);
        setIsUsingMosaic(false);
      });

    return () => {
      isMounted = false;
      ctl.abort();
      cancelIdle();
      window.clearTimeout(swapTimer);
      setActiveTextureWidth(4096);
      disposeTexture(current);
    };
  }, [textureUrl]);

  // Hover point (also feeds the top chip) and zoom-to-cursor
  const hoverRef = useRef<{ lat: number; lon: number } | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const handleHover = useCallback(
    (p: { lat: number; lon: number } | null) => {
      hoverRef.current = p;
      setCursor(p);
      onHoverProp?.(p);
    },
    [onHoverProp],
  );
  const [viewCenter, setViewCenter] = useState<{ lat: number; lon: number } | null>(null);
  const handleViewCenter = useCallback(
    (c: { lat: number; lon: number }) => {
      setViewCenter(c);
      onViewCenterProp?.(c);
    },
    [onViewCenterProp],
  );
  const focusCounter = useRef(0);
  const [activeFocus, setActiveFocus] = useState<{ lat: number; lon: number; nonce: number; arc?: boolean } | null>(null);
  useEffect(() => {
    if (focusPoint) setActiveFocus({ lat: focusPoint.lat, lon: focusPoint.lon, nonce: ++focusCounter.current, arc: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.nonce, focusPoint?.lat, focusPoint?.lon]);

  // Global data layers: each texture is fetched once, the first time the layer is switched on
  const [overlayTextures, setOverlayTextures] = useState<Partial<Record<OverlayId, Texture>>>({});
  const requestedOverlays = useRef(new Set<OverlayId>());
  useEffect(() => {
    for (const id of OVERLAY_IDS) {
      if ((overlays?.[id] ?? 0) <= 0 || requestedOverlays.current.has(id)) continue;
      requestedOverlays.current.add(id);
      new TextureLoader().load(
        OVERLAY_TEXTURE_URL[id],
        (tex) => {
          tex.generateMipmaps = true;
          tex.minFilter = LinearMipmapLinearFilter;
          tex.needsUpdate = true;
          setOverlayTextures((prev) => ({ ...prev, [id]: tex }));
        },
        undefined,
        () => requestedOverlays.current.delete(id),
      );
    }
  }, [overlays]);

  // Geologic map overlay (USGS SIM 3292): loaded lazily, only when the layer is first switched on
  const [geoTexture, setGeoTexture] = useState<Texture | null>(null);
  const geoWanted = (geologyOpacity ?? 0) > 0;
  useEffect(() => {
    if (!geoWanted || geoTexture) return;
    let alive = true;
    new TextureLoader().load(
      "/data/globe/mars_geology_4k.jpg",
      (tex) => {
        tex.generateMipmaps = true;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.needsUpdate = true;
        if (alive) setGeoTexture(tex);
      },
      undefined,
      () => {
        /* data not deployed: the layer stays off */
      },
    );
    return () => {
      alive = false;
    };
  }, [geoWanted, geoTexture]);

  // Orbiters state: poll /api/v1/orbiters/states?utc=... every 10s
  const [orbiters, setOrbiters] = useState<OrbiterApiState[]>(customOrbiters || []);
  const prevOrbitersRef = useRef<OrbiterApiState[]>([]);
  const lastPollTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (customOrbiters) {
      setOrbiters(customOrbiters);
      return;
    }

    let isMounted = true;
    const targetUtc = utc || new Date().toISOString();

    async function fetchOrbiters() {
      try {
        const res = await apiFetch(
          `/api/v1/orbiters/states?utc=${encodeURIComponent(targetUtc)}`
        );
        if (res.ok && isMounted) {
          const data = (await res.json()) as OrbiterApiState[];
          if (Array.isArray(data)) {
            prevOrbitersRef.current = orbiters;
            setOrbiters(data);
            lastPollTimeRef.current = Date.now();
            return;
          }
        }
      } catch {
        // Offline or unavailable
      }
      if (isMounted && !customOrbiters) {
        setOrbiters([]);
      }
    }

    fetchOrbiters();
    const interval = setInterval(fetchOrbiters, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [customOrbiters, utc]);

  // Initial altitude notification and sync on cameraDistance change
  useEffect(() => {
    const alt = radiusToAltitudeKm(cameraDistance);
    setCurrentAltitudeKm(alt);
    onAltitude?.(alt);
  }, [cameraDistance, onAltitude]);

  // Projected screen labels for landing sites and orbiters
  const [siteLabelMap, setSiteLabelMap] = useState<
    Record<string, { screenX: number; screenY: number; visible: boolean }>
  >({});
  const [orbiterLabelMap, setOrbiterLabelMap] = useState<
    Record<string, { screenX: number; screenY: number; visible: boolean }>
  >({});

  const handleUpdateLabels = useCallback(
    (
      sites: Array<{ site: LandingSite; screenX: number; screenY: number; visible: boolean }>,
      orbs: Array<{ orbiter: OrbiterApiState; name: string; screenX: number; screenY: number; visible: boolean }>
    ) => {
      const siteMap: Record<string, { screenX: number; screenY: number; visible: boolean }> = {};
      for (const s of sites) {
        siteMap[s.site.id] = { screenX: s.screenX, screenY: s.screenY, visible: s.visible };
      }
      setSiteLabelMap(siteMap);

      const orbMap: Record<string, { screenX: number; screenY: number; visible: boolean }> = {};
      for (const o of orbs) {
        orbMap[o.orbiter.id] = { screenX: o.screenX, screenY: o.screenY, visible: o.visible };
      }
      setOrbiterLabelMap(orbMap);
    },
    []
  );

  // Top chip: the cursor if it is on the planet, else the picked point, else the point below the camera (always moving)
  const chipText = cursor
    ? `CURSOR ${formatLatLon(cursor.lat, cursor.lon, 3)}`
    : pickedPoint
      ? `PICKED ${formatLatLon(pickedPoint.lat, pickedPoint.lon, 3)}`
      : viewCenter
        ? `VIEW CENTRE ${formatLatLon(viewCenter.lat, viewCenter.lon, 2)} · ALT ${formatAltitude(currentAltitudeKm)}`
        : `AOI: Gale Crater (${aoi.lat.toFixed(2)}°, ${aoi.lon.toFixed(2)}°)`;

  // Declutter: labels that would overlap a more important one (selected, then 3D sites) are hidden
  const hiddenSiteIds = useMemo(
    () =>
      hideOverlapping(
        landingSites.map((s) => {
          const p = siteLabelMap[s.id];
          const badge = s.detail === "local" ? "3D · FPV · 2D" : "3D · 2D";
          return {
            id: s.id,
            x: p?.screenX ?? 0,
            y: p?.screenY ?? 0,
            w: estimateLabelWidth(`${s.name} ${s.year}`, badge),
            h: 22,
            priority: (s.id === selectedSiteId ? 100 : 0) + (s.detail === "local" ? 10 : 0),
            visible: p?.visible ?? false,
          };
        }),
      ),
    [landingSites, siteLabelMap, selectedSiteId],
  );

  const handleAltitudeChange = useCallback(
    (altKm: number) => {
      setCurrentAltitudeKm(altKm);
      onAltitude?.(altKm);
    },
    [onAltitude]
  );

  // Mouse & Touch interactions
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive || scriptedPose.current) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        const [p1, p2] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinchStart.current = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        setIsDragging(false);
        return;
      }
      setIsDragging(true);
      prevPointer.current = { x: e.clientX, y: e.clientY };
      setDragDelta({ x: 0, y: 0 });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [interactive]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2 && pinchStart.current !== null) {
        // pinch: same clamp as the wheel
        const [p1, p2] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const now = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (now > 1 && pinchStart.current > 1) {
          setCameraDistance((prev) => applyZoomStep(prev, pinchStart.current! / now, viewportHeight(), MAX_CAMERA_DIST));
          pinchStart.current = now;
        }
        return;
      }
      if (!isDragging || !interactive) return;
      const dx = e.clientX - prevPointer.current.x;
      const dy = e.clientY - prevPointer.current.y;
      prevPointer.current = { x: e.clientX, y: e.clientY };
      setDragDelta({ x: dx, y: dy });
    },
    [isDragging, interactive]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    setIsDragging(false);
    setDragDelta({ x: 0, y: 0 });
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // Continuous zoom on mouse wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!interactive || scriptedPose.current) return;
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.06 : 0.94;
      setCameraDistance((prev) => applyZoomStep(prev, zoomFactor, viewportHeight(), MAX_CAMERA_DIST));
      // zooming in: glide the point under the cursor to the centre of the view
      const h = hoverRef.current;
      if (e.deltaY < 0 && h) setActiveFocus({ lat: h.lat, lon: h.lon, nonce: ++focusCounter.current });
    },
    [interactive, scriptedPose]
  );

  // Keyboard zoom (+ / -): same clamp as wheel and pinch
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (scriptedPose.current || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") setCameraDistance((prev) => applyZoomStep(prev, 0.9, viewportHeight(), MAX_CAMERA_DIST));
      if (e.key === "-" || e.key === "_") setCameraDistance((prev) => applyZoomStep(prev, 1.1, viewportHeight(), MAX_CAMERA_DIST));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive, scriptedPose]);

  return (
    <div
      ref={containerRef}
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
      onWheel={handleWheel}
      role="region"
      aria-label="Interactive 3D Mars Globe"
    >
      <Canvas
        camera={{ position: [0, 0, DEFAULT_CAMERA_DIST], fov: GLOBE_FOV_DEG, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: "100%", height: "100%" }}
      >
        <AdaptiveDpr />
        <GlobeScene
          autoRotate={autoRotate}
          showOrbiters={showOrbiters}
          showOrbitTracks={showOrbitTracks}
          aoi={aoi}
          flyIn={flyIn}
          onFlyInComplete={onFlyInComplete}
          texture={loadedTexture}
          landingSites={landingSites}
          orbiters={orbiters}
          isDragging={isDragging}
          dragDelta={dragDelta}
          targetDistance={cameraDistance}
          scriptedPose={scriptedPose}
          onAltitude={handleAltitudeChange}
          onPick={onPick}
          pickedPoint={pickedPoint}
          geoTexture={geoTexture}
          geologyOpacity={geologyOpacity}
          overlayTextures={overlayTextures}
          overlayOpacity={overlays ?? {}}
          showZones={showZones}
          onHover={handleHover}
          focusPoint={activeFocus}
          framing={framing}
          onPlanetClick={onPlanetClick}
          onViewCenter={handleViewCenter}
          onUpdateLabels={handleUpdateLabels}
        />
      </Canvas>

      {/* Screen-Projected Landing Site Labels */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {landingSites.map((site) => {
          const isGale = site.detail === "local" || (site.detail === undefined && site.id === "gale");
          const isSelected = site.id === selectedSiteId;
          const proj = siteLabelMap[site.id];
          const isVisible = (proj !== undefined ? proj.visible : true) && !hiddenSiteIds.has(site.id);
          const screenX = proj?.screenX ?? 0;
          const screenY = proj?.screenY ?? 0;

          return (
            <div
              key={site.id}
              data-testid={`site-label-${site.id}`}
              className="globe-site-label"
              role="button"
              tabIndex={0}
              aria-label={`Select ${site.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => onSiteSelect?.(site.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSiteSelect?.(site.id);
              }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                // whole pixels and a 2-D translate: a fractional 3-D offset puts the text on its own layer and blurs it
                transform: `translate(${Math.round(screenX)}px, ${Math.round(screenY)}px) translate(-50%, -125%)`,
                display: isVisible ? "flex" : "none",
                pointerEvents: "auto",
                cursor: "pointer",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                fontFamily: "Inter, sans-serif",
                fontSize: isGale ? 12 : 11.5,
                fontWeight: isGale ? 650 : 500,
                letterSpacing: "0.01em",
                color: isGale ? "var(--hz-accent, #2dd4bf)" : "#d3dfeb",
                background: isGale
                  ? "rgba(8, 14, 22, 0.9)"
                  : "rgba(8, 14, 22, 0.8)",
                boxShadow: isSelected
                  ? "0 0 0 1px color-mix(in srgb, var(--hz-accent, #2dd4bf) 45%, transparent), 0 0 18px color-mix(in srgb, var(--hz-accent, #2dd4bf) 30%, transparent), 0 4px 14px rgba(0, 0, 0, 0.5)"
                  : "0 4px 14px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
                border: isSelected
                  ? "1px solid var(--hz-accent, #2dd4bf)"
                  : isGale
                    ? "1px solid color-mix(in srgb, var(--hz-accent, #2dd4bf) 45%, transparent)"
                    : "1px solid rgba(136, 153, 166, 0.2)",
                outline: "none",
                zIndex: isSelected ? 3 : isGale ? 2 : 1,
                whiteSpace: "nowrap",
                userSelect: "none",
                // the individual `scale` property, not `transform`: the transform follows the globe every frame and must not be transitioned
                scale: isSelected ? 1.14 : 1,
                transition: reducedMotion
                  ? "opacity 0.15s ease"
                  : "opacity 0.15s ease, scale 0.5s cubic-bezier(0.22, 1.2, 0.36, 1), box-shadow 0.4s ease, border-color 0.4s ease",
              }}
            >
              <span>{site.name}</span>
              <span
                data-testid={`site-year-${site.id}`}
                style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, letterSpacing: "0.04em", opacity: 0.7 }}
              >
                {site.year}
              </span>
              {isGale ? (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--hz-accent, #2dd4bf)",
                    background: "color-mix(in srgb, var(--hz-accent, #2dd4bf) 16%, transparent)",
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  3D · FPV · 2D
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10,
                    color: "#f0b429",
                    background: "rgba(240, 180, 41, 0.12)",
                    padding: "1px 6px",
                    borderRadius: 999,
                    letterSpacing: "0.04em",
                  }}
                >
                  3D · 2D
                </span>
              )}
            </div>
          );
        })}

        {/* Screen-Projected Orbiter Labels: only drawn when orbiters list is not empty */}
        {showOrbiters &&
          orbiters.length > 0 &&
          orbiters.map((orbiter) => {
            const meta = ORBITER_METADATA[orbiter.id.toLowerCase()];
            const name = meta?.name ?? orbiter.id.toUpperCase();
            const proj = orbiterLabelMap[orbiter.id];
            const isVisible = proj !== undefined ? proj.visible : true;
            const screenX = proj?.screenX ?? 0;
            const screenY = proj?.screenY ?? 0;

            return (
              <div
                key={orbiter.id}
                data-testid={`orbiter-label-${orbiter.id}`}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  transform: `translate(${Math.round(screenX)}px, ${Math.round(screenY)}px) translate(-50%, -130%)`,
                  display: isVisible ? "flex" : "none",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 6px",
                  borderRadius: 3,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 9,
                  color: "#E6EDF3",
                  background: "rgba(11, 15, 20, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}
              >
                <span>{name}</span>
                <span
                  style={{
                    fontSize: 8,
                    color: "#E69F00",
                    background: "rgba(230, 159, 0, 0.15)",
                    padding: "1px 3px",
                    borderRadius: 2,
                  }}
                >
                  APPROXIMATE
                </span>
              </div>
            );
          })}
      </div>

      {/* Bottom-left metadata badge */}
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
          {isUsingMosaic
            ? "GLOBAL MOSAIC"
            : "PROCEDURAL SHADING (placeholder texture)"}
        </span>
        {showOrbiters && orbiters.length > 0 && (
          <span style={{ color: "#E69F00" }}>ORBITERS: APPROXIMATE</span>
        )}
      </div>

      {/* Bottom-right Altitude (ALT) readout badge */}
      <div
        data-testid="globe-alt-readout"
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          pointerEvents: "none",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "#56B4E9",
          background: "rgba(11, 15, 20, 0.82)",
          backdropFilter: "blur(6px)",
          padding: "5px 10px",
          borderRadius: 4,
          border: "1px solid rgba(86, 180, 233, 0.3)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: "#8899A6", fontSize: 10 }}>ALT:</span>
        <span style={{ fontWeight: 600 }}>{formatAltitude(currentAltitudeKm)}</span>
      </div>

      {/* Top-right AOI Indicator label */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)", // centred: the screen's own top bar owns both corners
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
        <span data-testid="aoi-chip" translate="no">
          {chipText}
        </span>
      </div>
    </div>
  );
}
