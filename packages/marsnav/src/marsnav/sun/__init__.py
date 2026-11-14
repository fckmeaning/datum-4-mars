"""Mars time and sun geometry (F11–F16) after the Mars24 algorithm (Allison & McEwen 2000, NASA GISS Mars24).

Longitudes are east-positive at the API boundary; Mars24's west-longitude formulas are converted internally.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
from numpy.typing import ArrayLike, NDArray

from marsnav.config import param

# TAI−UTC leap-second table (date of change → TAI−UTC seconds). TT−UTC = TAI−UTC + 32.184 s.
_LEAP = [
    (datetime(1999, 1, 1, tzinfo=UTC), 32.0),
    (datetime(2006, 1, 1, tzinfo=UTC), 33.0),
    (datetime(2009, 1, 1, tzinfo=UTC), 34.0),
    (datetime(2012, 7, 1, tzinfo=UTC), 35.0),
    (datetime(2015, 7, 1, tzinfo=UTC), 36.0),
    (datetime(2017, 1, 1, tzinfo=UTC), 37.0),
]

_PBS = [  # (A_i, tau_i, phi_i) perturbations, Mars24 step B-3
    (0.0071, 2.2353, 49.409), (0.0057, 2.7543, 168.173), (0.0039, 1.1177, 191.837), (0.0037, 15.7866, 21.736),
    (0.0021, 2.1354, 15.704), (0.0020, 2.4694, 95.528), (0.0018, 32.8493, 49.095),
]


def parse_utc(utc: str | datetime) -> datetime:
    if isinstance(utc, datetime):
        return utc if utc.tzinfo else utc.replace(tzinfo=UTC)
    s = utc.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def tt_minus_utc(dt: datetime) -> float:
    tai = 31.0
    for when, value in _LEAP:
        if dt >= when:
            tai = value
    return tai + 32.184


@dataclass(frozen=True)
class MarsTime:
    jd_tt: float
    dt_j2000: float
    M_deg: float
    nu_minus_M_deg: float
    ls_deg: float
    eot_deg: float
    msd: float
    mst_h: float
    declination_deg: float
    sun_distance_au: float


def mars24(utc: str | datetime) -> MarsTime:
    """F11 — Mars24 quantities for a UTC instant (steps A–D of Allison & McEwen 2000)."""
    dt = parse_utc(utc)
    jd_ut = 2440587.5 + dt.timestamp() / 86400.0
    jd_tt = jd_ut + tt_minus_utc(dt) / 86400.0
    d = jd_tt - 2451545.0
    M = 19.3871 + 0.52402073 * d
    a_fms = 270.3871 + 0.524038496 * d
    pbs = sum(A * np.cos(np.radians(0.985626 * d / tau + phi)) for A, tau, phi in _PBS)
    Mr = np.radians(M)
    nu_m = ((10.691 + 3.0e-7 * d) * np.sin(Mr) + 0.623 * np.sin(2 * Mr) + 0.050 * np.sin(3 * Mr)
            + 0.005 * np.sin(4 * Mr) + 0.0005 * np.sin(5 * Mr) + pbs)
    ls = (a_fms + nu_m) % 360.0
    lr = np.radians(ls)
    eot = 2.861 * np.sin(2 * lr) - 0.071 * np.sin(4 * lr) + 0.002 * np.sin(6 * lr) - nu_m
    msd = (jd_tt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626
    mst = (24.0 * msd) % 24.0
    dec = np.degrees(np.arcsin(0.42565 * np.sin(lr))) + 0.25 * np.sin(lr)
    r = 1.52367934 * (1.00436 - 0.09309 * np.cos(Mr) - 0.004336 * np.cos(2 * Mr)
                      - 0.00031 * np.cos(3 * Mr) - 0.00003 * np.cos(4 * Mr))
    return MarsTime(jd_tt, d, M % 360.0, float(nu_m), float(ls), float(eot), float(msd), float(mst), float(dec), float(r))


def solar_time(lon_east_deg: float, mt: MarsTime) -> tuple[float, float]:
    """F12 — local mean and true solar time [Mars hours] at an east longitude."""
    lmst = (mt.mst_h + lon_east_deg / 15.0) % 24.0
    ltst = (lmst + mt.eot_deg / 15.0) % 24.0
    return lmst, ltst


@dataclass(frozen=True)
class SunState:
    utc: str
    msd: float
    ls_deg: float
    lmst_h: float
    ltst_h: float
    elevation_deg: float
    azimuth_deg: float
    declination_deg: float
    sun_distance_au: float


def sun_position(lat_deg: float, lon_deg: float, utc: str | datetime) -> SunState:
    """F13 — sun elevation and azimuth (clockwise from north) at a point and instant."""
    mt = mars24(utc)
    lmst, ltst = solar_time(lon_deg, mt)
    H = np.radians(15.0 * (ltst - 12.0))
    phi, dec = np.radians(lat_deg), np.radians(mt.declination_deg)
    sin_e = np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.cos(H)
    e = np.degrees(np.arcsin(np.clip(sin_e, -1.0, 1.0)))
    A = np.degrees(np.arctan2(-np.cos(dec) * np.sin(H), np.sin(dec) * np.cos(phi) - np.cos(dec) * np.cos(H) * np.sin(phi)))
    return SunState(parse_utc(utc).isoformat().replace("+00:00", "Z"), mt.msd, mt.ls_deg, lmst, ltst,
                    float(e), float(A % 360.0), mt.declination_deg, mt.sun_distance_au)


def incidence(slope: ArrayLike, aspect: ArrayLike, elevation_deg: float, azimuth_deg: float) -> NDArray:
    """F14 — cos i on a tilted surface: cos θ·sin e + sin θ·cos e·cos(A − aspect). slope/aspect in radians."""
    e, A = np.radians(elevation_deg), np.radians(azimuth_deg)
    s, a = np.asarray(slope, dtype=float), np.asarray(aspect, dtype=float)
    return np.cos(s) * np.sin(e) + np.sin(s) * np.cos(e) * np.cos(A - a)


def shadowed(horizon_at_sun_az_rad: ArrayLike, elevation_deg: float) -> NDArray:
    """F15 — True where the sun is below the local terrain horizon (or below the mathematical horizon)."""
    e = np.radians(elevation_deg)
    return (e <= 0.0) | (e < np.asarray(horizon_at_sun_az_rad, dtype=float))


def irradiance(cos_i: ArrayLike, elevation_deg: float, tau: float, r_au: float) -> NDArray:
    """F16 — direct-beam irradiance [W/m²]: (S0/r²)·max(cos i, 0)·exp(−τ/sin e). ASSUMPTION: no diffuse light."""
    s0 = float(param("constants.S0_1au"))
    sin_e = np.sin(np.radians(elevation_deg))
    if sin_e <= 0:
        return np.zeros_like(np.asarray(cos_i, dtype=float))
    return s0 / r_au**2 * np.clip(np.asarray(cos_i, dtype=float), 0.0, None) * np.exp(-tau / sin_e)
