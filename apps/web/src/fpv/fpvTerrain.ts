/**
 * fpvTerrain.ts - GPU resource builders for the first-person view (no React): clipmap rings, DEM texture, route ribbon,
 * and one place that disposes everything.
 */

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  ClampToEdgeWrapping,
  Object3D,
  Quaternion,
  RedFormat,
  Texture,
  Vector3,
  type Material,
} from "three";
import { getLimitingFactorColor } from "../map3d/routeTube";
import { curvatureDropM, demHeight, pathStateAtDistance, segmentIndexAtDistance, type Dem, type PathData } from "./fpvMath";

/** Cells per ring side; even, and a multiple of 4 so the hole is exactly the next finer ring. */
export const RING_CELLS = 128;

/** Number of rings needed to reach `reachM` from the camera with `cell0` metre cells in the innermost one. */
export function clipmapLevels(cell0: number, reachM = 20_000, cells = RING_CELLS): number {
  const innerReach = (cells / 2) * cell0;
  return 1 + Math.max(0, Math.ceil(Math.log2(reachM / innerReach)));
}

/** Snaps a coordinate to a lattice of `step` metres (rings move in steps of twice their cell so lattices of rings stay aligned). */
export function snapToLattice(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/**
 * One clipmap ring: a (cells x cells) grid centred on the origin (local x, z are multiples of `cell`). Rings other than the
 * innermost leave out the central quarter of the area, which the next finer ring covers. `aOdd` flags the vertices that do not
 * exist in the next coarser lattice (used by the vertex shader's geomorph).
 */
export function buildRingGeometry(cells: number, cell: number, withHole: boolean): BufferGeometry {
  const n = cells + 1;
  const positions = new Float32Array(n * n * 3);
  const odd = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      positions[k * 3] = (i - cells / 2) * cell;
      positions[k * 3 + 1] = 0;
      positions[k * 3 + 2] = (j - cells / 2) * cell;
      odd[k * 2] = i & 1;
      odd[k * 2 + 1] = j & 1;
    }
  }
  const idx: number[] = [];
  const q = cells / 4;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      if (withHole && i >= q && i < cells - q && j >= q && j < cells - q) continue;
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setAttribute("aOdd", new BufferAttribute(odd, 2));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  return g;
}

/** Number of triangles of a ring (for budgeting and tests). */
export function ringTriangleCount(cells: number, withHole: boolean): number {
  const holeQuads = withHole ? (cells / 2) * (cells / 2) : 0;
  return 2 * (cells * cells - holeQuads);
}

/** R32F texture of (elevation - base) with nodata replaced by the raster minimum; nearest filtering (the shader filters). */
export function createHeightTexture(dem: Dem, base: number): DataTexture {
  const data = new Float32Array(dem.width * dem.height);
  for (let i = 0; i < data.length; i++) {
    const v = dem.elevation[i];
    data[i] = (v === undefined || !Number.isFinite(v) || v <= dem.nodata + 100 ? dem.minElevation : v) - base;
  }
  const tex = new DataTexture(data, dem.width, dem.height, RedFormat, FloatType);
  tex.internalFormat = "R32F";
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export interface RibbonSegmentStyle {
  limiting_factor?: string;
}

/** Colour of a segment as raw sRGB (the shaders output display-referred colours, so no working-space conversion). */
export function rawColor(hex: string): [number, number, number] {
  const c = new Color().setHex(parseInt(hex.replace("#", ""), 16), LinearSRGBColorSpace);
  return [c.r, c.g, c.b];
}

/**
 * Flat ribbon laid on the ground along the path, coloured per leg by its limiting factor (same tokens as the 3D route tube).
 * Heights are sampled from the DEM and lifted by `lift` metres; the curvature drop is applied by the vertex shader.
 */
export function buildRibbonGeometry(
  path: PathData,
  dem: Dem,
  base: number,
  segments: ReadonlyArray<RibbonSegmentStyle>,
  profile: string,
  widthM = 0.5,
  stepM = 1.5,
  lift = 0.08,
): BufferGeometry {
  const g = new BufferGeometry();
  if (path.xy.length < 2 || path.totalLength <= 0) return g;
  const count = Math.max(2, Math.ceil(path.totalLength / stepM) + 1);
  const pos = new Float32Array(count * 2 * 3);
  const col = new Float32Array(count * 2 * 3);
  const half = widthM / 2;
  for (let s = 0; s < count; s++) {
    const d = Math.min(path.totalLength, (s * path.totalLength) / (count - 1));
    const st = pathStateAtDistance(path, d);
    const rad = (st.headingDeg * Math.PI) / 180;
    // right-hand perpendicular in AOI metres (East, North) of a heading measured clockwise from North
    const px = Math.cos(rad);
    const py = -Math.sin(rad);
    const [r, gg, b] = rawColor(getLimitingFactorColor(segments[segmentIndexAtDistance(path, d)]?.limiting_factor, profile));
    for (let side = 0; side < 2; side++) {
      const off = side === 0 ? -half : half;
      const x = st.x + px * off;
      const y = st.y + py * off;
      const k = (s * 2 + side) * 3;
      pos[k] = x;
      pos[k + 1] = demHeight(dem, x, y) - base + lift;
      pos[k + 2] = -y;
      col[k] = r;
      col[k + 1] = gg;
      col[k + 2] = b;
    }
  }
  const idx = new Uint32Array((count - 1) * 6);
  for (let s = 0; s < count - 1; s++) {
    const a = s * 2;
    idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], s * 6);
  }
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}

/** Height of the surface at a position as the shader draws it (elevation - base - curvature drop towards the camera). */
export function renderedHeight(dem: Dem, base: number, x: number, y: number, camX: number, camY: number): number {
  return demHeight(dem, x, y) - base - curvatureDropM(Math.hypot(x - camX, y - camY));
}

export interface FpvGpuResources {
  geometries: Array<BufferGeometry | null | undefined>;
  materials: Array<Material | null | undefined>;
  textures: Array<Texture | null | undefined>;
}

/** Disposes every GPU resource the view created (called on unmount; safe to call twice). */
export function disposeFpvResources(res: FpvGpuResources): void {
  for (const g of res.geometries) g?.dispose();
  for (const m of res.materials) m?.dispose();
  for (const t of res.textures) t?.dispose();
}

// ---------------------------------------------------------------- rover model

const DEG = Math.PI / 180;

/** Unit surface normal in scene axes (X East, Y up, Z = -North) from central differences over +-d metres. */
export function terrainNormal(dem: Dem, x: number, y: number, d = 2): [number, number, number] {
  const dhdx = (demHeight(dem, x + d, y) - demHeight(dem, x - d, y)) / (2 * d);
  const dhdy = (demHeight(dem, x, y + d) - demHeight(dem, x, y - d)) / (2 * d); // towards North
  // scene Z = -North, so dh/dZ = -dhdy and the normal (-dh/dX, 1, -dh/dZ) = (-dhdx, 1, dhdy)
  const len = Math.hypot(dhdx, 1, dhdy);
  return [-dhdx / len, 1 / len, dhdy / len];
}

/**
 * Places a rover model on the terrain: centred in x/z about its bounding box, lowest point (wheel bottoms) at the surface,
 * tilted onto the terrain normal, turned to a compass heading. The model's units must already be metres (the NASA Curiosity
 * model is; it is NOT rescaled). `forwardYawDeg` turns the model's own front axis onto the heading direction.
 */
export function placeRoverModel(model: Object3D, dem: Dem, base: number, x: number, y: number, headingDeg: number, forwardYawDeg = 0): Group {
  const box = new Box3().setFromObject(model);
  const centre = box.getCenter(new Vector3());
  model.position.set(-centre.x, -box.min.y, -centre.z);
  const pivot = new Group();
  pivot.add(model);
  pivot.rotation.y = (forwardYawDeg - headingDeg) * DEG;
  const root = new Group();
  root.add(pivot);
  const [nx, ny, nz] = terrainNormal(dem, x, y);
  root.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(nx, ny, nz)));
  root.position.set(x, demHeight(dem, x, y) - base, -y);
  return root;
}

/** Disposes geometries, materials and every texture a material references (a glTF keeps its textures in the materials). */
export function disposeObject3D(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    mesh.geometry?.dispose();
    const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof Texture) v.dispose();
      m.dispose();
    }
  });
}
