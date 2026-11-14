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
    nodata: float,
    meta_dict: dict[str, Any],
) -> Path:
    """Write a Cloud-Optimized GeoTIFF (float32, DEFLATE, overviews) and LayerMeta JSON sidecar.

    Args:
        path: Output file path (.tif).
        array: 2D numpy array with data. Non-finite values will be converted to nodata.
        transform: Affine transform.
        crs: CRS object or PROJ string.
        nodata: Nodata value.
        meta_dict: Metadata dictionary matching contracts/openapi.yaml LayerMeta.

    Returns:
        Path to written COG file.
    """
    import rasterio
    from rasterio.crs import CRS
    from rasterio.io import MemoryFile

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    arr = np.where(np.isfinite(array), array, nodata).astype("float32")

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
        "dtype": "float32",
        "crs": crs_obj,
        "transform": transform,
        "nodata": nodata,
    }

    with MemoryFile() as mem:
        with mem.open(**profile) as tmp:
            tmp.write(arr, 1)
            factors = [f for f in (2, 4, 8, 16) if min(arr.shape) // f >= 16]
            if factors:
                tmp.build_overviews(factors, rasterio.enums.Resampling.average)
            with rasterio.open(
                path,
                "w",
                driver="COG",
                height=arr.shape[0],
                width=arr.shape[1],
                count=1,
                dtype="float32",
                crs=crs_obj,
                transform=transform,
                nodata=nodata,
                compress="DEFLATE",
                predictor=3,
                blocksize=256,
            ) as dst:
                dst.write(tmp.read(1), 1)

    finite = arr[arr != nodata]
    meta = dict(meta_dict)
    meta.setdefault("value_range", [float(finite.min()), float(finite.max())] if finite.size else [0.0, 0.0])
    meta.setdefault("nodata", nodata)

    json_path = path.with_suffix(".json")
    json_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return path
