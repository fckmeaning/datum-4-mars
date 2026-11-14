"""Shared helpers for the data pipeline: AOI grid from contracts/projection.json, COG + LayerMeta writer, manifest."""

from __future__ import annotations

import json
import math
import os
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import yaml

REPO = Path(__file__).resolve().parents[2]
PROCESSED = REPO / "data" / "processed"
MANIFEST = REPO / "data" / "manifest.yaml"


def projection() -> dict:
    return json.loads((REPO / "contracts" / "projection.json").read_text(encoding="utf-8"))


def gdal_env() -> dict:
    """GDAL settings for fast, polite remote windowed reads over HTTP range requests."""
    env = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF,.tiff",
           "GDAL_HTTP_MULTIRANGE": "YES", "GDAL_HTTP_USERAGENT": "marsnav-hackathon/0.1", "VSI_CACHE": "TRUE"}
    try:
        import certifi

        env["CURL_CA_BUNDLE"] = os.environ.get("CURL_CA_BUNDLE", certifi.where())
    except ImportError:
        pass
    return env


def aoi_grid(resolution_m: float) -> tuple[object, int, int, str]:
    """AOI grid in the AOI projection: (affine transform, width, height, proj string), snapped to the resolution."""
    from pyproj import CRS, Transformer
    from rasterio.transform import from_origin

    p = projection()
    b = p["aoi"]["bbox_geo"]
    tr = Transformer.from_crs(CRS.from_proj4(p["proj_geographic"]), CRS.from_proj4(p["proj_aoi"]), always_xy=True)
    lons = np.linspace(b["lon_min"], b["lon_max"], 21)
    lats = np.linspace(b["lat_min"], b["lat_max"], 21)
    LO, LA = np.meshgrid(lons, lats)
    x, y = tr.transform(LO.ravel(), LA.ravel())
    x0 = math.floor(min(x) / resolution_m) * resolution_m
    x1 = math.ceil(max(x) / resolution_m) * resolution_m
    y0 = math.floor(min(y) / resolution_m) * resolution_m
    y1 = math.ceil(max(y) / resolution_m) * resolution_m
    width, height = int(round((x1 - x0) / resolution_m)), int(round((y1 - y0) / resolution_m))
    return from_origin(x0, y1, resolution_m, resolution_m), width, height, p["proj_aoi"]


def write_cog(path: Path, array: np.ndarray, transform: object, proj: str, nodata: float, meta: dict) -> Path:
    """Write a Cloud-Optimized GeoTIFF (float32, DEFLATE, overviews) and its LayerMeta JSON sidecar."""
    import rasterio
    from rasterio.crs import CRS
    from rasterio.io import MemoryFile

    path.parent.mkdir(parents=True, exist_ok=True)
    arr = np.where(np.isfinite(array), array, nodata).astype("float32")
    profile = {"driver": "GTiff", "height": arr.shape[0], "width": arr.shape[1], "count": 1, "dtype": "float32",
               "crs": CRS.from_proj4(proj), "transform": transform, "nodata": nodata}
    with MemoryFile() as mem:
        with mem.open(**profile) as tmp:
            tmp.write(arr, 1)
            factors = [f for f in (2, 4, 8, 16) if min(arr.shape) // f >= 16]
            if factors:
                tmp.build_overviews(factors, rasterio.enums.Resampling.average)
            with rasterio.open(path, "w", driver="COG", height=arr.shape[0], width=arr.shape[1], count=1, dtype="float32",
                               crs=profile["crs"], transform=transform, nodata=nodata, compress="DEFLATE",
                               predictor=3, blocksize=256) as dst:
                dst.write(tmp.read(1), 1)
    finite = arr[arr != nodata]
    meta = dict(meta)
    meta.setdefault("value_range", [float(finite.min()), float(finite.max())] if finite.size else [0.0, 0.0])
    meta.setdefault("nodata", nodata)
    path.with_suffix(".json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return path


def upsert_manifest(entry: dict) -> None:
    data = yaml.safe_load(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.is_file() else None
    data = data or {"version": 1, "products": []}
    data["products"] = [p for p in data["products"] if p.get("id") != entry["id"]] + [entry]
    MANIFEST.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


def now_utc() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
