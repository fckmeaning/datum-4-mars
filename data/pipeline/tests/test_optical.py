"""Tests for optical products: Gale L3 2 m orthophoto and Mars 4K globe texture (T-105)."""

from __future__ import annotations

import json
import sys
from pathlib import Path
import pytest
import rasterio
from PIL import Image

DATA_ROOT = Path(__file__).resolve().parents[2]
PROCESSED = DATA_ROOT / "processed"
MANIFEST = DATA_ROOT / "manifest.yaml"

sys.path.insert(0, str(DATA_ROOT / "pipeline"))
from aoi import aoi_crs, grid_for


def test_globe_texture_file_and_metadata():
    jpg_path = PROCESSED / "globe" / "mars_color_4k.jpg"
    json_path = PROCESSED / "globe" / "mars_color_4k.json"

    assert jpg_path.is_file(), f"Missing {jpg_path}"
    assert json_path.is_file(), f"Missing {json_path}"

    # Check JPEG dimensions
    with Image.open(jpg_path) as im:
        assert im.size == (4096, 2048), f"Unexpected size {im.size}"
        assert im.mode in ("RGB", "L"), f"Unexpected mode {im.mode}"

    # File size should be well under 20 MB
    size_mb = jpg_path.stat().st_size / (1024 * 1024)
    assert 0.5 <= size_mb <= 20.0, f"Unexpected file size {size_mb:.2f} MB"

    # Sidecar check
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    assert "credit" in meta
    assert "projection" in meta
    assert meta.get("width") == 4096
    assert meta.get("height") == 2048


def test_optical_layer_meta():
    json_path = PROCESSED / "gale" / "L3" / "optical.json"
    assert json_path.is_file(), f"Missing {json_path}"

    meta = json.loads(json_path.read_text(encoding="utf-8"))
    assert meta.get("id") == "gale.L3.optical"
    assert meta.get("site_id") == "gale"
    assert meta.get("family") == "optical"
    assert meta.get("unit") == "DN"
    assert meta.get("colormap") == "gray"
    assert meta.get("display_tint") is True
    assert meta.get("level") == "L3"
    assert meta.get("cog_url") == "/data/gale/L3/optical.tif"
    assert "credit" in meta
    assert "NASA" in meta["credit"]
    assert "value_range" in meta and len(meta["value_range"]) == 2


def test_optical_tif_grid_and_overviews():
    tif_path = PROCESSED / "gale" / "L3" / "optical.tif"
    assert tif_path.is_file(), f"Missing {tif_path}"

    size_mb = tif_path.stat().st_size / (1024 * 1024)
    assert size_mb <= 80.0, f"optical.tif exceeds 80 MB: {size_mb:.1f} MB"

    with rasterio.open(tif_path) as src:
        assert src.dtypes[0] == "uint8", f"Expected uint8, got {src.dtypes[0]}"
        assert src.count == 1

        tr2, w2, h2 = grid_for(2.0)
        assert src.width == w2, f"Width mismatch: {src.width} vs {w2}"
        assert src.height == h2, f"Height mismatch: {src.height} vs {h2}"

        # Overviews must exist on COG
        ovr = src.overviews(1)
        assert len(ovr) >= 2, f"Expected overviews on COG, got {ovr}"
