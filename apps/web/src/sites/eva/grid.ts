/** Grid over the elevation tile: shortest-time search (A*) and the oxygen-to-home field (reverse Dijkstra). */

import { EVA, EVA_EXTRA, edgeTerms, walkSpeed, type Mode } from "./evaModel";

export interface Grid {
  w: number;
  h: number;
  /** metres per cell, east-west and north-south */
  cellX: number;
  cellY: number;
  z: Float32Array;
}

export interface Pt {
  x: number;
  y: number;
}

/** Block-average the elevation tile down to at most `maxCells` cells on its long side. Row 0 is north. */
export function gridFromDem(heights: Float32Array, w: number, h: number, dx: number, dy: number, maxCells = 256): Grid {
  const stride = Math.max(1, Math.ceil(Math.max(w, h) / maxCells));
  const gw = Math.floor(w / stride);
  const gh = Math.floor(h / stride);
  const z = new Float32Array(gw * gh);
  for (let r = 0; r < gh; r++) {
    for (let c = 0; c < gw; c++) {
      let sum = 0;
      for (let j = 0; j < stride; j++) for (let i = 0; i < stride; i++) sum += heights[(r * stride + j) * w + c * stride + i]!;
      z[r * gw + c] = sum / (stride * stride);
    }
  }
  return { w: gw, h: gh, cellX: dx * stride, cellY: dy * stride, z };
}

/** Local metres (x east, y north from the middle of the tile) of a cell centre. */
export function cellPoint(g: Grid, idx: number): Pt & { z: number } {
  const c = idx % g.w;
  const r = Math.floor(idx / g.w);
  return { x: (c + 0.5) * g.cellX - (g.w * g.cellX) / 2, y: (g.h * g.cellY) / 2 - (r + 0.5) * g.cellY, z: g.z[idx]! };
}

export function cellOf(g: Grid, p: Pt): number {
  const c = Math.min(g.w - 1, Math.max(0, Math.floor((p.x + (g.w * g.cellX) / 2) / g.cellX)));
  const r = Math.min(g.h - 1, Math.max(0, Math.floor(((g.h * g.cellY) / 2 - p.y) / g.cellY)));
  return r * g.w + c;
}

const NB: Array<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

function neighbours(g: Grid, idx: number): number[] {
  const c = idx % g.w;
  const r = Math.floor(idx / g.w);
  const out: number[] = [];
  for (const [dc, dr] of NB) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc >= 0 && nc < g.w && nr >= 0 && nr < g.h) out.push(nr * g.w + nc);
  }
  return out;
}

/** Time and oxygen of the step a -> b. */
export function step(g: Grid, a: number, b: number, mode: Mode) {
  const ca = a % g.w;
  const ra = Math.floor(a / g.w);
  const cb = b % g.w;
  const rb = Math.floor(b / g.w);
  const d = Math.hypot((cb - ca) * g.cellX, (rb - ra) * g.cellY);
  return { d, dz: g.z[b]! - g.z[a]!, ...edgeTerms(d, g.z[b]! - g.z[a]!, mode) };
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    let i = this.k.length;
    this.k.push(key);
    this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p]! <= this.k[i]!) break;
      [this.k[p], this.k[i]] = [this.k[i]!, this.k[p]!];
      [this.v[p], this.v[i]] = [this.v[i]!, this.v[p]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.k[0]!, this.v[0]!];
    const lk = this.k.pop()!;
    const lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l]! < this.k[m]!) m = l;
        if (r < this.k.length && this.k[r]! < this.k[m]!) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i]!, this.k[m]!];
        [this.v[m], this.v[i]] = [this.v[i]!, this.v[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** Fastest route between two cells (list of cell indices), or null when the slopes block every way. */
export function aStar(g: Grid, start: number, goal: number, mode: Mode = "foot"): number[] | null {
  if (start === goal) return [start];
  const vmax = mode === "rover" ? EVA_EXTRA.rover_ms : walkSpeed(-EVA.tobler_b); // fastest possible speed keeps the estimate admissible
  const gp = cellPoint(g, goal);
  const heur = (i: number) => {
    const p = cellPoint(g, i);
    return Math.hypot(p.x - gp.x, p.y - gp.y) / vmax;
  };
  const cost = new Float64Array(g.w * g.h).fill(Infinity);
  const from = new Int32Array(g.w * g.h).fill(-1);
  const heap = new MinHeap();
  cost[start] = 0;
  heap.push(heur(start), start);
  while (heap.size) {
    const [, u] = heap.pop();
    if (u === goal) break;
    for (const n of neighbours(g, u)) {
      const s = step(g, u, n, mode);
      if (!s.ok) continue;
      const nc = cost[u]! + s.dt;
      if (nc < cost[n]!) {
        cost[n] = nc;
        from[n] = u;
        heap.push(nc + heur(n), n);
      }
    }
  }
  if (!Number.isFinite(cost[goal]!)) return null;
  const path = [goal];
  while (path[0] !== start) path.unshift(from[path[0]!]!);
  return path;
}

/** Oxygen [L] to walk home from every cell along the cheapest route (Infinity where no walkable way exists). */
export function homeField(g: Grid, home: number): Float64Array {
  const dist = new Float64Array(g.w * g.h).fill(Infinity);
  const heap = new MinHeap();
  dist[home] = 0;
  heap.push(0, home);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]!) continue;
    for (const n of neighbours(g, u)) {
      const s = step(g, n, u, "foot"); // the walk is n -> u, towards home
      if (!s.ok) continue;
      const nd = d + s.o2;
      if (nd < dist[n]!) {
        dist[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return dist;
}

/** Oxygen [L] to walk from `src` to every cell along the cheapest route (Infinity where no walkable way exists). */
export function outField(g: Grid, src: number): Float64Array {
  const dist = new Float64Array(g.w * g.h).fill(Infinity);
  const heap = new MinHeap();
  dist[src] = 0;
  heap.push(0, src);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]!) continue;
    for (const n of neighbours(g, u)) {
      const s = step(g, u, n, "foot"); // the walk is u -> n, away from the source
      if (!s.ok) continue;
      const nd = d + s.o2;
      if (nd < dist[n]!) {
        dist[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return dist;
}

/** Walking time [s] along a path of cells. */
export function walkSeconds(g: Grid, path: number[]): number {
  let t = 0;
  for (let k = 1; k < path.length; k++) t += step(g, path[k - 1]!, path[k]!, "foot").dt;
  return t;
}

/** Cheapest walk home from a cell by following the oxygen field downhill. */
export function descendHome(g: Grid, field: Float64Array, from: number): number[] {
  const path = [from];
  let cur = from;
  for (let guard = 0; guard < g.w * g.h && field[cur]! > 0; guard++) {
    let best = -1;
    let bestVal = Infinity;
    for (const n of neighbours(g, cur)) {
      const s = step(g, cur, n, "foot");
      if (!s.ok) continue;
      const v = s.o2 + field[n]!;
      if (v < bestVal && field[n]! < field[cur]!) { // the best neighbour has v equal to field[cur]: pick the smallest v that gets closer
        bestVal = v;
        best = n;
      }
    }
    if (best < 0) break;
    path.push(best);
    cur = best;
  }
  return path;
}
