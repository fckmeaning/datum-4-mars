"""Orbits, relay contact windows and Earth–Mars light time (F49–F52).

F49 two-body Kepler propagation (optional J2 secular drift), F50 look angles and terrain-masked visibility,
F51 contact windows (AOS/LOS refined by bisection), F52 Earth–Mars one-way light time.
Orbital elements are assumed to be given in the Mars-equator inertial frame whose x axis is the ascending node of the Mars
equator on the ICRF equator (the IAU rotation angle W is measured from that node). Results are APPROXIMATE (not SPICE).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
from numpy.typing import ArrayLike, NDArray

from marsnav.config import param
from marsnav.sun import parse_utc, tt_minus_utc

J2000_JD = 2451545.0


@dataclass(frozen=True)
class Elements:
    a_m: float
    e: float
    i_deg: float
    raan_deg: float
    argp_deg: float
    M0_deg: float
    epoch_utc: str

    @classmethod
    def from_dict(cls, d: dict) -> Elements:
        return cls(float(d["a_m"]), float(d["e"]), float(d["i_deg"]), float(d["raan_deg"]), float(d["argp_deg"]),
                   float(d["M0_deg"]), str(d["epoch_utc"]))


def to_unix(utc: str | datetime) -> float:
    return parse_utc(utc).timestamp()


def jd_tt_from_unix(t: ArrayLike) -> NDArray:
    t = np.asarray(t, dtype=float)
    off = tt_minus_utc(datetime.fromtimestamp(float(np.ravel(t)[0]), UTC))  # leap seconds change at most once in a window
    return 2440587.5 + t / 86400.0 + off / 86400.0


def mars_rotation_deg(t_unix: ArrayLike) -> NDArray:
    """IAU prime-meridian angle W(t) = W0 + Wdot·d [deg], d = days since J2000 (TT used as TDB; error < 1 ms of arc/yr)."""
    d = jd_tt_from_unix(t_unix) - J2000_JD
    return (float(param("constants.W0_deg")) + float(param("constants.Wdot_deg_per_day")) * d) % 360.0


def mean_motion(a_m: float) -> float:
    return float(np.sqrt(float(param("constants.GM_mars")) / a_m**3))


def solve_kepler(M: ArrayLike, e: float, tol: float = 1e-12, max_iter: int = 30) -> NDArray:
    """Kepler's equation M = E − e·sin E by Newton iteration (vectorised), E in radians."""
    M = np.mod(np.asarray(M, dtype=float) + np.pi, 2 * np.pi) - np.pi
    E = M + 0.85 * e * np.sign(np.sin(M) + (np.sin(M) == 0))  # Danby's starting value: converges for all e < 1
    for _ in range(max_iter):
        f = E - e * np.sin(E) - M
        E = E - np.clip(f / (1.0 - e * np.cos(E)), -1.0, 1.0)  # step limit keeps Newton stable at high eccentricity
        if np.max(np.abs(f)) < tol:
            break
    return E


def j2_rates(el: Elements) -> tuple[float, float, float]:
    """Secular rates [rad/s] of (Ω, ω, mean anomaly correction) from J2 (first order)."""
    n = mean_motion(el.a_m)
    J2 = float(param("constants.J2_mars"))
    R = float(param("constants.R_sphere"))
    i = np.radians(el.i_deg)
    p = el.a_m * (1 - el.e**2)
    k = n * J2 * (R / p) ** 2
    raan_dot = -1.5 * k * np.cos(i)
    argp_dot = 0.75 * k * (5 * np.cos(i) ** 2 - 1)
    m_dot = 0.75 * k * np.sqrt(1 - el.e**2) * (3 * np.cos(i) ** 2 - 1)
    return float(raan_dot), float(argp_dot), float(m_dot)


def orbit_positions(el: Elements | dict, t_unix: ArrayLike, j2: bool = True) -> dict[str, NDArray]:
    """F49 — positions at times t (unix seconds, UTC): inertial and Mars-fixed xyz [m], latitude/longitude [deg], altitude above the
    Mars sphere [m]. APPROXIMATE (two-body + optional J2 secular drift, no drag or third bodies)."""
    el = el if isinstance(el, Elements) else Elements.from_dict(el)
    t = np.atleast_1d(np.asarray(t_unix, dtype=float))
    dt = t - to_unix(el.epoch_utc)
    n = mean_motion(el.a_m)
    raan0, argp0, M0, inc = (np.radians(v) for v in (el.raan_deg, el.argp_deg, el.M0_deg, el.i_deg))
    if j2:
        rd, ad, md = j2_rates(el)
    else:
        rd = ad = md = 0.0
    raan, argp = raan0 + rd * dt, argp0 + ad * dt
    E = solve_kepler(M0 + (n + md) * dt, el.e)
    xp = el.a_m * (np.cos(E) - el.e)
    yp = el.a_m * np.sqrt(1 - el.e**2) * np.sin(E)
    co, so, cw, sw, ci, si = np.cos(raan), np.sin(raan), np.cos(argp), np.sin(argp), np.cos(inc), np.sin(inc)
    x = (co * cw - so * sw * ci) * xp + (-co * sw - so * cw * ci) * yp
    y = (so * cw + co * sw * ci) * xp + (-so * sw + co * cw * ci) * yp
    z = (sw * si) * xp + (cw * si) * yp
    W = np.radians(mars_rotation_deg(t))
    xb, yb = np.cos(W) * x + np.sin(W) * y, -np.sin(W) * x + np.cos(W) * y
    r = np.sqrt(x * x + y * y + z * z)
    R = float(param("constants.R_sphere"))
    return {"t": t, "xyz_inertial": np.column_stack([x, y, z]), "xyz_fixed": np.column_stack([xb, yb, z]),
            "lat_deg": np.degrees(np.arcsin(z / r)), "lon_deg": (np.degrees(np.arctan2(yb, xb)) + 180.0) % 360.0 - 180.0,
            "alt_m": r - R}


def horizon_at(h_rad: ArrayLike, az_deg: ArrayLike) -> NDArray:
    """Terrain horizon angle [rad] at azimuths from an equally spaced profile (azimuth k·360/n), periodic interpolation."""
    h = np.asarray(h_rad, dtype=float)
    n = len(h)
    pos = (np.asarray(az_deg, dtype=float) % 360.0) / (360.0 / n)
    i0 = np.floor(pos).astype(int) % n
    f = pos - np.floor(pos)
    return h[i0] * (1 - f) + h[(i0 + 1) % n] * f


def look_angles(lat_deg: float, lon_deg: float, xyz_fixed: NDArray, site_radius_m: float | None = None) -> tuple[NDArray, NDArray, NDArray]:
    """F50 — topocentric elevation [deg], azimuth [deg, clockwise from north] and range [m] of body-fixed positions."""
    R = float(param("constants.R_sphere")) if site_radius_m is None else site_radius_m
    p, l = np.radians(lat_deg), np.radians(lon_deg)
    up = np.array([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)])
    east = np.array([-np.sin(l), np.cos(l), 0.0])
    north = np.array([-np.sin(p) * np.cos(l), -np.sin(p) * np.sin(l), np.cos(p)])
    d = np.atleast_2d(xyz_fixed) - R * up
    rng = np.linalg.norm(d, axis=1)
    el = np.degrees(np.arcsin(np.clip(d @ up / rng, -1, 1)))
    az = np.degrees(np.arctan2(d @ east, d @ north)) % 360.0
    return el, az, rng


def visible(el_deg: NDArray, az_deg: NDArray, mask_deg: float, horizon_rad: ArrayLike | None) -> NDArray:
    """F50 — True where the elevation is above max(mask, terrain horizon at that azimuth)."""
    limit = np.full_like(el_deg, mask_deg)
    if horizon_rad is not None:
        limit = np.maximum(limit, np.degrees(horizon_at(horizon_rad, az_deg)))
    return el_deg > limit


def _runs(mask: NDArray) -> list[tuple[int, int]]:
    """Index ranges [i0, i1] of consecutive True values."""
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def contact_windows(el: Elements | dict, lat_deg: float, lon_deg: float, t0: str | float, t1: str | float,
                    mask_deg: float | None = None, horizon_rad: ArrayLike | None = None, site_radius_m: float | None = None,
                    step_s: float | None = None, j2: bool = True) -> list[dict]:
    """F51 — passes of an orbiter over a site between t0 and t1 (UTC strings or unix seconds).

    Each pass is a geometric pass above the elevation mask; ``aos``/``los`` and ``duration_s`` describe the part that is also above
    the terrain horizon. A pass fully hidden by terrain is returned with duration 0 and terrain_masked = True.
    """
    el = el if isinstance(el, Elements) else Elements.from_dict(el)
    mask = float(param("navigation.comm_mask_deg")) if mask_deg is None else mask_deg
    step = float(param("navigation.contact_step_s")) if step_s is None else step_s
    a = t0 if isinstance(t0, (int, float)) else to_unix(t0)
    b = t1 if isinstance(t1, (int, float)) else to_unix(t1)
    if b <= a:
        return []
    ts = np.arange(a, b + step, step)

    def sample(t: NDArray) -> tuple[NDArray, NDArray, NDArray]:
        pos = orbit_positions(el, t, j2)
        e, az, _ = look_angles(lat_deg, lon_deg, pos["xyz_fixed"], site_radius_m)
        return e, az, visible(e, az, mask, horizon_rad)

    elev, az, terr = sample(ts)
    geom = elev > mask

    def refine(lo: float, hi: float, want_in_geom: bool, use_terrain: bool) -> float:
        """Bisection for the edge between lo (state != want) and hi (state == want) to 1 s."""
        for _ in range(24):
            mid = 0.5 * (lo + hi)
            e1, a1, v1 = sample(np.array([mid]))
            state = bool(v1[0]) if use_terrain else bool(e1[0] > mask)
            if state == want_in_geom:
                hi = mid
            else:
                lo = mid
            if hi - lo < 0.5:
                break
        return hi if want_in_geom else lo

    out: list[dict] = []
    for i0, i1 in _runs(geom):
        g_aos = ts[i0] if i0 == 0 else refine(ts[i0 - 1], ts[i0], True, False)
        g_los = ts[i1] if i1 == len(ts) - 1 else refine(ts[i1], ts[i1 + 1], False, False)
        max_el = float(elev[i0:i1 + 1].max())
        idx = np.flatnonzero(terr[i0:i1 + 1])
        if idx.size == 0:  # whole pass hidden behind terrain
            out.append({"aos": float(g_aos), "los": float(g_los), "duration_s": 0.0, "max_elevation_deg": max_el,
                        "terrain_masked": True})
            continue
        j0, j1 = i0 + int(idx[0]), i0 + int(idx[-1])
        v_aos = g_aos if j0 == i0 else refine(ts[j0 - 1], ts[j0], True, True)
        v_los = g_los if j1 == i1 else refine(ts[j1], ts[j1 + 1], False, True)
        hidden_samples = int(np.sum(~terr[j0:j1 + 1]))  # gaps inside the visible span, at sampling resolution
        visible_s = max((v_los - v_aos) - hidden_samples * step, 0.0)
        masked = ((g_los - g_aos) - visible_s) > 1.0
        out.append({"aos": float(v_aos), "los": float(v_los), "duration_s": float(visible_s), "max_elevation_deg": max_el,
                    "terrain_masked": bool(masked)})
    return out


# ---------------------------------------------------------------------------------------------- F52 light time
_AU_M = 149597870700.0
# JPL "Keplerian elements for approximate positions of the major planets", Table 1 (1800–2050) [verify]:
# (a [AU], a_dot, e, e_dot, I [deg], I_dot, L [deg], L_dot, varpi [deg], varpi_dot, Omega [deg], Omega_dot), rates per Julian century.
_EM_BARY = (1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981,
            102.93768193, 0.32327364, 0.0, 0.0)
_MARS = (1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499,
         -23.94362959, 0.44441088, 49.55953891, -0.29257343)


def _heliocentric_ecliptic(el: tuple[float, ...], T: float) -> NDArray:
    a = el[0] + el[1] * T
    e = el[2] + el[3] * T
    inc = np.radians(el[4] + el[5] * T)
    L = el[6] + el[7] * T
    varpi = el[8] + el[9] * T
    Om = np.radians(el[10] + el[11] * T)
    omega = np.radians(varpi) - Om
    M = np.mod(np.radians(L - varpi) + np.pi, 2 * np.pi) - np.pi
    E = float(solve_kepler(np.array([M]), float(e))[0])
    xp, yp = a * (np.cos(E) - e), a * np.sqrt(1 - e * e) * np.sin(E)
    co, so, cw, sw, ci, si = np.cos(Om), np.sin(Om), np.cos(omega), np.sin(omega), np.cos(inc), np.sin(inc)
    return np.array([(cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
                     (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
                     (sw * si) * xp + (cw * si) * yp])


def earth_mars_distance_m(utc: str | datetime) -> float:
    """Earth(EM barycentre)–Mars distance [m] from approximate Keplerian elements (APPROXIMATE, ~1 % level)."""
    ts = to_unix(utc)
    T = (float(jd_tt_from_unix(ts)) - J2000_JD) / 36525.0
    return float(np.linalg.norm(_heliocentric_ecliptic(_MARS, T) - _heliocentric_ecliptic(_EM_BARY, T)) * _AU_M)


def earth_mars_light_time(utc: str | datetime) -> dict[str, float]:
    """F52 — one-way light time Earth→Mars [s] and the distance [m]."""
    d = earth_mars_distance_m(utc)
    return {"distance_m": d, "one_way_s": d / float(param("constants.c_light"))}
