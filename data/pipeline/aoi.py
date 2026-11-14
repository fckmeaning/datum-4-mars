"""AOI and projection helpers for Gale crater / lower Mount Sharp.

Loads contracts/projection.json and defines grid geometries in the AOI
transverse Mercator projection.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

REPO = Path(__file__).resolve().parents[2]


def projection() -> dict[str, Any]:
    """Load and parse contracts/projection.json."""
    return json.loads((REPO / "contracts" / "projection.json").read_text(encoding="utf-8"))


def aoi_bbox_geo() -> dict[str, float]:
    """Geographic bounding box of the AOI (lat_min, lat_max, lon_min, lon_max)."""
    p = projection()
    return dict(p["aoi"]["bbox_geo"])


def aoi_crs() -> str:
    """PROJ string of the AOI transverse Mercator projection."""
    p = projection()
    return str(p["proj_aoi"])


def geo_crs() -> str:
    """PROJ string of the geographic planetocentric coordinate system."""
    p = projection()
    return str(p["proj_geographic"])


def grid_for(resolution_m: float) -> tuple[Any, int, int]:
    """Calculate the AOI grid in the AOI projection for a given resolution in metres.

    Returns:
        (transform, width, height)
        where transform is an Affine instance (rasterio.transform.Affine),
        width is number of columns, and height is number of rows.
    """
    from pyproj import CRS, Transformer
    from rasterio.transform import from_origin

    p = projection()
    b = p["aoi"]["bbox_geo"]
    tr = Transformer.from_crs(CRS.from_proj4(p["proj_geographic"]), CRS.from_proj4(p["proj_aoi"]), always_xy=True)
    lons = np.linspace(b["lon_min"], b["lon_max"], 21)
    lats = np.linspace(b["lat_min"], b["lat_max"], 21)
    lo, la = np.meshgrid(lons, lats)
    x, y = tr.transform(lo.ravel(), la.ravel())
    x0 = math.floor(min(x) / resolution_m) * resolution_m
    x1 = math.ceil(max(x) / resolution_m) * resolution_m
    y0 = math.floor(min(y) / resolution_m) * resolution_m
    y1 = math.ceil(max(y) / resolution_m) * resolution_m
    width = int(round((x1 - x0) / resolution_m))
    height = int(round((y1 - y0) / resolution_m))
    transform = from_origin(x0, y1, resolution_m, resolution_m)
    return transform, width, height
