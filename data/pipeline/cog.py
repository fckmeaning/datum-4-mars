"""Cloud-Optimized GeoTIFF (COG) and LayerMeta sidecar writer."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np


def write_cog(
    path: Path | str,
    array: np.ndarray,
    transform: Any,
    crs: Any,
    nodata: float | int | None,
    meta_dict: dict[str, Any],
    dtype: str = "float32",
    compress: str = "DEFLATE",
) -> Path:
    """Write a Cloud-Optimized GeoTIFF (float32 or uint8, DEFLATE, overviews) and LayerMeta JSON sidecar.

    Args:
        path: Output file path (.tif).
        array: 2D numpy array with data.
        transform: Affine transform.
        crs: CRS object or PROJ string.
        nodata: Nodata value.
        meta_dict: Metadata dictionary matching contracts/openapi.yaml LayerMeta.
        dtype: Data type ('float32' or 'uint8').
        compress: Compression codec ('DEFLATE' or 'JPEG').

    Returns:
        Path to written COG file.
    """
    import rasterio
    from rasterio.crs import CRS
    from rasterio.io import MemoryFile

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if dtype == "uint8":
        arr = array.astype("uint8")
        predictor = 2
    else:
        arr = np.where(np.isfinite(array), array, nodata).astype("float32")
        predictor = 3

    if isinstance(crs, str):
        crs_obj = CRS.from_proj4(crs)
    elif hasattr(crs, "to_proj4"):
        crs_obj = CRS.from_proj4(crs.to_proj4())
    else:
        crs_obj = crs

    profile = {
        "driver": "GTiff",
        "height": arr.shape[0],
        "width": arr.shape[1],
        "count": 1,
        "dtype": dtype,
        "crs": crs_obj,
        "transform": transform,
    }
    if nodata is not None:
        profile["nodata"] = nodata

    with MemoryFile() as mem:
        with mem.open(**profile) as tmp:
            tmp.write(arr, 1)
            factors = [f for f in (2, 4, 8, 16, 32) if min(arr.shape) // f >= 16]
            if factors:
                resampling = rasterio.enums.Resampling.nearest if dtype == "uint8" else rasterio.enums.Resampling.average
                tmp.build_overviews(factors, resampling)
            cog_opts = {
                "driver": "COG",
                "height": arr.shape[0],
                "width": arr.shape[1],
                "count": 1,
                "dtype": dtype,
                "crs": crs_obj,
                "transform": transform,
                "compress": compress,
                "blocksize": 256,
            }
            if compress == "DEFLATE":
                cog_opts["predictor"] = predictor
            if nodata is not None:
                cog_opts["nodata"] = nodata

            with rasterio.open(path, "w", **cog_opts) as dst:
                dst.write(tmp.read(1), 1)

    finite = arr[arr != nodata] if nodata is not None else arr
    meta = dict(meta_dict)
    meta.setdefault("value_range", [float(finite.min()), float(finite.max())] if finite.size else [0.0, 0.0])
    meta.setdefault("nodata", nodata)

    json_path = path.with_suffix(".json")
    json_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return path
