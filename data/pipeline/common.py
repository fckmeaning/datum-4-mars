"""Shared helpers for the data pipeline: AOI grid, COG + LayerMeta writer, manifest."""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aoi import aoi_bbox_geo, aoi_crs, geo_crs, grid_for, projection  # noqa: F401
from cog import write_cog  # noqa: F401

REPO = Path(__file__).resolve().parents[2]
PROCESSED = REPO / "data" / "processed"
MANIFEST = REPO / "data" / "manifest.yaml"


def gdal_env() -> dict[str, str]:
    """GDAL settings for fast, polite remote windowed reads over HTTP range requests."""
    env = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF,.tiff",
        "GDAL_HTTP_MULTIRANGE": "YES",
        "GDAL_HTTP_USERAGENT": "marsnav-hackathon/0.1",
        "VSI_CACHE": "TRUE",
    }
    try:
        import certifi

        env["CURL_CA_BUNDLE"] = os.environ.get("CURL_CA_BUNDLE", certifi.where())
    except ImportError:
        pass
    return env


def aoi_grid(resolution_m: float) -> tuple[object, int, int, str]:
    """AOI grid in the AOI projection: (affine transform, width, height, proj string)."""
    tr, width, height = grid_for(resolution_m)
    return tr, width, height, aoi_crs()


def upsert_manifest(entry: dict[str, Any]) -> None:
    """Upsert an entry in data/manifest.yaml by product id."""
    data = yaml.safe_load(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.is_file() else None
    data = data or {"version": 1, "products": []}
    data["products"] = [p for p in data.get("products", []) if p.get("id") != entry["id"]] + [entry]
    MANIFEST.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


def now_utc() -> str:
    """Current UTC timestamp in ISO 8601 format."""
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
