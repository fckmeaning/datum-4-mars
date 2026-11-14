"""F34 return field and F35 EVA reserve check.

The return field gives, for every cell, the fastest walking time back to the base together with the energy and dose
accumulated along that return path (reverse Dijkstra on the traversal time; ASSUMPTION: the way back is the time-optimal
one). F35 then checks along a route that the remaining time and oxygen still cover the return plus the reserve.
"""

from __future__ import annotations

import heapq

import numpy as np
from numba import njit
from numpy.typing import NDArray

from marsnav.routing.astar import OFFSETS, _crossed_blocked, edge_terms
from marsnav.routing.mobility import o2_use


@njit(cache=True)
def _return_field(z, rough_n, haz, dose_h, sci, blocked, cell, P, br, bc):
    H, W = z.shape
    n = H * W
    T = np.full(n, np.inf)
    E = np.zeros(n)
    D = np.zeros(n)
    closed = np.zeros(n, dtype=np.bool_)
    b = br * W + bc
    T[b] = 0.0
    heap = [(0.0, b)]
    while len(heap) > 0:
        _, v = heapq.heappop(heap)
        if closed[v]:
            continue
        closed[v] = True
        rv = v // W
        cv = v - rv * W
        for k in range(16):
            dr = OFFSETS[k, 0]
            dc = OFFSETS[k, 1]
            ru = rv - dr  # forward move u -> v is the offset (dr, dc)
            cu = cv - dc
            if ru < 0 or ru >= H or cu < 0 or cu >= W:
                continue
            if blocked[ru, cu] or blocked[rv, cv] or _crossed_blocked(blocked, ru, cu, dr, dc):
                continue
            u = ru * W + cu
            if closed[u]:
                continue
            cost, tau, en, dose, _, _ = edge_terms(z, rough_n, haz, dose_h, sci, ru, cu, rv, cv, cell, P)
            if not np.isfinite(cost):
                continue
            nt = T[v] + tau
            if nt < T[u]:
                T[u] = nt
                E[u] = E[v] + en
                D[u] = D[v] + dose
                heapq.heappush(heap, (nt, u))
    return T.reshape(H, W), E.reshape(H, W), D.reshape(H, W)


def return_field(arrays: dict, cell: float, P: NDArray, base_rc: tuple[int, int]) -> dict[str, NDArray]:
    """F34 — fastest return time [s], energy [J] and dose [mSv] from every cell to the base cell."""
    z, rn, hz, dose, sci, blocked = (arrays[k] for k in ("z", "rough_n", "haz", "dose_h", "sci", "blocked"))
    T, E, D = _return_field(z, rn, hz, dose, sci, blocked, cell, P, int(base_rc[0]), int(base_rc[1]))
    return {"time_s": T, "energy_J": E, "dose_mSv": D}


def eva_margin(ret: dict[str, NDArray], rr: NDArray, cc: NDArray, t_cum: NDArray, e_cum: NDArray, astro,
               mass_astronaut: float | None = None) -> dict:
    """F35 — resource margin along a route (cells rr, cc; cumulative time/energy at each vertex).

    margin_k = min( (usable_time − t_k − t_back_k)/EVA_max , (usable_O2 − O2_k − O2_back_k)/O2_capacity ), where usable = budget·(1 − reserve).
    Negative margin = the crew could not get back with the reserve intact; ``first_violation`` is the first such vertex index.
    """
    m = astro.mass_astronaut if mass_astronaut is None else mass_astronaut
    t_back = ret["time_s"][rr, cc]
    e_back = ret["energy_J"][rr, cc]
    reachable = np.isfinite(t_back)
    t_back = np.where(reachable, t_back, 0.0)
    keep = 1.0 - astro.reserve_fraction
    m_time = (astro.eva_max_s * keep - t_cum - t_back) / astro.eva_max_s
    o2_out = o2_use(e_cum, t_cum, m)
    o2_back = o2_use(np.where(reachable, e_back, 0.0), t_back, m)
    m_o2 = (astro.o2_capacity_l * keep - o2_out - o2_back) / astro.o2_capacity_l
    margin = np.where(reachable, np.minimum(m_time, m_o2), -np.inf)
    bad = np.flatnonzero(margin < 0)
    limiting = "oxygen" if (m_o2 < m_time).any() and bool(np.argmin(margin) == np.argmin(m_o2)) else "time"
    return {"margin": float(np.min(margin)) if np.isfinite(np.min(margin)) else -1.0,
            "first_violation": int(bad[0]) if bad.size else None, "limiting": limiting,
            "unreachable": bool((~reachable).any())}
