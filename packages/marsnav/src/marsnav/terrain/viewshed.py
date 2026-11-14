"""F10 — viewshed / radio line-of-sight on AOI grids.

Grid convention is the one of ``marsnav.terrain``: 2-D array, row 0 = NORTH edge, column 0 = WEST edge, square cells of
``cell`` metres, NaN = no data.

Method (ray fan with exact per-cell bookkeeping), chosen to avoid the aliasing of a "few rays x few samples" fan:

* ``n_rays`` rays leave the observer such that the arc spacing at the maximum radius is <= ``cell / oversample`` (default
  half a cell), so every in-range cell lies within ~0.35 cell of a ray sample;
* each ray is walked in steps of ``cell * step_fraction`` (default half a cell) with BILINEAR terrain sampling;
* along a ray the running maximum of the tangent of the terrain elevation angle (curvature drop d²/(2R), F04, subtracted)
  is kept; a sample is visible when the tangent to its ground + ``target_height`` reaches that maximum;
* every sample votes for its nearest cell. ``mode="center"`` (default) uses the verdict of the sample closest to the cell
  CENTRE (the DEM post), which is what the data actually describe; ``"conservative"`` (the safe side for radio links) calls a
  cell visible only if NO sample inside the cell was hidden, ``"optimistic"`` if ANY sample inside it was visible.

Shadow polylines are never built: visibility is a per-cell boolean, so a visible cell behind a shadowed one is never
swallowed by a "shadow segment".
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

import numpy as np
from numba import get_num_threads, njit, prange
from numpy.typing import NDArray

from marsnav.config import param

# ASSUMPTION (accuracy/performance trade-offs, not physical constants)
RAY_OVERSAMPLE = 2.0  # rays per cell of arc at the maximum radius
STEP_FRACTION = 0.5  # radial sample step as a fraction of a cell
TANGENT_EPS = 1e-12  # a cell exactly on the line of sight counts as visible
MAX_CHUNKS = 8  # parallel chunks (each owns a flag window); fewer for very large windows


@dataclass(frozen=True)
class Viewshed:
    """F10 result. All masks have the shape of the input DEM."""

    visible: NDArray[np.bool_]  # in range and in line of sight (observer cell included)
    shadow: NDArray[np.bool_]  # in range, data present, NOT in line of sight (radio shadow)
    in_range: NDArray[np.bool_]  # within max_radius_m of the observer
    no_data: NDArray[np.bool_]  # in range but unknown (DEM NaN or never sampled)
    observer_row: float
    observer_col: float
    observer_ground_m: float
    observer_height_m: float
    target_height_m: float
    max_radius_m: float
    n_rays: int
    step_m: float
    mode: str
    elapsed_s: float

    @property
    def visible_fraction(self) -> float:
        known = int(self.visible.sum() + self.shadow.sum())
        return float(self.visible.sum()) / known if known else 0.0


@njit(cache=True)
def _bilinear(dem, rr, cc):
    """Bilinear height at fractional (row, col); NaN if any corner is NaN."""
    H, W = dem.shape
    i0 = int(math.floor(rr))
    j0 = int(math.floor(cc))
    if i0 >= H - 1:
        i0 = H - 2
    if j0 >= W - 1:
        j0 = W - 2
    if i0 < 0:
        i0 = 0
    if j0 < 0:
        j0 = 0
    fy = rr - i0
    fx = cc - j0
    a = dem[i0, j0]
    b = dem[i0, j0 + 1]
    c = dem[i0 + 1, j0]
    d = dem[i0 + 1, j0 + 1]
    return (1 - fy) * ((1 - fx) * a + fx * b) + fy * ((1 - fx) * c + fx * d)


@njit(cache=True, parallel=True)
def _cast(dem, cell, r0, c0, z_obs, target_h, R, max_r, n_rays, step, far_start, far_growth, win_r0, win_c0, win_h, win_w, n_chunks):
    H, W = dem.shape
    flags = np.zeros((n_chunks, win_h, win_w), dtype=np.uint8)
    near_d = np.full((n_chunks, win_h, win_w), np.inf, dtype=np.float32)  # squared distance of the best sample to the cell centre
    near_v = np.zeros((n_chunks, win_h, win_w), dtype=np.uint8)  # its verdict (1 = visible)
    two_pi = 2.0 * math.pi
    for ch in prange(n_chunks):
        for k in range(ch, n_rays, n_chunks):
            az = two_pi * k / n_rays
            dr = -math.cos(az)  # north = decreasing row
            dc = math.sin(az)  # east = increasing column
            d = step
            cur = step
            best = -np.inf
            while d <= max_r:
                rr = r0 + dr * d / cell
                cc = c0 + dc * d / cell
                if rr < 0.0 or cc < 0.0 or rr > H - 1.0 or cc > W - 1.0:
                    break
                z = _bilinear(dem, rr, cc)
                if not np.isnan(z):
                    drop = d * d / (2.0 * R)
                    t_block = (z - drop - z_obs) / d
                    t_target = (z + target_h - drop - z_obs) / d
                    ri = int(rr + 0.5)
                    cj0 = int(cc + 0.5)
                    ci = ri - win_r0
                    cj = cj0 - win_c0
                    if 0 <= ci < win_h and 0 <= cj < win_w:
                        vis = t_target >= best - 1e-12
                        if vis:
                            flags[ch, ci, cj] |= 1
                        else:
                            flags[ch, ci, cj] |= 2
                        dd = (rr - ri) * (rr - ri) + (cc - cj0) * (cc - cj0)
                        if dd < near_d[ch, ci, cj]:
                            near_d[ch, ci, cj] = dd
                            near_v[ch, ci, cj] = 1 if vis else 0
                    if t_block > best:
                        best = t_block
                d += cur
                if far_growth > 0.0 and d > far_start:
                    cur = min(cur * (1.0 + far_growth), 8.0 * step)
    return flags, near_d, near_v


def xy_to_rowcol(x: float, y: float, shape: tuple[int, int], cell: float, x_west: float = 0.0, y_south: float = 0.0) -> tuple[float, float]:
    """Metres (x east, y north, origin at the SW corner cell centre ``(x_west, y_south)``) -> fractional (row, col)."""
    return (shape[0] - 1) - (y - y_south) / cell, (x - x_west) / cell


def viewshed(dem: NDArray, cell: float, row: float, col: float, observer_height: float = 2.0, target_height: float = 0.0,
             max_radius_m: float = 3000.0, mode: str = "center", observer_ground: float | None = None,
             far_start_m: float | None = None, far_step_growth: float = 0.0) -> Viewshed:
    """F10 — which cells can be seen from (row, col), standing ``observer_height`` m above the ground.

    ``target_height`` is the height of the thing being looked at (0 = the ground, e.g. 1.8 m for a person, a mast height
    for a relay). Curvature (F04) is applied. ``far_start_m`` / ``far_step_growth`` optionally lengthen the sample step
    beyond ``far_start_m`` (coarser far field, like F07); the default keeps the full-resolution step everywhere.
    """
    if mode not in ("center", "conservative", "optimistic"):
        raise ValueError("mode must be 'center', 'conservative' or 'optimistic'")
    z = np.ascontiguousarray(dem, dtype=np.float64)
    H, W = z.shape
    if not (0 <= row <= H - 1 and 0 <= col <= W - 1):
        raise ValueError("observer lies outside the DEM")
    if observer_ground is None:
        ground = float(_bilinear(z, float(row), float(col)))
        if not math.isfinite(ground):
            raise ValueError("DEM has no data at the observer")
    else:
        ground = float(observer_ground)
    t0 = time.perf_counter()
    R = float(param("constants.R_sphere"))
    rc = max_radius_m / cell
    n_rays = max(8, int(math.ceil(2.0 * math.pi * rc * RAY_OVERSAMPLE)))
    n_rays += (-n_rays) % 4  # multiple of 4: exact N/E/S/W rays
    step = cell * STEP_FRACTION
    lo_r, hi_r = max(0, int(math.floor(row - rc)) - 1), min(H - 1, int(math.ceil(row + rc)) + 1)
    lo_c, hi_c = max(0, int(math.floor(col - rc)) - 1), min(W - 1, int(math.ceil(col + rc)) + 1)
    wh, ww = hi_r - lo_r + 1, hi_c - lo_c + 1
    n_chunks = max(1, min(get_num_threads(), MAX_CHUNKS if wh * ww < 2_000_000 else 2 if wh * ww < 8_000_000 else 1))
    far_start = max_radius_m if far_start_m is None else float(far_start_m)
    flags, near_d, near_v = _cast(z, float(cell), float(row), float(col), ground + observer_height, float(target_height), R, float(max_radius_m),
                  n_rays, step, far_start, float(far_step_growth), lo_r, lo_c, wh, ww, n_chunks)
    f = np.bitwise_or.reduce(flags, axis=0)
    best = np.argmin(near_d, axis=0)[None]
    dmin = np.take_along_axis(near_d, best, axis=0)[0]
    centre_vote = np.take_along_axis(near_v, best, axis=0)[0] == 1
    del flags, near_d, near_v

    rr, cc = np.mgrid[lo_r:hi_r + 1, lo_c:hi_c + 1]
    rng = (rr - row) ** 2 + (cc - col) ** 2 <= rc * rc
    seen_vis, seen_hid = (f & 1) != 0, (f & 2) != 0
    vis = centre_vote if mode == "center" else (seen_vis & ~seen_hid if mode == "conservative" else seen_vis)
    obs = (np.abs(rr - round(row)) < 0.5) & (np.abs(cc - round(col)) < 0.5)
    vis |= obs & rng
    known = np.isfinite(dmin) | obs
    shd = rng & known & ~vis
    nod = rng & ~known

    def full(win: NDArray) -> NDArray:
        out = np.zeros((H, W), dtype=bool)
        out[lo_r:hi_r + 1, lo_c:hi_c + 1] = win
        return out

    in_range = full(rng)
    nan_dem = np.isnan(z)
    no_data = full(nod) | (in_range & nan_dem)
    return Viewshed(full(vis & rng), full(shd) & ~nan_dem, in_range, no_data, float(row), float(col), ground, float(observer_height),
                    float(target_height), float(max_radius_m), n_rays, step, mode, time.perf_counter() - t0)


def _block_max(dem: NDArray, f: int) -> NDArray:
    h, w = (dem.shape[0] // f) * f, (dem.shape[1] // f) * f
    blk = np.asarray(dem[:h, :w], dtype=np.float64).reshape(h // f, f, w // f, f)
    with np.errstate(all="ignore"):
        out = np.nanmax(blk, axis=(1, 3))  # max-pool: ridges survive coarsening, so the far field never leaks
    return out


def viewshed_multires(dem: NDArray, cell: float, row: float, col: float, observer_height: float = 2.0, target_height: float = 0.0,
                      max_radius_m: float = 10000.0, near_radius_m: float = 2000.0, factor: int = 4,
                      mode: str = "center") -> Viewshed:
    """F10 — coarse-then-fine viewshed for large radii: full resolution within ``near_radius_m``, a max-pooled DEM
    (block ``factor``) beyond it. The coarse field is up-sampled by repetition; the far field is conservative about ridges
    (block maximum) but cannot resolve hazards smaller than ``factor * cell``.
    """
    z = np.asarray(dem, dtype=np.float64)
    fine = viewshed(z, cell, row, col, observer_height, target_height, min(near_radius_m, max_radius_m), mode)
    if max_radius_m <= near_radius_m or factor <= 1:
        return fine
    t0 = time.perf_counter()
    H, W = z.shape
    coarse_dem = _block_max(z, factor)
    # observer in coarse coordinates: block (i, j) covers fine rows i*f..i*f+f-1, so its centre is at i*f + (f-1)/2
    crow, ccol = (row - (factor - 1) / 2.0) / factor, (col - (factor - 1) / 2.0) / factor
    crow, ccol = min(max(crow, 0.0), coarse_dem.shape[0] - 1.0), min(max(ccol, 0.0), coarse_dem.shape[1] - 1.0)
    far = viewshed(coarse_dem, cell * factor, crow, ccol, observer_height, target_height, max_radius_m, mode, observer_ground=fine.observer_ground_m)

    def up(a: NDArray) -> NDArray:
        out = np.zeros((H, W), dtype=bool)
        big = np.repeat(np.repeat(a, factor, axis=0), factor, axis=1)
        out[:big.shape[0], :big.shape[1]] = big
        return out

    rr, cc = np.mgrid[0:H, 0:W]
    near = (rr - row) ** 2 + (cc - col) ** 2 <= (near_radius_m / cell) ** 2
    in_range = (rr - row) ** 2 + (cc - col) ** 2 <= (max_radius_m / cell) ** 2
    vis = np.where(near, fine.visible, up(far.visible)) & in_range
    shd = np.where(near, fine.shadow, up(far.shadow)) & in_range & ~vis
    nod = np.where(near, fine.no_data, up(far.no_data)) & in_range & ~vis & ~shd
    return Viewshed(vis, shd, in_range, nod, float(row), float(col), fine.observer_ground_m, float(observer_height), float(target_height),
                    float(max_radius_m), fine.n_rays + far.n_rays, fine.step_m, mode, fine.elapsed_s + (time.perf_counter() - t0))
