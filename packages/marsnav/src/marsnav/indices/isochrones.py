"""Reachability isochrones: lines of equal fastest walking time back to the base (F34 return field), as GeoJSON in lon/lat.

The time field comes from the existing return field (reverse Dijkstra on the walking traversal time, hard slope/step limits respected);
the contouring is a small NumPy marching-squares, so no extra dependency is needed.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

import numpy as np
from numpy.typing import NDArray

DEFAULT_MINUTES = (15, 30, 60, 90, 120)

# marching squares: corners a(r,c) b(r,c+1) c(r+1,c+1) d(r+1,c); edges 0 top (a-b), 1 right (b-c), 2 bottom (d-c), 3 left (a-d)
_CASES: dict[int, list[tuple[int, int]]] = {
    1: [(3, 0)], 2: [(0, 1)], 3: [(3, 1)], 4: [(1, 2)], 6: [(0, 2)], 7: [(3, 2)], 8: [(3, 2)], 9: [(0, 2)],
    11: [(1, 2)], 12: [(3, 1)], 13: [(0, 1)], 14: [(3, 0)],
}


def _edge_key(edge: int, r: NDArray, c: NDArray, width: int) -> NDArray:
    """Unique id of the grid edge: horizontal edges (between (r,c) and (r,c+1)) are even, vertical ones odd."""
    if edge == 0:
        return 2 * (r * width + c)
    if edge == 2:
        return 2 * ((r + 1) * width + c)
    if edge == 1:
        return 2 * (r * width + c + 1) + 1
    return 2 * (r * width + c) + 1


def _edge_point(f: NDArray, level: float, edge: int, r: NDArray, c: NDArray) -> NDArray:
    """(row, col) of the level crossing on an edge by linear interpolation; shape (n, 2)."""
    if edge == 0:
        a, b = f[r, c], f[r, c + 1]
        return np.column_stack([r.astype(float), c + (level - a) / (b - a)])
    if edge == 2:
        a, b = f[r + 1, c], f[r + 1, c + 1]
        return np.column_stack([(r + 1).astype(float), c + (level - a) / (b - a)])
    if edge == 1:
        a, b = f[r, c + 1], f[r + 1, c + 1]
        return np.column_stack([r + (level - a) / (b - a), (c + 1).astype(float)])
    a, b = f[r, c], f[r + 1, c]
    return np.column_stack([r + (level - a) / (b - a), c.astype(float)])


def contour_lines(field: NDArray, level: float) -> list[NDArray]:
    """Contour polylines of ``field`` at ``level`` as arrays of (row, col) float index coordinates (closed lines repeat their first point).

    ``field`` must be finite everywhere. Saddles are resolved with the mean of the four corners.
    """
    f = np.asarray(field, dtype=float)
    if f.ndim != 2 or min(f.shape) < 2:
        raise ValueError("field must be 2-D with at least 2 x 2 samples")
    if not np.isfinite(f).all():
        raise ValueError("field must be finite (replace unreachable cells before contouring)")
    h, w = f.shape
    ia, ib, ic, idd = f[:-1, :-1] >= level, f[:-1, 1:] >= level, f[1:, 1:] >= level, f[1:, :-1] >= level
    code = ia * 1 + ib * 2 + ic * 4 + idd * 8
    centre = 0.25 * (f[:-1, :-1] + f[:-1, 1:] + f[1:, 1:] + f[1:, :-1]) >= level

    seg_keys: list[tuple[NDArray, NDArray]] = []
    seg_pts: list[tuple[NDArray, NDArray]] = []

    def add(rr: NDArray, cc: NDArray, e0: int, e1: int) -> None:
        if len(rr):
            seg_keys.append((_edge_key(e0, rr, cc, w), _edge_key(e1, rr, cc, w)))
            seg_pts.append((_edge_point(f, level, e0, rr, cc), _edge_point(f, level, e1, rr, cc)))

    for case, pairs in _CASES.items():
        rr, cc = np.nonzero(code == case)
        for e0, e1 in pairs:
            add(rr, cc, e0, e1)
    for case, inside_pairs, outside_pairs in ((5, [(1, 0), (3, 2)], [(3, 0), (1, 2)]), (10, [(3, 0), (1, 2)], [(1, 0), (3, 2)])):
        for mask, pairs in ((code == case) & centre, inside_pairs), ((code == case) & ~centre, outside_pairs):
            rr, cc = np.nonzero(mask)
            for e0, e1 in pairs:
                add(rr, cc, e0, e1)
    if not seg_keys:
        return []

    k0 = np.concatenate([k[0] for k in seg_keys])
    k1 = np.concatenate([k[1] for k in seg_keys])
    p0 = np.concatenate([p[0] for p in seg_pts])
    p1 = np.concatenate([p[1] for p in seg_pts])
    coord: dict[int, NDArray] = {}
    for keys, pts in ((k0, p0), (k1, p1)):
        for key, pt in zip(keys.tolist(), pts, strict=True):
            coord.setdefault(key, pt)
    adj: dict[int, list[int]] = {}
    for i, (a, b) in enumerate(zip(k0.tolist(), k1.tolist(), strict=True)):
        adj.setdefault(a, []).append(i)
        adj.setdefault(b, []).append(i)
    used = np.zeros(len(k0), dtype=bool)
    ends = list(zip(k0.tolist(), k1.tolist(), strict=True))

    def walk(start_seg: int, first_key: int) -> list[int]:
        chain = [first_key]
        seg, key = start_seg, first_key
        while True:
            used[seg] = True
            a, b = ends[seg]
            nxt = b if a == key else a
            chain.append(nxt)
            cand = [s for s in adj[nxt] if not used[s]]
            if not cand:
                return chain
            seg, key = cand[0], nxt

    lines: list[NDArray] = []
    open_ends = [key for key, segs in adj.items() if len(segs) == 1]  # lines that run into the grid border start here
    for key in open_ends:
        seg = adj[key][0]
        if not used[seg]:
            lines.append(np.array([coord[k] for k in walk(seg, key)]))
    for i in range(len(ends)):  # whatever is left are closed loops
        if not used[i]:
            lines.append(np.array([coord[k] for k in walk(i, ends[i][0])]))
    return lines


def return_isochrones(grid, base_rc: tuple[int, int], minutes: Sequence[float] = DEFAULT_MINUTES, utc: str | None = None,  # noqa: ANN001
                      astronaut: dict | None = None, time_s: NDArray | None = None) -> dict:
    """Isochrones of the fastest walking time back to the base as a GeoJSON FeatureCollection (one MultiLineString per level).

    ``time_s`` lets a caller pass a precomputed return-time field (the F34 field does not depend on the departure time).
    """
    from marsnav.routing.cost import Astronaut, build_layers, pack_params, resolve_weights
    from marsnav.routing.returnfield import return_field

    levels = sorted({float(m) for m in minutes})
    if not levels or levels[0] <= 0:
        raise ValueError("minutes must be positive numbers")
    if time_s is None:
        astro = Astronaut.from_api(astronaut)
        layers = build_layers(grid, utc or datetime.now(UTC).isoformat().replace("+00:00", "Z"), astro)
        P = pack_params(resolve_weights("FASTEST"), astro)
        time_s = return_field(layers.arrays, grid.cell, P, base_rc)["time_s"]
    T = np.asarray(time_s, dtype=float)
    big = levels[-1] * 60.0 * 3.0
    Tf = np.where(np.isfinite(T), T, big)
    cell_km2 = (grid.cell / 1000.0) ** 2
    features = []
    for m in levels:
        lines = [ln for ln in contour_lines(Tf, m * 60.0) if len(ln) >= 4]
        coords = []
        for ln in lines:
            lat, lon = grid.rc_to_latlon(ln[:, 0], ln[:, 1])
            coords.append([[float(a), float(b)] for a, b in zip(lon, lat, strict=True)])
        reach = np.isfinite(T) & (T <= m * 60.0)
        label = f"{int(m)} min" if float(m).is_integer() else f"{m:g} min"
        features.append({"type": "Feature", "geometry": {"type": "MultiLineString", "coordinates": coords},
                         "properties": {"kind": "return_time_isochrone", "minutes": m, "label": label,
                                        "reachable_cells": int(reach.sum()), "reachable_km2": round(float(reach.sum()) * cell_km2, 3),
                                        "lines": len(coords)}})
    return {"type": "FeatureCollection", "features": features,
            "properties": {"title": "Return-time isochrones", "base": {"row": int(base_rc[0]), "col": int(base_rc[1])},
                           "walking_model": "fastest walking return (F34), hard slope/step limits respected; environment-independent time",
                           "level": getattr(grid, "level", None), "cell_m": float(grid.cell),
                           "simulated": bool(getattr(grid, "simulated", False)),
                           "coordinate_note": "WGS 84 does NOT apply: Mars, sphere R = 3396190 m, planetocentric latitude, east longitude"}}
