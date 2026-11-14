"""Human mobility in a spacesuit on Mars (F21–F24). Vectorised NumPy versions used for analysis and tests;
the numba search kernel (astar.py) evaluates the same formulas from the packed parameter vector.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray

from marsnav.config import param


def walk_speed(i: ArrayLike, roughness_norm: ArrayLike = 0.0, v_flat: float | None = None) -> NDArray:
    """F21 — normalised Tobler speed [m/s]: v_flat·exp(−a|i + b|)/exp(−a·b) / (1 + k_R·R_norm).

    i is the along-track grade Δz/d (tan of the slope angle); v(0) = v_flat.
    """
    a, b = float(param("mobility.tobler_a")), float(param("mobility.tobler_b"))
    v_flat = float(param("astronaut.v_flat")) if v_flat is None else v_flat
    k_r = float(param("mobility.k_roughness"))
    i = np.asarray(i, dtype=float)
    return v_flat * np.exp(-a * np.abs(i + b)) / np.exp(-a * b) / (1.0 + k_r * np.asarray(roughness_norm, dtype=float))


def metabolic_cost(i: ArrayLike) -> NDArray:
    """F22 — Minetti et al. (2002) walking cost C(i) [J/(kg·m)] on Earth, grade clipped to the measured ±0.45."""
    coeffs = param("mobility.minetti_coeffs")
    gl = float(param("mobility.minetti_grade_limit"))
    i = np.clip(np.asarray(i, dtype=float), -gl, gl)
    return np.polyval(coeffs, i)


def total_mass(m_astronaut: float | None = None, m_suit: float | None = None, m_payload: float | None = None) -> float:
    return float((param("astronaut.mass_astronaut") if m_astronaut is None else m_astronaut)
                 + (param("astronaut.mass_suit") if m_suit is None else m_suit)
                 + (param("astronaut.mass_payload") if m_payload is None else m_payload))


def edge_energy(d: ArrayLike, i: ArrayLike, m_tot: float | None = None) -> NDArray:
    """F23 — metabolic energy on Mars [J]: m·d·[C(0)·s_suit + (C(i) − C(0))·g_M/g_E] (ASSUMPTION: gravity scales the
    grade-dependent part only)."""
    m_tot = total_mass() if m_tot is None else m_tot
    c0 = float(param("mobility.minetti_coeffs")[-1])
    s_suit = float(param("astronaut.s_suit"))
    g_ratio = float(param("constants.g_mars")) / float(param("constants.g_earth"))
    return m_tot * np.asarray(d, dtype=float) * (c0 * s_suit + (metabolic_cost(i) - c0) * g_ratio)


def o2_use(energy_J: ArrayLike, duration_s: ArrayLike, m_astronaut: float | None = None) -> NDArray:
    """F24 — oxygen [L]: E/(20.1 kJ/L) + basal 1 MET (3.5 mL O2/(kg·min))·m·t."""
    eq = float(param("physiology.o2_energy_equiv")) * 1000.0  # J per litre
    met = float(param("physiology.met_o2"))  # mL/(kg·min)
    m = float(param("astronaut.mass_astronaut")) if m_astronaut is None else m_astronaut
    return np.asarray(energy_J, dtype=float) / eq + met * m * (np.asarray(duration_s, dtype=float) / 60.0) / 1000.0
