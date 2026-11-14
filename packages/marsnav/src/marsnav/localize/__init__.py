"""Orientation and position without GPS or a magnetic compass (F39–F42).

Local frame: AOI metres, x east, y north. Bearings/azimuths are degrees clockwise from north.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from scipy.stats import chi2

from marsnav.config import param
from marsnav.geodesy import geo_to_aoi
from marsnav.sun import sun_position


def wrap180(a: NDArray | float) -> NDArray:
    return (np.asarray(a, dtype=float) + 180.0) % 360.0 - 180.0


@dataclass
class SunCompass:
    heading_deg: float
    sigma_heading_deg: float
    sun_azimuth_deg: float
    sun_elevation_deg: float
    warnings: list[str]


def sun_compass(utc: str, lat: float, lon: float, beta_deg: float, sigma_beta_deg: float = 3.0,
                uses_shadow: bool = False, sigma_pos_m: float = 500.0) -> SunCompass:
    """F39 — heading ψ = (A_sun − β) mod 360, with β the clockwise angle from the facing direction to the sun
    (to the shadow when uses_shadow; the shadow points to A_sun + 180°). σψ combines σβ and the azimuth change caused
    by the position uncertainty (finite difference over σ_pos).
    """
    s = sun_position(lat, lon, utc)
    target_az = s.azimuth_deg + (180.0 if uses_shadow else 0.0)
    heading = float((target_az - beta_deg) % 360.0)
    R = float(param("constants.R_sphere"))
    dlat = np.degrees(sigma_pos_m / R)
    dlon = dlat / max(np.cos(np.radians(lat)), 1e-6)
    dA = max(abs(float(wrap180(sun_position(lat + dlat, lon, utc).azimuth_deg - s.azimuth_deg))),
             abs(float(wrap180(sun_position(lat, lon + dlon, utc).azimuth_deg - s.azimuth_deg))))
    sigma = float(np.hypot(sigma_beta_deg, dA))
    warnings = []
    low = float(param("navigation.low_sun_warn_deg"))
    if s.elevation_deg <= 0:
        warnings.append("The sun is below the horizon: the sun compass cannot be used now.")
    elif s.elevation_deg < low:
        warnings.append(f"The sun is low ({s.elevation_deg:.0f} deg): long shadows, measure carefully.")
    if s.elevation_deg > 80:
        warnings.append("The sun is almost overhead: its azimuth changes fast and shadows are short; heading is less reliable.")
        sigma = max(sigma, 10.0)
    warnings.append("Magnetic compasses do not work on Mars (no global magnetic field); this heading comes from the sun.")
    return SunCompass(heading, sigma, s.azimuth_deg, s.elevation_deg, warnings)


@dataclass
class ResectionResult:
    x: float
    y: float
    heading_deg: float | None
    cov: NDArray
    residuals_deg: NDArray
    iterations: int
    converged: bool
    gdop: float
    flags: list[str]


def _model(state: NDArray, L: NDArray, heading_known: bool) -> NDArray:
    x, y = state[0], state[1]
    az = np.degrees(np.arctan2(L[:, 0] - x, L[:, 1] - y))
    return az if heading_known else az - state[2]


def resection(landmarks_xy: NDArray, bearings_deg: NDArray, sigmas_deg: NDArray | float = 2.0, heading_known: bool = True,
              prior_xy: NDArray | None = None, max_iter: int = 50) -> ResectionResult:
    """F40 — position (and heading) from bearings to known landmarks by Gauss–Newton / Levenberg–Marquardt.

    heading_known=True: bearings are absolute azimuths, unknowns (x, y), ≥ 2 landmarks.
    heading_known=False: bearings are relative to the body heading ψ, unknowns (x, y, ψ), ≥ 3 landmarks.
    Covariance (JᵀWJ)⁻¹ with W = diag(1/σ²) in rad⁻².
    """
    L = np.asarray(landmarks_xy, dtype=float)
    b = np.asarray(bearings_deg, dtype=float)
    n = len(L)
    need = 2 if heading_known else 3
    if n < need:
        raise ValueError(f"need at least {need} landmarks, got {n}")
    sig = np.broadcast_to(np.radians(np.asarray(sigmas_deg, dtype=float)), (n,))
    Wsqrt = 1.0 / sig
    start = np.mean(L, axis=0) if prior_xy is None else np.asarray(prior_xy, dtype=float)
    # Offset the start from the landmark centroid so the geometry is well defined.
    if prior_xy is None:
        start = start + np.array([np.std(L[:, 0]) * 0.1 + 1.0, -np.std(L[:, 1]) * 0.1 - 1.0])
    state = np.r_[start, 0.0] if not heading_known else start.copy()
    if not heading_known:
        state[2] = float(np.degrees(np.angle(np.mean(np.exp(1j * np.radians(_model(np.r_[start, 0.0], L, False) - b))))))
    lam = 1e-3
    converged = False
    it = 0
    for it in range(1, max_iter + 1):  # noqa: B007 - `it` is reported after the loop
        r = np.radians(wrap180(b - _model(state, L, heading_known)))
        dx, dy = L[:, 0] - state[0], L[:, 1] - state[1]
        q = dx * dx + dy * dy
        J = np.column_stack([-dy / q, dx / q])  # d(azimuth in rad)/d(x, y)
        if not heading_known:
            J = np.column_stack([J, -np.ones(n)])  # d/dψ (ψ in rad)
        Jw, rw = J * Wsqrt[:, None], r * Wsqrt
        A = Jw.T @ Jw
        g = Jw.T @ rw
        step = np.linalg.solve(A + lam * np.diag(np.diag(A) + 1e-12), g)
        if not heading_known:
            step[2] = np.degrees(step[2])
        new = state + step
        r_new = np.radians(wrap180(b - _model(new, L, heading_known))) * Wsqrt
        if np.sum(r_new**2) <= np.sum(rw**2):
            state, lam = new, lam * 0.3
            if np.linalg.norm(step[:2]) < 1e-7:
                converged = True
                break
        else:
            lam *= 10.0
    dx, dy = L[:, 0] - state[0], L[:, 1] - state[1]
    q = dx * dx + dy * dy
    J = np.column_stack([-dy / q, dx / q])
    if not heading_known:
        J = np.column_stack([J, -np.ones(n)])
    Jw = J * Wsqrt[:, None]
    cov = np.linalg.pinv(Jw.T @ Jw)
    if not heading_known:
        cov[2, :] = np.degrees(cov[2, :])
        cov[:, 2] = np.degrees(cov[:, 2])
    res = wrap180(b - _model(state, L, heading_known))
    flags = []
    g_dop = gdop(L, state[:2])
    if g_dop > 50 * float(np.mean(np.sqrt(q))) / 1000.0 + 5:
        flags.append("WEAK_GEOMETRY")
    if not converged:
        flags.append("NOT_CONVERGED")
    return ResectionResult(float(state[0]), float(state[1]), (float(state[2] % 360.0) if not heading_known else None),
                           cov, res, it, converged, g_dop, flags)


@dataclass
class Ellipse:
    semi_major_m: float
    semi_minor_m: float
    angle_deg: float
    p: float


def error_ellipse(cov_xy: NDArray, p: float | None = None) -> Ellipse:
    """F41 — confidence ellipse of a 2×2 position covariance; scale √χ²₂(p) (2.4477 for 95 %).
    angle_deg is the azimuth of the major axis, clockwise from north, in [0, 180)."""
    p = float(param("navigation.ellipse_p")) if p is None else p
    C = np.asarray(cov_xy, dtype=float)[:2, :2]
    vals, vecs = np.linalg.eigh(C)
    k = float(np.sqrt(chi2.ppf(p, df=2)))
    major = vecs[:, 1]
    angle = float(np.degrees(np.arctan2(major[0], major[1])) % 180.0)
    return Ellipse(k * float(np.sqrt(max(vals[1], 0))), k * float(np.sqrt(max(vals[0], 0))), angle, p)


def gdop(landmarks_xy: NDArray, pos_xy: NDArray) -> float:
    """F42 — geometric dilution of precision of a bearing fix: √trace((JᵀJ)⁻¹) with J in rad per km."""
    L = np.asarray(landmarks_xy, dtype=float)
    dx, dy = L[:, 0] - pos_xy[0], L[:, 1] - pos_xy[1]
    q = (dx * dx + dy * dy) / 1e6
    J = np.column_stack([-dy / 1e3 / q, dx / 1e3 / q])
    M = J.T @ J
    if np.linalg.cond(M) > 1e12:
        return float("inf")
    return float(np.sqrt(np.trace(np.linalg.inv(M))))


def latlon_to_xy(points: list[tuple[float, float]]) -> NDArray:
    lat = np.array([p[0] for p in points])
    lon = np.array([p[1] for p in points])
    x, y = geo_to_aoi(lat, lon)
    return np.column_stack([x, y])
