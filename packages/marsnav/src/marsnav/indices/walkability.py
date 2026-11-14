"""F54 — walkability index W (0-100) for an astronaut on foot: W = 100·(a·S + b·R + c·D + d·U).

All four sub-scores are in [0, 1] with 1 = best:
  S  slope: 1 − logistic((θ − θ0)/s), the SAME curve as the routing hazard term (F25, ``hazard.theta0_deg``, ``hazard.s_deg``),
     rescaled so that a flat cell scores exactly 1.
  R  roughness: 1/(1 + r), r = F06 roughness / (``hazard.roughness_rel`` · window) (the routing's rough_n); r = 1 is the reference.
  D  obstacle density: share of "obstacle cells" in a window (a cell differing from the mean of its 8 neighbours by more than
     cell·tan(angle), or, when a finer DEM was aggregated into the grid, a cell whose largest step exceeds ``astronaut.step_max``)
     mapped linearly to 1 → 0 at ``obstacle_density_ref``.
  U  data certainty: 1/(1 + cell/ref) (coarser data is less certain) × (1 − share of no-data neighbours) × a factor for SIMULATED terrain.

LIMITS, stated plainly: boulders and steps smaller than the grid cell are NOT resolved (a 10 m cell cannot show a 1 m rock), so D and R
describe terrain texture at the cell scale, not individual hazards. A weighted sum cannot express a hard constraint (a smooth wall would
score well on R and D), therefore cells steeper than ``astronaut.theta_max_walk_deg`` or with a step above ``astronaut.step_max`` are
impassable for the planner and get W = 0 here as well.
Weights are ASSUMPTION values (``indices.walkability.*``) and are normalised to sum 1.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from scipy.special import expit

from marsnav.config import param
from marsnav.terrain import roughness, slope_aspect_horn

LIMITATION = ("Objects smaller than the grid cell (boulders, small steps) are not resolved: roughness and obstacle density describe terrain "
              "texture at the cell scale only. Weights are assumptions. Cells above the walking slope limit are impassable (W = 0).")

INPUTS_USED = ["slope", "roughness", "obstacle_density", "data_uncertainty"]


def weights() -> dict[str, float]:
    """The four weights (a, b, c, d) from config, normalised to sum 1."""
    w = {"slope": float(param("indices.walkability.w_slope")), "roughness": float(param("indices.walkability.w_rough")),
         "obstacle_density": float(param("indices.walkability.w_obstacle")), "data_uncertainty": float(param("indices.walkability.w_uncertainty"))}
    total = sum(w.values())
    if total <= 0:
        raise ValueError("indices.walkability weights must have a positive sum")
    return {k: v / total for k, v in w.items()}


def thresholds() -> tuple[float, float]:
    """(green_min, yellow_min): W >= green_min is green, W >= yellow_min yellow, below red."""
    return float(param("indices.class_green_min")), float(param("indices.class_yellow_min"))


def classify(W: NDArray | float) -> NDArray:
    """Classes of an index in 0-100: 2 green (>= 70), 1 yellow (>= 40), 0 red, -1 no data (NaN)."""
    g, y = thresholds()
    a = np.asarray(W, dtype=float)
    out = np.where(a >= g, 2, np.where(a >= y, 1, 0)).astype(np.int8)
    return np.where(np.isfinite(a), out, -1).astype(np.int8)


def slope_score(slope_deg: NDArray | float) -> NDArray:
    """S — 1 on flat ground, 0.5 at the hazard knee ``hazard.theta0_deg`` (the routing's logistic curve, rescaled to 1 at 0 deg)."""
    th0, s = float(param("hazard.theta0_deg")), float(param("hazard.s_deg"))
    raw = 1.0 - expit((np.asarray(slope_deg, dtype=float) - th0) / s)
    flat = 1.0 - float(expit(-th0 / s))
    return np.clip(raw / flat, 0.0, 1.0)


def roughness_score(rough_m: NDArray | float, cell: float) -> NDArray:
    """R — 1/(1 + r) with r the routing's normalised roughness (r = 1 at ``hazard.roughness_rel`` of the window width)."""
    window_m = int(param("terrain.roughness_window")) * cell
    r = np.asarray(rough_m, dtype=float) / (float(param("hazard.roughness_rel")) * window_m)
    return 1.0 / (1.0 + r)


def obstacle_cells(z: NDArray, cell: float, step_max_m: NDArray | None = None) -> NDArray:
    """Boolean map of obstacle cells (see the module docstring); NaN cells are not obstacles (they count as no data in U)."""
    zf = np.where(np.isfinite(z), z, np.nanmean(z) if np.isfinite(z).any() else 0.0)
    kernel = np.ones((3, 3)) / 8.0
    kernel[1, 1] = 0.0
    residual = zf - ndimage.convolve(zf, kernel, mode="nearest")
    flag = np.abs(residual) > cell * np.tan(np.radians(float(param("indices.walkability.obstacle_angle_deg"))))
    if step_max_m is not None:
        flag |= np.asarray(step_max_m, dtype=float) > float(param("astronaut.step_max"))
    return flag & np.isfinite(z)


def obstacle_score(z: NDArray, cell: float, step_max_m: NDArray | None = None) -> NDArray:
    """D — 1 with no obstacle cells in the window, 0 at ``obstacle_density_ref`` of them."""
    k = int(param("indices.walkability.obstacle_window"))
    density = ndimage.uniform_filter(obstacle_cells(z, cell, step_max_m).astype(float), size=k, mode="nearest")
    return np.clip(1.0 - density / float(param("indices.walkability.obstacle_density_ref")), 0.0, 1.0)


def certainty_score(z: NDArray, cell: float, simulated: bool = False) -> NDArray:
    """U — data certainty: resolution × (1 − share of no-data neighbours) × SIMULATED factor."""
    k = int(param("indices.walkability.void_window"))
    void = ndimage.uniform_filter((~np.isfinite(z)).astype(float), size=k, mode="nearest")
    u_res = 1.0 / (1.0 + cell / float(param("indices.walkability.resolution_ref_m")))
    factor = float(param("indices.walkability.simulated_factor")) if simulated else 1.0
    return np.clip(u_res * (1.0 - void) * factor, 0.0, 1.0)


def combine_walkability(S: ArrayLikeF, R: ArrayLikeF, D: ArrayLikeF, U: ArrayLikeF, w: dict[str, float] | None = None) -> NDArray:
    """W = 100·(a·S + b·R + c·D + d·U) with the weights normalised to sum 1 (no hard constraints applied here)."""
    w = weights() if w is None else w
    total = sum(w.values())
    return 100.0 * (w["slope"] * np.asarray(S, dtype=float) + w["roughness"] * np.asarray(R, dtype=float)
                    + w["obstacle_density"] * np.asarray(D, dtype=float) + w["data_uncertainty"] * np.asarray(U, dtype=float)) / total


ArrayLikeF = NDArray | float


@dataclass(frozen=True)
class WalkabilityResult:
    W: NDArray  # 0-100, NaN where the DEM has no data
    classes: NDArray  # int8: 2 green, 1 yellow, 0 red, -1 no data
    S: NDArray
    R: NDArray
    D: NDArray
    U: NDArray
    blocked: NDArray  # bool: impassable by the hard limits (W forced to 0)
    weights: dict[str, float]
    green_min: float
    yellow_min: float
    cell_m: float
    inputs_used: list[str]
    limitation: str

    def to_uint8(self, nodata: int = 255) -> NDArray:
        """0-100 as uint8 for a raster layer; NaN becomes ``nodata``."""
        out = np.where(np.isfinite(self.W), np.clip(np.rint(self.W), 0, 100), nodata)
        return out.astype(np.uint8)


def walkability_index(z: NDArray, cell: float, *, step_max_m: NDArray | None = None, simulated: bool = False,
                      slope_deg: NDArray | None = None, w: dict[str, float] | None = None) -> WalkabilityResult:
    """F54 — walkability index on an AOI grid (row 0 north). ``step_max_m``: optional per-cell largest step from a finer DEM."""
    z = np.asarray(z, dtype=float)
    finite = np.isfinite(z)
    if not finite.any():
        raise ValueError("the DEM has no valid cells")
    zf = np.where(finite, z, float(np.nanmean(z)))
    if slope_deg is None:
        slope_deg = np.degrees(slope_aspect_horn(zf, cell)[0])
    S = slope_score(slope_deg)
    R = roughness_score(roughness(zf, cell, int(param("terrain.roughness_window"))), cell)
    D = obstacle_score(z, cell, step_max_m)
    U = certainty_score(z, cell, simulated)
    weights_used = weights() if w is None else w
    W = combine_walkability(S, R, D, U, weights_used)
    blocked = np.asarray(slope_deg) > float(param("astronaut.theta_max_walk_deg"))
    if step_max_m is not None:
        blocked = blocked | (np.asarray(step_max_m, dtype=float) > float(param("astronaut.step_max")))
    W = np.where(blocked, 0.0, W)
    W = np.where(finite, W, np.nan)
    g, y = thresholds()
    return WalkabilityResult(W, classify(W), S, R, D, U, blocked & finite, weights_used, g, y, float(cell), list(INPUTS_USED), LIMITATION)
