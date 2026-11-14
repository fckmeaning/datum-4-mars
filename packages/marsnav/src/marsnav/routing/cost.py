"""Cell layers and packed parameters for the search kernel (F25 hazard, F26 science value, F27 weights)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from marsnav.config import param, profile_weights
from marsnav.env import dose_rate, pressure, surface_temperature
from marsnav.routing import astar as K
from marsnav.routing.grid import SiteGrid
from marsnav.routing.mobility import total_mass
from marsnav.sun import SunState, incidence, sun_position
from marsnav.terrain import horizon_grid


@dataclass
class Astronaut:
    mass_astronaut: float = field(default_factory=lambda: float(param("astronaut.mass_astronaut")))
    mass_suit: float = field(default_factory=lambda: float(param("astronaut.mass_suit")))
    mass_payload: float = field(default_factory=lambda: float(param("astronaut.mass_payload")))
    v_flat: float = field(default_factory=lambda: float(param("astronaut.v_flat")))
    theta_max_deg: float = field(default_factory=lambda: float(param("astronaut.theta_max_walk_deg")))
    step_max: float = field(default_factory=lambda: float(param("astronaut.step_max")))
    T_min_K: float = field(default_factory=lambda: float(param("astronaut.T_suit_min_K")))
    T_max_K: float = field(default_factory=lambda: float(param("astronaut.T_suit_max_K")))
    eva_max_s: float = field(default_factory=lambda: float(param("astronaut.eva_max_h")) * 3600.0)
    o2_capacity_l: float = field(default_factory=lambda: float(param("astronaut.o2_capacity_l")))
    reserve_fraction: float = field(default_factory=lambda: float(param("astronaut.reserve_fraction")))

    @classmethod
    def from_api(cls, d: dict | None) -> Astronaut:
        a = cls()
        if not d:
            return a
        mapping = {"mass_astronaut_kg": "mass_astronaut", "mass_suit_kg": "mass_suit", "mass_payload_kg": "mass_payload",
                   "v_flat_m_s": "v_flat", "theta_max_deg": "theta_max_deg", "step_max_m": "step_max", "T_min_K": "T_min_K",
                   "T_max_K": "T_max_K", "eva_max_s": "eva_max_s", "o2_capacity_l": "o2_capacity_l",
                   "reserve_fraction": "reserve_fraction"}
        for k, attr in mapping.items():
            if d.get(k) is not None:
                setattr(a, attr, float(d[k]))
        return a

    @property
    def m_tot(self) -> float:
        return total_mass(self.mass_astronaut, self.mass_suit, self.mass_payload)


def resolve_weights(profile: str = "BALANCED", overrides: dict | None = None) -> dict[str, float]:
    w = profile_weights(profile)
    for k, v in (overrides or {}).items():
        if v is not None and k in w:
            w[k] = float(v)
    if not 0 <= w["alpha"] < 1:
        raise ValueError("alpha must be in [0, 1)")
    return w


def pack_params(weights: dict[str, float], astro: Astronaut) -> NDArray:
    P = np.zeros(K.N_PARAMS)
    P[K.P_W_TAU], P[K.P_W_E], P[K.P_W_D], P[K.P_W_H], P[K.P_ALPHA] = (
        weights["w_tau"], weights["w_E"], weights["w_D"], weights["w_H"], weights["alpha"])
    P[K.P_TAU_REF] = param("routing.refs.tau_ref")
    P[K.P_E_REF] = param("routing.refs.E_ref")
    P[K.P_D_REF] = param("routing.refs.D_ref")
    P[K.P_HZ_REF] = param("routing.refs.Hz_ref")
    P[K.P_V_FLAT] = astro.v_flat
    P[K.P_TOB_A] = param("mobility.tobler_a")
    P[K.P_TOB_B] = param("mobility.tobler_b")
    P[K.P_K_R] = param("mobility.k_roughness")
    P[K.P_M_TOT] = astro.m_tot
    P[K.P_S_SUIT] = param("astronaut.s_suit")
    P[K.P_G_RATIO] = float(param("constants.g_mars")) / float(param("constants.g_earth"))
    P[K.P_GRADE_LIM] = min(float(param("mobility.minetti_grade_limit")), float(np.tan(np.radians(astro.theta_max_deg))))
    P[K.P_C5:K.P_C0 + 1] = param("mobility.minetti_coeffs")
    return P


def sigmoid(x: NDArray) -> NDArray:
    return 1.0 / (1.0 + np.exp(-x))


def cell_hazard(slope_deg: NDArray, rough_n: NDArray, shadow: NDArray, thermal_viol: NDArray,
                rock: NDArray | float = 0.0, texture: NDArray | float = 0.0,
                no_comms: NDArray | float = 0.0) -> dict[str, NDArray]:
    """F25 — hazard per metre of travel for each cell, with its sub-terms (dimensionless)."""
    terms = {
        "slope": sigmoid((np.asarray(slope_deg) - float(param("hazard.theta0_deg"))) / float(param("hazard.s_deg"))),
        "roughness": float(param("hazard.w_R")) * np.asarray(rough_n),
        "rock": float(param("hazard.w_rock")) * np.asarray(rock),
        "texture": float(param("hazard.w_tex")) * np.asarray(texture),
        "shadow": float(param("hazard.w_sh")) * np.asarray(shadow, dtype=float),
        "thermal": float(param("hazard.w_th")) * np.asarray(thermal_viol),
        "comms": float(param("hazard.w_c")) * np.asarray(no_comms),
    }
    total = sum(np.broadcast_to(v, np.shape(slope_deg)) for v in terms.values())
    return {"total": total, **{k: np.broadcast_to(v, np.shape(slope_deg)) for k, v in terms.items()}}


def science_value(indices: list[NDArray] | None, shape: tuple[int, int]) -> NDArray:
    """F26 — science value in [0, 1]: mean of min–max normalised spectral indices (0 when no spectral data)."""
    if not indices:
        return np.zeros(shape)
    norm = []
    for a in indices:
        a = np.asarray(a, dtype=float)
        lo, hi = np.nanpercentile(a, 2), np.nanpercentile(a, 98)
        norm.append(np.clip((a - lo) / (hi - lo + 1e-12), 0, 1))
    return np.nan_to_num(np.mean(norm, axis=0))


@dataclass
class CellLayers:
    arrays: dict[str, NDArray]
    sun: SunState
    hazard_terms: dict[str, NDArray]
    temp_K: NDArray
    shadow: NDArray
    simulated: list[str]


def build_layers(grid: SiteGrid, utc: str, astro: Astronaut) -> CellLayers:
    """Cell layers for the kernel at departure time ``utc`` (environment evaluated at departure; see assumptions)."""
    lat, lon = grid.center_latlon()
    sun = sun_position(lat, lon, utc)
    z = grid.z
    finite = np.isfinite(z)
    zf = np.where(finite, z, np.nanmin(z))
    slope_deg = grid.slope_deg
    slope_r, aspect = grid.slope_aspect
    window_m = int(param("terrain.roughness_window")) * grid.cell
    rough_n = grid.roughness_m / (float(param("hazard.roughness_rel")) * window_m)
    if sun.elevation_deg > 0:
        hor = horizon_grid(zf, grid.cell, sun.azimuth_deg, float(param("terrain.r_far_m")))
        shadow = np.radians(sun.elevation_deg) < hor
        cos_i = np.where(shadow, 0.0, incidence(slope_r, aspect, sun.elevation_deg, sun.azimuth_deg))
    else:
        shadow = np.ones_like(zf, dtype=bool)
        cos_i = np.zeros_like(zf)
    temp = surface_temperature(cos_i, grid.extras.get("T_day_K"), grid.extras.get("T_night_K"))
    scale = float(param("hazard.thermal_scale_K"))
    viol = np.clip((astro.T_min_K - temp) / scale, 0, None) + np.clip((temp - astro.T_max_K) / scale, 0, None)
    haz = cell_hazard(slope_deg, rough_n, shadow, viol, grid.extras.get("rock", 0.0), grid.extras.get("texture", 0.0),
                      grid.extras.get("no_comms", 0.0))
    P_cells = pressure(zf, grid.z_ref)
    dose_h = dose_rate(grid.sky_fraction, P_cells)
    sci = science_value(grid.extras.get("science_indices"), zf.shape)  # type: ignore[arg-type]
    blocked = (~finite) | (slope_deg > astro.theta_max_deg)
    if "step_max_m" in grid.extras:
        blocked |= grid.extras["step_max_m"] > astro.step_max
    simulated = []
    if grid.simulated:
        simulated.append(f"elevation {grid.level} (SIMULATED)")
    if "T_day_K" not in grid.extras:
        simulated.append("surface temperature (default diurnal model, no THEMIS layer yet)")
    if not grid.extras.get("science_indices"):
        simulated.append("science value = 0 (no CRISM layer yet)")
    arrays = {"z": zf, "rough_n": rough_n, "haz": haz["total"].astype(float), "dose_h": dose_h, "sci": sci,
              "blocked": blocked, "slope_deg": slope_deg}
    return CellLayers(arrays, sun, haz, temp, shadow, simulated)
