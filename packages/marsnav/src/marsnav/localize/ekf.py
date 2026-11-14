"""F44 — extended Kalman filter for the astronaut pose without GPS.

State x = [x, y, ψ]: AOI metres (x east, y north) and heading ψ in RADIANS clockwise from north (the covariance is in
m², m·rad, rad²). Prediction by dead reckoning: x += s·sin ψ, y += s·cos ψ, heading random walk. Corrections are linear
measurements of the state: sun-compass heading (F39), resection position or pose (F40), skyline pose (F43).
The filter is pure: every function takes (mean, cov) and returns new arrays.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import ArrayLike, NDArray
from scipy.stats import chi2

# ---- tunable numbers (ASSUMPTION: not measured for a suited astronaut; the CEO may move them to config/params.yaml) ----
SIGMA_STEP_ABS_M = 0.2  # step-length noise, constant part [m]
SIGMA_STEP_REL = 0.05  # step-length noise, proportional to the step (pace counting error)
SIGMA_HEADING_PER_SQRT_M_DEG = 0.5  # heading random walk [deg per √m walked]


def _wrap_pi(a: NDArray | float) -> NDArray:
    return (np.asarray(a, dtype=float) + np.pi) % (2 * np.pi) - np.pi


def _wrap_2pi(a: float) -> float:
    return float(a % (2 * np.pi))


def ekf_init(x: float, y: float, heading_deg: float, sigma_xy_m: float, sigma_heading_deg: float) -> tuple[NDArray, NDArray]:
    """F44 — initial (mean, cov) from a first fix; heading in degrees clockwise from north."""
    mean = np.array([x, y, _wrap_2pi(np.radians(heading_deg))])
    cov = np.diag([sigma_xy_m**2, sigma_xy_m**2, np.radians(sigma_heading_deg) ** 2])
    return mean, cov


def heading_deg(mean: ArrayLike) -> float:
    """Heading of a state mean in degrees [0, 360)."""
    return float(np.degrees(np.asarray(mean, dtype=float)[2]) % 360.0)


def ekf_predict(mean: ArrayLike, cov: ArrayLike, step_m: float, sigma_step_abs_m: float = SIGMA_STEP_ABS_M,
                sigma_step_rel: float = SIGMA_STEP_REL,
                sigma_heading_per_sqrt_m_deg: float = SIGMA_HEADING_PER_SQRT_M_DEG) -> tuple[NDArray, NDArray]:
    """F44 — prediction after walking step_m metres along the current heading.

    Model: p ← p + (s + w_s)·[sin ψ, cos ψ];  ψ ← ψ + w_ψ with w_s ~ N(0, (σ_abs + σ_rel·s)²), w_ψ ~ N(0, σ_h²·s).
    Covariance: P ← F P Fᵀ + G Q Gᵀ with F = ∂f/∂x = [[1,0,s cos ψ],[0,1,−s sin ψ],[0,0,1]], G = [[sin ψ,0],[cos ψ,0],[0,1]].
    """
    m = np.asarray(mean, dtype=float)
    P = np.asarray(cov, dtype=float)
    s = float(step_m)
    if s < 0:
        raise ValueError("step_m must be >= 0")
    psi = m[2]
    if s == 0.0:  # standing still: no dead-reckoning error accumulates
        return np.array([m[0], m[1], _wrap_2pi(psi)]), 0.5 * (P + P.T)
    sn, cs = np.sin(psi), np.cos(psi)
    new = np.array([m[0] + s * sn, m[1] + s * cs, _wrap_2pi(psi)])
    F = np.array([[1.0, 0.0, s * cs], [0.0, 1.0, -s * sn], [0.0, 0.0, 1.0]])
    G = np.array([[sn, 0.0], [cs, 0.0], [0.0, 1.0]])
    q_s = (sigma_step_abs_m + sigma_step_rel * s) ** 2
    q_h = np.radians(sigma_heading_per_sqrt_m_deg) ** 2 * s
    Pn = F @ P @ F.T + G @ np.diag([q_s, q_h]) @ G.T
    return new, 0.5 * (Pn + Pn.T)


@dataclass
class EkfUpdate:
    mean: NDArray
    cov: NDArray
    innovation: NDArray  # z − h(x̂) with angle rows wrapped
    nis: float  # normalised innovation squared, expected value = number of measured rows
    accepted: bool  # False when the gate rejected the fix (mean and cov are then unchanged)


def ekf_update(mean: ArrayLike, cov: ArrayLike, z: ArrayLike, R: ArrayLike, H: ArrayLike, angle_rows: tuple[int, ...] = (),
               gate_p: float | None = None) -> EkfUpdate:
    """F44 — linear measurement update z = H x + v, v ~ N(0, R), Joseph-form covariance.

    angle_rows: rows of z/H that measure an angle [rad]; their residuals are wrapped to (−π, π].
    gate_p: if given, a fix whose NIS exceeds the χ² quantile of that probability (dof = rows of z) is rejected.
    """
    m = np.asarray(mean, dtype=float)
    P = np.asarray(cov, dtype=float)
    zz = np.atleast_1d(np.asarray(z, dtype=float))
    Hm = np.atleast_2d(np.asarray(H, dtype=float))
    Rm = np.atleast_2d(np.asarray(R, dtype=float))
    y = zz - Hm @ m
    for r in angle_rows:
        y[r] = float(_wrap_pi(y[r]))
    S = Hm @ P @ Hm.T + Rm
    nis = float(y @ np.linalg.solve(S, y))
    if gate_p is not None and nis > float(chi2.ppf(gate_p, df=len(zz))):
        return EkfUpdate(m.copy(), P.copy(), y, nis, False)
    K = np.linalg.solve(S, Hm @ P).T  # P Hᵀ S⁻¹ (S symmetric)
    I_KH = np.eye(len(m)) - K @ Hm
    Pn = I_KH @ P @ I_KH.T + K @ Rm @ K.T
    new = m + K @ y
    new[2] = _wrap_2pi(new[2])
    return EkfUpdate(new, 0.5 * (Pn + Pn.T), y, nis, True)


_H_HEADING = np.array([[0.0, 0.0, 1.0]])
_H_POS = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])


def update_heading(mean: ArrayLike, cov: ArrayLike, heading_deg_meas: float, sigma_deg: float,
                   gate_p: float | None = None) -> EkfUpdate:
    """F44 — correction with an absolute heading (F39 sun compass)."""
    return ekf_update(mean, cov, [np.radians(heading_deg_meas)], [[np.radians(sigma_deg) ** 2]], _H_HEADING, angle_rows=(0,),
                      gate_p=gate_p)


def update_position(mean: ArrayLike, cov: ArrayLike, x: float, y: float, cov_xy: ArrayLike,
                    gate_p: float | None = None) -> EkfUpdate:
    """F44 — correction with a position fix (F40 resection with known heading)."""
    return ekf_update(mean, cov, [x, y], np.asarray(cov_xy, dtype=float)[:2, :2], _H_POS, gate_p=gate_p)


def update_pose(mean: ArrayLike, cov: ArrayLike, x: float, y: float, heading_deg_meas: float, cov_pose: ArrayLike,
                gate_p: float | None = None) -> EkfUpdate:
    """F44 — correction with a full pose; cov_pose is 3×3 in (m², m·rad, rad²) like the filter's own covariance."""
    return ekf_update(mean, cov, [x, y, np.radians(heading_deg_meas)], cov_pose, np.eye(3), angle_rows=(2,), gate_p=gate_p)


def update_from_sun_compass(mean: ArrayLike, cov: ArrayLike, fix: Any, gate_p: float | None = None) -> EkfUpdate:
    """F44 — correction from an F39 `SunCompass` result (fields heading_deg, sigma_heading_deg)."""
    return update_heading(mean, cov, fix.heading_deg, fix.sigma_heading_deg, gate_p)


def update_from_resection(mean: ArrayLike, cov: ArrayLike, fix: Any, gate_p: float | None = None) -> EkfUpdate:
    """F44 — correction from an F40 `ResectionResult`.

    Known-heading fix (heading_deg is None): position only. Unknown-heading fix: full pose; the resection covariance
    carries ψ in degrees (rows/columns 2), converted here to radians.
    """
    c = np.asarray(fix.cov, dtype=float)
    if fix.heading_deg is None:
        return update_position(mean, cov, fix.x, fix.y, c, gate_p)
    k = np.radians(1.0)
    scale = np.diag([1.0, 1.0, k])
    return update_pose(mean, cov, fix.x, fix.y, fix.heading_deg, scale @ c[:3, :3] @ scale, gate_p)


def update_from_skyline(mean: ArrayLike, cov: ArrayLike, fix: Any, gate_p: float | None = None) -> EkfUpdate:
    """F44 — correction from an F43 `SkylineResult` (position, heading, cov_xy, sigma_heading_deg). Not applied when the
    match was flagged FLAT_HORIZON (no information)."""
    if "FLAT_HORIZON" in getattr(fix, "flags", []):
        return EkfUpdate(np.asarray(mean, dtype=float).copy(), np.asarray(cov, dtype=float).copy(), np.zeros(3), 0.0, False)
    R = np.zeros((3, 3))
    R[:2, :2] = np.asarray(fix.cov_xy, dtype=float)[:2, :2]
    R[2, 2] = np.radians(fix.sigma_heading_deg) ** 2
    return update_pose(mean, cov, fix.x, fix.y, fix.heading_deg, R, gate_p)
