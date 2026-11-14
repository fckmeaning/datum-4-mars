"""Geodesy on the Mars sphere (F01–F04). Angles in degrees at the API boundary, radians inside.

Conventions: planetocentric latitude, east-positive longitude, sphere R from config (constants.R_sphere).
The AOI projection (F03) is the transverse Mercator string ``proj_aoi`` from contracts/projection.json.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
from numpy.typing import ArrayLike, NDArray
from pyproj import CRS, Transformer

from marsnav.config import param, projection


def _R() -> float:
    return float(param("constants.R_sphere"))


def haversine(lat1: ArrayLike, lon1: ArrayLike, lat2: ArrayLike, lon2: ArrayLike, R: float | None = None) -> NDArray:
    """F01 — great-circle distance on the Mars sphere [m]. Inputs in degrees."""
    R = _R() if R is None else R
    p1, l1, p2, l2 = (np.radians(np.asarray(v, dtype=float)) for v in (lat1, lon1, lat2, lon2))
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin((l2 - l1) / 2) ** 2
    return 2.0 * R * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def initial_bearing(lat1: ArrayLike, lon1: ArrayLike, lat2: ArrayLike, lon2: ArrayLike) -> NDArray:
    """F02 — initial great-circle bearing, degrees clockwise from north in [0, 360)."""
    p1, l1, p2, l2 = (np.radians(np.asarray(v, dtype=float)) for v in (lat1, lon1, lat2, lon2))
    dl = l2 - l1
    y = np.sin(dl) * np.cos(p2)
    x = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    return np.mod(np.degrees(np.arctan2(y, x)), 360.0)


@lru_cache(maxsize=4)
def _transformers(proj_aoi: str, proj_geo: str) -> tuple[Transformer, Transformer]:
    geo, aoi = CRS.from_proj4(proj_geo), CRS.from_proj4(proj_aoi)
    return (Transformer.from_crs(geo, aoi, always_xy=True), Transformer.from_crs(aoi, geo, always_xy=True))


def aoi_crs_strings() -> tuple[str, str]:
    p = projection()
    return p["proj_aoi"], p["proj_geographic"]


def geo_to_aoi(lat: ArrayLike, lon: ArrayLike, proj_aoi: str | None = None) -> tuple[NDArray, NDArray]:
    """F03 — (lat, lon) degrees → AOI projection (x east, y north) metres."""
    pa, pg = aoi_crs_strings()
    fwd, _ = _transformers(proj_aoi or pa, pg)
    x, y = fwd.transform(np.asarray(lon, dtype=float), np.asarray(lat, dtype=float))
    return np.asarray(x), np.asarray(y)


def aoi_to_geo(x: ArrayLike, y: ArrayLike, proj_aoi: str | None = None) -> tuple[NDArray, NDArray]:
    """F03 — AOI metres → (lat, lon) degrees, lon wrapped to [-180, 180)."""
    pa, pg = aoi_crs_strings()
    _, inv = _transformers(proj_aoi or pa, pg)
    lon, lat = inv.transform(np.asarray(x, dtype=float), np.asarray(y, dtype=float))
    lon = (np.asarray(lon) + 180.0) % 360.0 - 180.0
    return np.asarray(lat), lon


def curvature_drop(d: ArrayLike, R: float | None = None) -> NDArray:
    """F04 — drop of the sphere below the local tangent plane at distance d [m]: d²/(2R)."""
    R = _R() if R is None else R
    d = np.asarray(d, dtype=float)
    return d * d / (2.0 * R)


def bearing_xy(x0: ArrayLike, y0: ArrayLike, x1: ArrayLike, y1: ArrayLike) -> NDArray:
    """Planar bearing in the AOI projection, degrees clockwise from grid north in [0, 360)."""
    return np.mod(np.degrees(np.arctan2(np.asarray(x1) - x0, np.asarray(y1) - y0)), 360.0)
