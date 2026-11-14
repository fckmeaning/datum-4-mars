import { describe, expect, it, vi } from "vitest";
import { Box3, BoxGeometry, BufferGeometry, DataTexture, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { buildPathData, curvatureDropM, demHeight, type Dem } from "./fpvMath";
import {
  RING_CELLS,
  buildRibbonGeometry,
  buildRingGeometry,
  clipmapLevels,
  createHeightTexture,
  disposeFpvResources,
  disposeObject3D,
  placeRoverModel,
  rawColor,
  renderedHeight,
  ringTriangleCount,
  snapToLattice,
  terrainNormal,
} from "./fpvTerrain";

function slopeDem(): Dem {
  const w = 20;
  const h = 20;
  const elevation = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) elevation[r * w + c] = -4500 + 0.1 * (c * 10 + 5);
  return { width: w, height: h, bbox: [0, 0, 200, 200], elevation, minElevation: -4500, nodata: -32768 };
}

describe("clipmap", () => {
  it("covers 20 km with the required number of rings", () => {
    expect(clipmapLevels(2.5, 20_000)).toBe(8); // 160 m inner reach, doubling to 20.5 km
    expect(clipmapLevels(5, 20_000)).toBe(7);
    expect(clipmapLevels(5, 100)).toBe(1);
  });

  it("builds rings with the expected triangle counts and a hole where the finer ring sits", () => {
    const full = buildRingGeometry(RING_CELLS, 2.5, false);
    const ring = buildRingGeometry(RING_CELLS, 5, true);
    expect((full.getIndex()?.count ?? 0) / 3).toBe(ringTriangleCount(RING_CELLS, false));
    expect((ring.getIndex()?.count ?? 0) / 3).toBe(ringTriangleCount(RING_CELLS, true));
    expect(ringTriangleCount(RING_CELLS, true)).toBe(2 * (RING_CELLS * RING_CELLS - (RING_CELLS / 2) ** 2));
    // the hole is the central half of the ring's extent: no triangle has all its vertices inside |x|,|z| < quarter extent
    const pos = ring.getAttribute("position");
    const idx = ring.getIndex();
    const quarter = (RING_CELLS / 4) * 5;
    let inside = 0;
    for (let t = 0; t < (idx?.count ?? 0); t += 3) {
      const verts = [0, 1, 2].map((k) => {
        const i = idx!.getX(t + k);
        return [pos.getX(i), pos.getZ(i)] as const;
      });
      if (verts.every(([x, z]) => Math.abs(x) < quarter && Math.abs(z) < quarter)) inside++;
    }
    expect(inside).toBe(0);
    full.dispose();
    ring.dispose();
  });

  it("flags odd lattice vertices and snaps to the lattice", () => {
    const g = buildRingGeometry(8, 10, false);
    const odd = g.getAttribute("aOdd");
    expect([odd.getX(0), odd.getY(0)]).toEqual([0, 0]);
    expect([odd.getX(1), odd.getY(1)]).toEqual([1, 0]);
    expect(snapToLattice(13.7, 5)).toBe(15);
    expect(snapToLattice(-2.4, 5)).toBe(-0);
    g.dispose();
  });

  it("total triangle budget of a full clipmap stays far below 1 M", () => {
    let total = ringTriangleCount(RING_CELLS, false);
    for (let k = 1; k < clipmapLevels(2.5); k++) total += ringTriangleCount(RING_CELLS, true);
    expect(total).toBeLessThan(250_000);
  });
});

describe("height texture and route ribbon", () => {
  it("stores elevation minus base and replaces nodata", () => {
    const dem = slopeDem();
    dem.elevation[0] = -32768;
    const tex = createHeightTexture(dem, -4500);
    const data = tex.image.data as Float32Array;
    expect(data.length).toBe(400);
    expect(data[0]).toBeCloseTo(0, 6); // nodata -> minElevation (-4500) -> 0 after the base is removed
    expect(data[1]).toBeCloseTo(0.1 * 15, 4);
    tex.dispose();
  });

  it("lays the ribbon on the ground, lifted by 8 cm, in scene axes (Z = -North)", () => {
    const dem = slopeDem();
    const path = buildPathData([[20, 50], [120, 50]], [{ duration_s: 100, limiting_factor: "slope" } as never]);
    const g = buildRibbonGeometry(path, dem, -4500, [{ limiting_factor: "slope" }], "FASTEST", 1, 5);
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    expect(pos.count % 2).toBe(0);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      expect(pos.getY(i)).toBeCloseTo(demHeight(dem, x, -z) + 4500 + 0.08, 5);
      expect(Math.abs(z + 50)).toBeLessThanOrEqual(0.5 + 1e-9); // within half the ribbon width of the path (y = 50)
    }
    // limiting factor "slope" uses the danger token #F85149
    const [r] = rawColor("#F85149");
    expect(col.getX(0)).toBeCloseTo(r, 5);
    g.dispose();
  });

  it("returns an empty geometry for a degenerate path", () => {
    const g = buildRibbonGeometry(buildPathData([[1, 1]]), slopeDem(), -4500, [], "FASTEST");
    expect(g.getAttribute("position")).toBeUndefined();
  });

  it("matches the shader's curvature drop at distance", () => {
    const dem = slopeDem();
    const near = renderedHeight(dem, -4500, 100, 100, 100, 100);
    expect(near).toBeCloseTo(demHeight(dem, 100, 100) + 4500, 9);
    const far = renderedHeight(dem, -4500, 100, 100, 100, 100 - 3000);
    expect(far).toBeCloseTo(demHeight(dem, 100, 100) + 4500 - curvatureDropM(3000), 9);
  });
});

describe("GPU disposal", () => {
  it("disposes geometries, materials and textures, tolerating nulls and repeats", () => {
    const g = new BufferGeometry();
    const m = new MeshBasicMaterial();
    const t = new DataTexture(new Uint8Array(4), 1, 1);
    const gs = vi.spyOn(g, "dispose");
    const ms = vi.spyOn(m, "dispose");
    const ts = vi.spyOn(t, "dispose");
    const res = { geometries: [g, null], materials: [m, undefined], textures: [t, null] };
    disposeFpvResources(res);
    disposeFpvResources(res);
    expect(gs).toHaveBeenCalledTimes(2);
    expect(ms).toHaveBeenCalledTimes(2);
    expect(ts).toHaveBeenCalledTimes(2);
  });
});

describe("rover model placement", () => {
  const flat = (): Dem => ({ ...slopeDem(), elevation: new Float32Array(400).fill(-4400), minElevation: -4400 });

  function oddModel(): Mesh {
    // size and offset like the NASA model: origin far from the centre, lowest point below the origin
    const geo = new BoxGeometry(2.78, 2.22, 3.95);
    geo.translate(-1.06, 0.87, -0.78);
    return new Mesh(geo, new MeshBasicMaterial());
  }

  it("computes the terrain normal in scene axes", () => {
    const [nx, ny, nz] = terrainNormal(slopeDem(), 100, 100);
    expect(nx).toBeCloseTo(-0.1 / Math.hypot(0.1, 1), 4); // rising East tilts the normal West
    expect(ny).toBeCloseTo(1 / Math.hypot(0.1, 1), 4);
    expect(nz).toBeCloseTo(0, 6);
    // rows run North to South: elevation falling with the row index means the ground rises towards the NORTH,
    // so the normal leans South (scene +Z); the opposite data leans it North (scene -Z)
    const risingNorth = { ...slopeDem(), elevation: new Float32Array(400).map((_, i) => -4500 + 0.1 * (200 - (Math.floor(i / 20) * 10 + 5))) };
    const risingSouth = { ...slopeDem(), elevation: new Float32Array(400).map((_, i) => -4500 + 0.1 * (Math.floor(i / 20) * 10 + 5)) };
    expect(terrainNormal(risingNorth, 100, 100)[2]).toBeGreaterThan(0.09);
    expect(terrainNormal(risingSouth, 100, 100)[2]).toBeLessThan(-0.09);
  });

  it("centres the model in x/z, puts the lowest point on the ground and keeps its size", () => {
    const dem = flat();
    const root = placeRoverModel(oddModel(), dem, -4500, 120, 80, 0, 0);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    const c = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    expect(c.x).toBeCloseTo(120, 4);
    expect(c.z).toBeCloseTo(-80, 4);
    expect(box.min.y).toBeCloseTo(100, 4); // -4400 - (-4500)
    expect(size.x).toBeCloseTo(2.78, 4);
    expect(size.z).toBeCloseTo(3.95, 4);
  });

  it("turns to the compass heading and tilts onto the surface", () => {
    const dem = slopeDem();
    const east = placeRoverModel(oddModel(), dem, -4500, 100, 100, 90, 0);
    east.updateMatrixWorld(true);
    const size = new Box3().setFromObject(east).getSize(new Vector3());
    // heading 90 (East) turns the long Z axis onto the X axis (the box is also tilted by 5.7 deg, hence the tolerance)
    expect(size.x).toBeGreaterThan(size.z);
    const up = new Vector3(0, 1, 0).applyQuaternion(east.quaternion);
    const [nx, ny, nz] = terrainNormal(dem, 100, 100);
    expect(up.x).toBeCloseTo(nx, 5);
    expect(up.y).toBeCloseTo(ny, 5);
    expect(up.z).toBeCloseTo(nz, 5);
  });

  it("disposes geometry, materials and the textures inside them", () => {
    const tex = new DataTexture(new Uint8Array(4), 1, 1);
    const mat = new MeshBasicMaterial({ map: tex });
    const geo = new BoxGeometry(1, 1, 1);
    const group = new Group();
    group.add(new Mesh(geo, mat));
    const t = vi.spyOn(tex, "dispose");
    const m = vi.spyOn(mat, "dispose");
    const g = vi.spyOn(geo, "dispose");
    disposeObject3D(group);
    expect(t).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
    expect(g).toHaveBeenCalledTimes(1);
  });
});
