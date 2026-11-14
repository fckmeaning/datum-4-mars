"""Grid search kernels (F27 edge cost, F28 A*, Dijkstra) compiled with numba.

Cells are 16-connected (orthogonal, diagonal and knight moves). A move is blocked when its target, or any cell it
crosses, is blocked (no corner cutting). The heuristic h(n) = euclid(n, goal)·c_min, with c_min the minimum cost per
metre over all edges, is admissible and consistent, so A* returns the same cost as Dijkstra.
"""

from __future__ import annotations

import heapq

import numpy as np
from numba import njit

OFFSETS = np.array(
    [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1),
     (-1, -2), (-1, 2), (1, -2), (1, 2), (-2, -1), (-2, 1), (2, -1), (2, 1)], dtype=np.int64)

# Packed parameter vector layout (see pack_params in cost.py)
P_W_TAU, P_W_E, P_W_D, P_W_H, P_ALPHA = 0, 1, 2, 3, 4
P_TAU_REF, P_E_REF, P_D_REF, P_HZ_REF = 5, 6, 7, 8
P_V_FLAT, P_TOB_A, P_TOB_B, P_K_R = 9, 10, 11, 12
P_M_TOT, P_S_SUIT, P_G_RATIO, P_GRADE_LIM = 13, 14, 15, 16
P_C5, P_C4, P_C3, P_C2, P_C1, P_C0 = 17, 18, 19, 20, 21, 22
N_PARAMS = 23


class NoPathError(Exception):
    """F28: raised when the goal is unreachable from the start under the hard constraints."""


@njit(cache=True)
def _crossed_blocked(blocked, r, c, dr, dc):
    adr, adc = abs(dr), abs(dc)
    sr = 1 if dr > 0 else -1
    sc = 1 if dc > 0 else -1
    if adr == 1 and adc == 1:
        return blocked[r + dr, c] or blocked[r, c + dc]
    if adr == 1 and adc == 2:
        return blocked[r, c + sc] or blocked[r + dr, c + sc]
    if adr == 2 and adc == 1:
        return blocked[r + sr, c] or blocked[r + sr, c + dc]
    return False


@njit(cache=True)
def edge_terms(z, rough_n, haz, dose_h, sci, ra, ca, rb, cb, cell, P):
    """F27 terms for a move a→b: (cost, tau_s, energy_J, dose_mSv, hazard_m, science)."""
    dr = rb - ra
    dc = cb - ca
    d = cell * np.sqrt(dr * dr + dc * dc)
    za = z[ra, ca]
    zb = z[rb, cb]
    i = (zb - za) / d
    if abs(i) > P[P_GRADE_LIM]:
        return np.inf, 0.0, 0.0, 0.0, 0.0, 0.0
    rn = 0.5 * (rough_n[ra, ca] + rough_n[rb, cb])
    v = P[P_V_FLAT] * np.exp(-P[P_TOB_A] * abs(i + P[P_TOB_B])) / np.exp(-P[P_TOB_A] * P[P_TOB_B]) / (1.0 + P[P_K_R] * rn)
    tau = d / v
    cc = ((((P[P_C5] * i + P[P_C4]) * i + P[P_C3]) * i + P[P_C2]) * i + P[P_C1]) * i + P[P_C0]
    energy = P[P_M_TOT] * d * (P[P_C0] * P[P_S_SUIT] + (cc - P[P_C0]) * P[P_G_RATIO])
    dose = 0.5 * (dose_h[ra, ca] + dose_h[rb, cb]) * tau / 3600.0
    hz = d * 0.5 * (haz[ra, ca] + haz[rb, cb])
    s = 0.5 * (sci[ra, ca] + sci[rb, cb])
    cost = (P[P_W_TAU] * tau / P[P_TAU_REF] + P[P_W_E] * energy / P[P_E_REF]
            + P[P_W_D] * dose / P[P_D_REF] + P[P_W_H] * hz / P[P_HZ_REF]) * (1.0 - P[P_ALPHA] * s)
    return cost, tau, energy, dose, hz, s


@njit(cache=True)
def min_cost_per_metre(z, rough_n, haz, dose_h, sci, blocked, cell, P):
    H, W = z.shape
    best = np.inf
    for r in range(H):
        for c in range(W):
            if blocked[r, c]:
                continue
            for k in range(16):
                dr = OFFSETS[k, 0]
                dc = OFFSETS[k, 1]
                rb = r + dr
                cb = c + dc
                if rb < 0 or rb >= H or cb < 0 or cb >= W or blocked[rb, cb]:
                    continue
                cost, _, _, _, _, _ = edge_terms(z, rough_n, haz, dose_h, sci, r, c, rb, cb, cell, P)
                if np.isfinite(cost):
                    per_m = cost / (cell * np.sqrt(dr * dr + dc * dc))
                    if per_m < best:
                        best = per_m
    return best


@njit(cache=True)
def _search(z, rough_n, haz, dose_h, sci, blocked, cell, P, sr, sc, gr, gc, hscale):
    H, W = z.shape
    n = H * W
    g = np.full(n, np.inf)
    parent = np.full(n, -1, dtype=np.int64)
    closed = np.zeros(n, dtype=np.bool_)
    s = sr * W + sc
    t = gr * W + gc
    g[s] = 0.0
    heap = [(hscale * np.sqrt((sr - gr) ** 2 + (sc - gc) ** 2), s)]
    expanded = 0
    while len(heap) > 0:
        _, u = heapq.heappop(heap)
        if closed[u]:
            continue
        if u == t:
            break
        closed[u] = True
        expanded += 1
        ru = u // W
        cu = u - ru * W
        for k in range(16):
            dr = OFFSETS[k, 0]
            dc = OFFSETS[k, 1]
            rv = ru + dr
            cv = cu + dc
            if rv < 0 or rv >= H or cv < 0 or cv >= W:
                continue
            if blocked[rv, cv] or _crossed_blocked(blocked, ru, cu, dr, dc):
                continue
            v = rv * W + cv
            if closed[v]:
                continue
            cost, _, _, _, _, _ = edge_terms(z, rough_n, haz, dose_h, sci, ru, cu, rv, cv, cell, P)
            if not np.isfinite(cost):
                continue
            ng = g[u] + cost
            if ng < g[v]:
                g[v] = ng
                parent[v] = u
                heapq.heappush(heap, (ng + hscale * np.sqrt((rv - gr) ** 2 + (cv - gc) ** 2), v))
    return g[t], parent, expanded


def _reconstruct(parent: np.ndarray, W: int, start: int, goal: int) -> list[tuple[int, int]]:
    path = [goal]
    while path[-1] != start:
        p = int(parent[path[-1]])
        if p < 0:
            raise NoPathError("broken parent chain")
        path.append(p)
    path.reverse()
    return [(i // W, i % W) for i in path]


def search(layers: dict, cell: float, P: np.ndarray, start: tuple[int, int], goal: tuple[int, int],
           heuristic: bool = True, c_min: float | None = None) -> tuple[list[tuple[int, int]], float, int]:
    """F28 — A* (heuristic=True) or Dijkstra (False). Returns (cells path, total cost, expanded nodes)."""
    z, rn, hz, dose, sci, blocked = (layers[k] for k in ("z", "rough_n", "haz", "dose_h", "sci", "blocked"))
    H, W = z.shape
    for r, c in (start, goal):
        if not (0 <= r < H and 0 <= c < W):
            raise NoPathError(f"cell {(r, c)} is outside the grid {H}x{W}")
        if blocked[r, c]:
            raise NoPathError(f"cell {(r, c)} is impassable (slope, step or no data)")
    hscale = 0.0
    if heuristic:
        cm = min_cost_per_metre(z, rn, hz, dose, sci, blocked, cell, P) if c_min is None else c_min
        hscale = cm * cell if np.isfinite(cm) else 0.0
    cost, parent, expanded = _search(z, rn, hz, dose, sci, blocked, cell, P, start[0], start[1], goal[0], goal[1], hscale)
    if not np.isfinite(cost):
        raise NoPathError("no feasible route between the points under the hard constraints")
    s, t = start[0] * W + start[1], goal[0] * W + goal[1]
    return _reconstruct(parent, W, s, t), float(cost), int(expanded)


def path_terms(layers: dict, cell: float, P: np.ndarray, path: list[tuple[int, int]]) -> np.ndarray:
    """Per-edge terms along a path: rows of (cost, tau, energy, dose, hazard, science)."""
    out = np.zeros((max(len(path) - 1, 0), 6))
    z, rn, hz, dose, sci = (layers[k] for k in ("z", "rough_n", "haz", "dose_h", "sci"))
    for k in range(len(path) - 1):
        (ra, ca), (rb, cb) = path[k], path[k + 1]
        out[k] = edge_terms(z, rn, hz, dose, sci, ra, ca, rb, cb, cell, P)
    return out
