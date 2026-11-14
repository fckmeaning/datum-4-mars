"""Terrain analysis on AOI grids (F05–F09, F48).

Grid convention: 2-D array, row 0 is the NORTH edge, column 0 the WEST edge, square cells of size ``cell`` metres.
x grows east with the column index, y grows north as the row index decreases. NaN = no data (propagates).
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from marsnav.geodesy import curvature_drop


def _gradients_horn(dem: NDArray, cell: float) -> tuple[NDArray, NDArray]:
    z = np.pad(np.asarray(dem, dtype=float), 1, mode="edge")
    a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    d, f = z[1:-1, :-2], z[1:-1, 2:]
    g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    p = ((c + 2 * f + i) - (a + 2 * d + g)) / (8.0 * cell)  # dz/dx, east positive
    q = ((a + 2 * b + c) - (g + 2 * h + i)) / (8.0 * cell)  # dz/dy, north positive
    return p, q


def slope_aspect_horn(dem: NDArray, cell: float) -> tuple[NDArray, NDArray]:
    """F05 — slope θ [rad] and aspect [rad, clockwise from north, direction of steepest DESCENT] (Horn 1981)."""
    p, q = _gradients_horn(dem, cell)
    slope = np.arctan(np.hypot(p, q))
    aspect = np.mod(np.arctan2(-p, -q), 2 * np.pi)
    return slope, aspect


def gradient_xy(dem: NDArray, cell: float) -> tuple[NDArray, NDArray]:
    """Horn gradient (dz/dx east, dz/dy north) — used for directional grades along edges."""
    return _gradients_horn(dem, cell)


def roughness(dem: NDArray, cell: float, k: int = 5) -> NDArray:
    """F06 — RMS of residuals after a least-squares plane fit in a k×k window [m] (k odd, window scale k·cell)."""
    if k < 3 or k % 2 == 0:
        raise ValueError("k must be an odd integer >= 3")
    z = np.asarray(dem, dtype=float)
    r = k // 2
    off = np.arange(-r, r + 1, dtype=float)
    ones = np.ones((k, k))
    kx = np.tile(off, (k, 1))  # x offset (east) per window cell
    ky = -np.tile(off[:, None], (1, k))  # y offset (north) per window cell
    n = k * k
    s_z = ndimage.correlate(z, ones, mode="nearest")
    s_z2 = ndimage.correlate(z * z, ones, mode="nearest")
    s_zx = ndimage.correlate(z, kx, mode="nearest")
    s_zy = ndimage.correlate(z, ky, mode="nearest")
    sxx = float(np.sum(kx * kx))
    ss_res = s_z2 - s_z * s_z / n - s_zx * s_zx / sxx - s_zy * s_zy / sxx
    return np.sqrt(np.clip(ss_res, 0.0, None) / n)


def ray_distances(cell: float, r_max: float, growth: float = 1.12) -> NDArray:
    """Sampling distances along a horizon ray: one-cell steps near the point, then geometric growth up to r_max."""
    d, out = cell, []
    while d <= r_max:
        out.append(d)
        d = d + cell if d < 8 * cell else d * growth
    return np.asarray(out)


def horizon_profile(dem: NDArray, cell: float, row: float, col: float, n_az: int = 72,
                    r_max: float = 20000.0, observer_height: float = 1.7) -> NDArray:
    """F07 — horizon elevation angle h(φ) [rad] at a point for n_az azimuths (φ_k = k·360/n_az, clockwise from north).

    Bilinear sampling along rays, curvature correction (F04), angles clipped at 0 (open horizon).
    """
    z = np.asarray(dem, dtype=float)
    z0 = ndimage.map_coordinates(z, [[row], [col]], order=1, mode="nearest")[0] + observer_height
    d = ray_distances(cell, r_max)
    az = np.radians(np.arange(n_az) * 360.0 / n_az)
    rr = row - np.outer(np.cos(az), d) / cell
    cc = col + np.outer(np.sin(az), d) / cell
    inside = (rr >= 0) & (rr <= z.shape[0] - 1) & (cc >= 0) & (cc <= z.shape[1] - 1)
    zs = ndimage.map_coordinates(z, [rr.ravel(), cc.ravel()], order=1, mode="nearest").reshape(rr.shape)
    ang = np.arctan2(zs - z0 - curvature_drop(d)[None, :], d[None, :])
    ang = np.where(inside & np.isfinite(ang), ang, -np.inf)
    return np.clip(np.max(ang, axis=1), 0.0, None)


def horizon_grid(dem: NDArray, cell: float, azimuth_deg: float, r_max: float = 20000.0,
                 observer_height: float = 1.7) -> NDArray:
    """Horizon angle [rad] toward one azimuth for every cell (integer-offset ray marching, fast; used by F08/F15)."""
    z = np.asarray(dem, dtype=float)
    H, W = z.shape
    az = np.radians(azimuth_deg)
    best = np.zeros((H, W))
    zobs = z + observer_height
    for d in ray_distances(cell, r_max):
        di = int(round(-np.cos(az) * d / cell))
        dj = int(round(np.sin(az) * d / cell))
        if abs(di) >= H or abs(dj) >= W:
            break
        shifted = np.full((H, W), -np.inf)
        src = z[max(di, 0):H + min(di, 0), max(dj, 0):W + min(dj, 0)]
        shifted[max(-di, 0):H + min(-di, 0), max(-dj, 0):W + min(-dj, 0)] = src
        dist = cell * np.hypot(di, dj)
        if dist == 0:
            continue
        ang = np.arctan2(shifted - zobs - curvature_drop(dist), dist)
        np.maximum(best, np.where(np.isfinite(ang), ang, 0.0), out=best)
    return best


def sky_fraction(h: NDArray, n: float = 0.0) -> NDArray:
    """F08 — weighted visible-sky fraction from horizon angles h [rad] over the LAST axis (azimuths).

    Weight w(e) = sin^n(e): per azimuth the visible share is 1 − sin^(n+1)(h); n = 0 gives the geometric solid-angle
    fraction (1/2π)∫(1 − sin h)dφ.
    """
    h = np.clip(np.asarray(h, dtype=float), 0.0, np.pi / 2)
    return np.mean(1.0 - np.sin(h) ** (n + 1.0), axis=-1)


def sky_fraction_grid(dem: NDArray, cell: float, n_az: int = 36, n: float = 0.0, r_max: float = 20000.0) -> NDArray:
    """F08 over a whole grid: accumulates 1 − sin^(n+1)(h) for n_az azimuths."""
    acc = np.zeros(np.shape(dem))
    for k in range(n_az):
        h = horizon_grid(dem, cell, k * 360.0 / n_az, r_max)
        acc += 1.0 - np.sin(np.clip(h, 0.0, np.pi / 2)) ** (n + 1.0)
    return acc / n_az


def aggregate_hazard(fine_dem: NDArray, fine_cell: float, factor: int) -> dict[str, NDArray]:
    """F09 — fine-grid hazards aggregated to a coarse routing grid (block = factor×factor fine cells).

    Returns p95 slope [deg], max step between 4-neighbours [m] and max roughness [m] per coarse cell.
    """
    z = np.asarray(fine_dem, dtype=float)
    H, W = (z.shape[0] // factor) * factor, (z.shape[1] // factor) * factor
    z = z[:H, :W]
    slope, _ = slope_aspect_horn(z, fine_cell)
    step = np.zeros_like(z)
    step[:, :-1] = np.maximum(step[:, :-1], np.abs(np.diff(z, axis=1)))
    step[:-1, :] = np.maximum(step[:-1, :], np.abs(np.diff(z, axis=0)))
    rough = roughness(z, fine_cell, 3)

    def blocks(a: NDArray) -> NDArray:
        return a.reshape(H // factor, factor, W // factor, factor).transpose(0, 2, 1, 3).reshape(H // factor, W // factor, -1)

    return {
        "slope_p95_deg": np.degrees(np.nanpercentile(blocks(slope), 95, axis=-1)),
        "step_max_m": np.nanmax(blocks(step), axis=-1),
        "roughness_max_m": np.nanmax(blocks(rough), axis=-1),
    }


def hillshade(dem: NDArray, cell: float, sun_azimuth_deg: float, sun_elevation_deg: float) -> NDArray:
    """F48 — relative illumination max(cos i, 0) of each cell for a sun direction (no cast shadows)."""
    slope, aspect = slope_aspect_horn(dem, cell)
    e, A = np.radians(sun_elevation_deg), np.radians(sun_azimuth_deg)
    return np.clip(np.cos(slope) * np.sin(e) + np.sin(slope) * np.cos(e) * np.cos(A - aspect), 0.0, None)
