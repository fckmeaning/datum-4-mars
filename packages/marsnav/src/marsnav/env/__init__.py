"""Environment models (F17–F20): surface temperature, pressure, dose rate, atmosphere sample.

Until W1 delivers THEMIS/REMS/MCD layers, defaults come from config/params.yaml and are reported as SIMULATED
by callers (see ``SIMULATED_FIELDS``).
"""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray

from marsnav.config import param

SIMULATED_FIELDS = ("air_temp_K", "wind_ms", "tau", "surface_temp_K")


def surface_temperature(cos_i: ArrayLike, T_day_K: ArrayLike | None = None, T_night_K: ArrayLike | None = None) -> NDArray:
    """F17 — T = T_night + (T_day − T_night)·max(cos i, 0)^(1/4) [K].

    Radiative-equilibrium scaling T ∝ flux^(1/4); thermal-inertia lag is ignored (ASSUMPTION). T_day/T_night are
    THEMIS-derived layers when available, otherwise env defaults from params.yaml.
    """
    td = float(param("env.T_surf_day_default_K")) if T_day_K is None else np.asarray(T_day_K, dtype=float)
    tn = float(param("env.T_surf_night_default_K")) if T_night_K is None else np.asarray(T_night_K, dtype=float)
    f = np.clip(np.asarray(cos_i, dtype=float), 0.0, None) ** 0.25
    return tn + (td - tn) * f


def pressure(z: ArrayLike, z_ref: float, P_ref: float | None = None, H: float | None = None) -> NDArray:
    """F18 — barometric pressure P(z) = P_ref·exp(−(z − z_ref)/H) [Pa]."""
    P_ref = float(param("atmosphere.P_ref")) if P_ref is None else P_ref
    H = float(param("atmosphere.scale_height_H")) if H is None else H
    return P_ref * np.exp(-(np.asarray(z, dtype=float) - z_ref) / H)


def dose_rate(sky: ArrayLike, P: ArrayLike, sky_ref: float = 1.0, P_ref: float | None = None,
              beta: float | None = None, sep_multiplier: float | None = None) -> NDArray:
    """F19 — dose-equivalent rate [mSv/h]: Ḋ_ref·(F/F_ref)·(1 − β·(P − P_ref)/P_ref)·SEP multiplier.

    Ḋ_ref (Hassler et al. 2014, mSv/day) is the open-sky surface value at Gale; F is the weighted sky fraction (F08).
    """
    d_ref = float(param("radiation.dose_eq_ref")) / 24.0
    P_ref = float(param("atmosphere.P_ref")) if P_ref is None else P_ref
    beta = float(param("radiation.beta_pressure_dose")) if beta is None else beta
    sep = float(param("radiation.sep_multiplier")) if sep_multiplier is None else sep_multiplier
    factor = 1.0 - beta * (np.asarray(P, dtype=float) - P_ref) / P_ref
    return d_ref * (np.asarray(sky, dtype=float) / sky_ref) * np.clip(factor, 0.0, None) * sep


def atmosphere(ltst_h: float) -> dict[str, float]:
    """F20 — atmosphere sample (defaults until REMS/MCD tables exist; all fields SIMULATED)."""
    t_air = float(param("env.T_air_default_K"))
    amp = float(param("env.T_air_diurnal_amp_K"))
    # Diurnal cosine with the maximum at 14:00 LTST (ASSUMPTION).
    t = t_air + amp * np.cos(2 * np.pi * (ltst_h - 14.0) / 24.0)
    return {"air_temp_K": float(t), "wind_ms": float(param("env.wind_default_ms")), "tau": float(param("atmosphere.tau_default"))}
