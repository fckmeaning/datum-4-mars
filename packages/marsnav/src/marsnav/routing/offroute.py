"""F53 — distance to the active route, progress along it and the reroute trigger."""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray

from marsnav.config import param


def off_route(route_xy: ArrayLike, pos_xy: ArrayLike, recent_distances_m: list[float] | None = None,
              d_off_m: float | None = None, k_off: int | None = None) -> dict:
    """F53 — minimum distance from a position to a polyline (AOI metres), arc length to the nearest point, and whether the
    position has been farther than d_off for k consecutive fixes (``recent_distances_m`` holds earlier fixes, newest last)."""
    d_off = float(param("navigation.d_off_m")) if d_off_m is None else d_off_m
    k = int(param("navigation.k_off")) if k_off is None else k_off
    P = np.asarray(route_xy, dtype=float)
    if P.ndim != 2 or P.shape[0] < 2 or P.shape[1] != 2:
        raise ValueError("route_xy must be an (n >= 2, 2) array of AOI metres")
    p = np.asarray(pos_xy, dtype=float)
    a, b = P[:-1], P[1:]
    ab = b - a
    seg_len = np.hypot(ab[:, 0], ab[:, 1])
    denom = np.where(seg_len > 0, seg_len**2, 1.0)
    t = np.clip(np.einsum("ij,ij->i", p - a, ab) / denom, 0.0, 1.0)
    t = np.where(seg_len > 0, t, 0.0)
    proj = a + t[:, None] * ab
    dist = np.hypot(*(p - proj).T)
    j = int(np.argmin(dist))
    arc = float(np.sum(seg_len[:j]) + t[j] * seg_len[j])
    total = float(np.sum(seg_len))
    d = float(dist[j])
    history = [*(recent_distances_m or []), d][-k:]
    reroute = len(history) >= k and all(x > d_off for x in history)
    return {"distance_m": d, "progress_m": arc, "progress_fraction": arc / total if total > 0 else 0.0,
            "nearest_xy": proj[j].tolist(), "reroute": bool(reroute)}


def nearest_point_xy(route_xy: ArrayLike, pos_xy: ArrayLike) -> NDArray:
    return np.asarray(off_route(route_xy, pos_xy)["nearest_xy"])
