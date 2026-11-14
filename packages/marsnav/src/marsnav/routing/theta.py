"""F29 — Theta* any-angle search on the route grid.

A* (astar.py) moves between 16 neighbour cells, so its paths are staircase-like. Theta* keeps a parent pointer per cell and,
whenever the straight segment from the parent of the expanded cell to a neighbour is free, links the neighbour to that
parent directly (any-angle edge).

Rules shared with F28 (so the two planners agree on what is passable):
* a segment is free only if every cell it passes through is passable and a diagonal pass through an exact cell corner is
  blocked when either side cell is blocked (no corner cutting; for the 16 neighbour moves this is exactly the F28 test);
* the cost of a segment is the F27 cost accumulated along the straight line: the line is cut into sub-steps of at most
  one cell, elevation and the cost layers are interpolated bilinearly between cell centres, and each sub-step is priced
  with the same formulas as ``edge_terms`` (hard grade limit included). For the 16 neighbour moves the cost is
  ``edge_terms`` itself, so A* and Theta* price identical edges identically.

Guarantee (tested): with the A* heuristic h = c_min·euclid, which is consistent on the 16-neighbour graph, every cell is
closed with a cost not larger than its optimal 16-neighbour (A*) cost, because the plain graph relaxation is always
evaluated in addition to the any-angle one. So ``theta_star`` never returns a more expensive route than ``search``.
Theta* is not optimal among all any-angle paths.
"""

from __future__ import annotations

import heapq

import numpy as np
from numba import njit
from numpy.typing import NDArray

from marsnav.routing import astar as K
from marsnav.routing.astar import OFFSETS, NoPathError, _crossed_blocked, edge_terms, min_cost_per_metre


@njit(cache=True)
def line_of_sight(blocked, r0, c0, r1, c1):
    """F29 — True if the straight segment between two cell centres crosses only passable cells (integer supercover walk).

    An exact pass through a cell corner moves diagonally and requires both side cells to be passable (no corner cutting).
    """
    dr = r1 - r0
    dc = c1 - c0
    nr = abs(dr)
    nc = abs(dc)
    sr = 1 if dr > 0 else -1
    sc = 1 if dc > 0 else -1
    r = r0
    c = c0
    ir = 0
    ic = 0
    while ir < nr or ic < nc:
        decision = (1 + 2 * ic) * nr - (1 + 2 * ir) * nc
        if decision == 0:
            if blocked[r + sr, c] or blocked[r, c + sc]:
                return False
            r += sr
            c += sc
            ir += 1
            ic += 1
        elif decision < 0:
            c += sc
            ic += 1
        else:
            r += sr
            ir += 1
        if blocked[r, c]:
            return False
    return True


@njit(cache=True)
def _sample(a, r, c):
    """Bilinear sample of a cell-centre raster at fractional (row, col); exact at integer positions."""
    H, W = a.shape
    r0 = min(max(int(np.floor(r)), 0), H - 1)
    c0 = min(max(int(np.floor(c)), 0), W - 1)
    r1 = min(r0 + 1, H - 1)
    c1 = min(c0 + 1, W - 1)
    fr = min(max(r - r0, 0.0), 1.0)
    fc = min(max(c - c0, 0.0), 1.0)
    top = a[r0, c0] * (1.0 - fc) + a[r0, c1] * fc
    bot = a[r1, c0] * (1.0 - fc) + a[r1, c1] * fc
    return top * (1.0 - fr) + bot * fr


@njit(cache=True)
def segment_terms(z, rough_n, haz, dose_h, sci, ra, ca, rb, cb, cell, P):
    """F29 — F27 terms (cost, tau_s, energy_J, dose_mSv, hazard_m, science) of the straight segment a→b.

    Same tuple as ``edge_terms``. Infinite cost when any sub-step exceeds the hard grade limit.
    """
    dr = rb - ra
    dc = cb - ca
    adr = abs(dr)
    adc = abs(dc)
    if (adr <= 1 and adc <= 1) or (adr == 1 and adc == 2) or (adr == 2 and adc == 1):
        return edge_terms(z, rough_n, haz, dose_h, sci, ra, ca, rb, cb, cell, P)
    cells = np.sqrt(float(dr * dr + dc * dc))
    n = int(np.ceil(cells - 1e-9))
    if n < 1:
        n = 1
    d = cell * cells / n
    za = _sample(z, float(ra), float(ca))
    rna = _sample(rough_n, float(ra), float(ca))
    hza = _sample(haz, float(ra), float(ca))
    dsa = _sample(dose_h, float(ra), float(ca))
    sca = _sample(sci, float(ra), float(ca))
    t_cost = 0.0
    t_tau = 0.0
    t_en = 0.0
    t_dose = 0.0
    t_hz = 0.0
    t_sci = 0.0
    for k in range(1, n + 1):
        f = k / n
        r = ra + dr * f
        c = ca + dc * f
        zb = _sample(z, r, c)
        rnb = _sample(rough_n, r, c)
        hzb = _sample(haz, r, c)
        dsb = _sample(dose_h, r, c)
        scb = _sample(sci, r, c)
        i = (zb - za) / d
        if abs(i) > P[K.P_GRADE_LIM]:
            return np.inf, 0.0, 0.0, 0.0, 0.0, 0.0
        rn = 0.5 * (rna + rnb)
        v = P[K.P_V_FLAT] * np.exp(-P[K.P_TOB_A] * abs(i + P[K.P_TOB_B])) / np.exp(-P[K.P_TOB_A] * P[K.P_TOB_B]) / (1.0 + P[K.P_K_R] * rn)
        tau = d / v
        cc = ((((P[K.P_C5] * i + P[K.P_C4]) * i + P[K.P_C3]) * i + P[K.P_C2]) * i + P[K.P_C1]) * i + P[K.P_C0]
        energy = P[K.P_M_TOT] * d * (P[K.P_C0] * P[K.P_S_SUIT] + (cc - P[K.P_C0]) * P[K.P_G_RATIO])
        dose = 0.5 * (dsa + dsb) * tau / 3600.0
        hz = d * 0.5 * (hza + hzb)
        s = 0.5 * (sca + scb)
        cost = (P[K.P_W_TAU] * tau / P[K.P_TAU_REF] + P[K.P_W_E] * energy / P[K.P_E_REF]
                + P[K.P_W_D] * dose / P[K.P_D_REF] + P[K.P_W_H] * hz / P[K.P_HZ_REF]) * (1.0 - P[K.P_ALPHA] * s)
        t_cost += cost
        t_tau += tau
        t_en += energy
        t_dose += dose
        t_hz += hz
        t_sci += s
        za = zb
        rna = rnb
        hza = hzb
        dsa = dsb
        sca = scb
    return t_cost, t_tau, t_en, t_dose, t_hz, t_sci / n


def cost_lower_bound_per_m(P: NDArray) -> float:
    """Lower bound of the F27 cost per metre over every admissible grade (zero hazard, dose and roughness, full science bonus).

    Used only to skip any-angle candidates that cannot improve a cell; a valid bound for sub-steps with any interpolated grade.
    """
    lim = float(min(P[K.P_GRADE_LIM], 5.0))
    i = np.linspace(-lim, lim, 2001)
    a, b = P[K.P_TOB_A], P[K.P_TOB_B]
    v = P[K.P_V_FLAT] * np.exp(-a * np.abs(i + b)) / np.exp(-a * b)
    cc = np.polyval(P[K.P_C5:K.P_C0 + 1], i)
    en = P[K.P_M_TOT] * (P[K.P_C0] * P[K.P_S_SUIT] + (cc - P[K.P_C0]) * P[K.P_G_RATIO])
    base = P[K.P_W_TAU] * (1.0 / v) / P[K.P_TAU_REF] + P[K.P_W_E] * en / P[K.P_E_REF]
    return float(max(float(base.min()), 0.0) * (1.0 - P[K.P_ALPHA]) * (1.0 - 1e-9))


@njit(cache=True)
def _theta_search(z, rough_n, haz, dose_h, sci, blocked, cell, P, sr, sc, gr, gc, hscale, lb_cell):
    H, W = z.shape
    n = H * W
    g = np.full(n, np.inf)
    parent = np.full(n, -1, dtype=np.int64)
    closed = np.zeros(n, dtype=np.bool_)
    s = sr * W + sc
    t = gr * W + gc
    g[s] = 0.0
    parent[s] = s
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
        pu = parent[u]
        rp = pu // W
        cp = pu - rp * W
        for k in range(16):
            dr = OFFSETS[k, 0]
            dc = OFFSETS[k, 1]
            rv = ru + dr
            cv = cu + dc
            if rv < 0 or rv >= H or cv < 0 or cv >= W:
                continue
            if blocked[rv, cv]:
                continue
            v = rv * W + cv
            if closed[v]:
                continue
            h = hscale * np.sqrt((rv - gr) ** 2 + (cv - gc) ** 2)
            # (a) plain graph edge u -> v, priced exactly like A*
            if not _crossed_blocked(blocked, ru, cu, dr, dc):
                cost, _, _, _, _, _ = edge_terms(z, rough_n, haz, dose_h, sci, ru, cu, rv, cv, cell, P)
                if np.isfinite(cost):
                    ng = g[u] + cost
                    if ng < g[v]:
                        g[v] = ng
                        parent[v] = u
                        heapq.heappush(heap, (ng + h, v))
            # (b) any-angle edge parent(u) -> v
            if pu != u:
                d2 = float((rv - rp) ** 2 + (cv - cp) ** 2)
                if g[pu] + lb_cell * np.sqrt(d2) < g[v] and line_of_sight(blocked, rp, cp, rv, cv):
                    cost, _, _, _, _, _ = segment_terms(z, rough_n, haz, dose_h, sci, rp, cp, rv, cv, cell, P)
                    if np.isfinite(cost):
                        ng = g[pu] + cost
                        if ng < g[v]:
                            g[v] = ng
                            parent[v] = pu
                            heapq.heappush(heap, (ng + h, v))
    return g[t], parent, expanded


def _reconstruct(parent: NDArray, W: int, start: int, goal: int) -> list[tuple[int, int]]:
    path = [goal]
    while path[-1] != start:
        p = int(parent[path[-1]])
        if p < 0:
            raise NoPathError("broken parent chain")
        path.append(p)
    path.reverse()
    return [(i // W, i % W) for i in path]


def theta_star(layers: dict, cell: float, P: NDArray, start: tuple[int, int], goal: tuple[int, int],
               c_min: float | None = None) -> tuple[list[tuple[int, int]], float, int]:
    """F29 — Theta* any-angle route. Returns (vertex cells of the polyline, total cost, expanded nodes).

    ``layers`` and ``P`` are the same arrays/parameter vector as for ``astar.search``. Consecutive vertices are joined by
    straight segments that cross only passable cells; price them with ``theta_path_terms``, not ``path_terms``.
    Raises ``NoPathError`` exactly when ``search`` would.
    """
    z, rn, hz, dose, sci, blocked = (layers[k] for k in ("z", "rough_n", "haz", "dose_h", "sci", "blocked"))
    H, W = z.shape
    for r, c in (start, goal):
        if not (0 <= r < H and 0 <= c < W):
            raise NoPathError(f"cell {(r, c)} is outside the grid {H}x{W}")
        if blocked[r, c]:
            raise NoPathError(f"cell {(r, c)} is impassable (slope, step or no data)")
    cm = min_cost_per_metre(z, rn, hz, dose, sci, blocked, cell, P) if c_min is None else c_min
    hscale = cm * cell if np.isfinite(cm) else 0.0
    lb_cell = cost_lower_bound_per_m(P) * cell
    cost, parent, expanded = _theta_search(z, rn, hz, dose, sci, blocked, cell, P, start[0], start[1], goal[0], goal[1], hscale, lb_cell)
    if not np.isfinite(cost):
        raise NoPathError("no feasible route between the points under the hard constraints")
    return _reconstruct(parent, W, start[0] * W + start[1], goal[0] * W + goal[1]), float(cost), int(expanded)


def theta_path_terms(layers: dict, cell: float, P: NDArray, path: list[tuple[int, int]]) -> NDArray:
    """Per-leg terms of a Theta* polyline: rows of (cost, tau, energy, dose, hazard, science), one per straight segment."""
    out = np.zeros((max(len(path) - 1, 0), 6))
    z, rn, hz, dose, sci = (layers[k] for k in ("z", "rough_n", "haz", "dose_h", "sci"))
    for k in range(len(path) - 1):
        (ra, ca), (rb, cb) = path[k], path[k + 1]
        out[k] = segment_terms(z, rn, hz, dose, sci, ra, ca, rb, cb, cell, P)
    return out


def polyline_length_m(path: list[tuple[int, int]], cell: float) -> float:
    """Euclidean length [m] of a polyline given by cell vertices."""
    return float(sum(cell * np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(path[:-1], path[1:], strict=True)))
