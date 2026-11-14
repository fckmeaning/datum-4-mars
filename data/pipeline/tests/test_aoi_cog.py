"""Tests for AOI grid math, COG writer, and LayerMeta sidecar generation."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest
import rasterio
import yaml
from rasterio.transform import from_origin

PIPELINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE_DIR))

from aoi import aoi_bbox_geo, aoi_crs, geo_crs, grid_for, projection  # noqa: E402
from cog import write_cog  # noqa: E402
from make_l0_synthetic import generate_synthetic_dem  # noqa: E402

REPO = Path(__file__).resolve().parents[3]


def test_aoi_helpers():
    bbox = aoi_bbox_geo()
    assert "lat_min" in bbox and "lat_max" in bbox
    assert "lon_min" in bbox and "lon_max" in bbox
    assert bbox["lat_min"] < bbox["lat_max"]
    assert bbox["lon_min"] < bbox["lon_max"]

    aoi_proj = aoi_crs()
    assert "+proj=tmerc" in aoi_proj
    assert "+R=3396190" in aoi_proj

    geo_proj = geo_crs()
    assert "+proj=longlat" in geo_proj
    assert "+R=3396190" in geo_proj


def test_grid_size_consistent_with_bbox_and_resolution():
    p = projection()
    b = p["aoi"]["bbox_geo"]

    for res in (200.0, 20.0):
        transform, width, height = grid_for(res)
        assert width > 0
        assert height > 0
        assert transform.a == pytest.approx(res)
        assert transform.e == pytest.approx(-res)

        # Check total area in km roughly matches expected Gale AOI (~20 x ~15 km)
        width_km = (width * res) / 1000.0
        height_km = (height * res) / 1000.0
        assert 10.0 <= width_km <= 30.0
        assert 15.0 <= height_km <= 30.0


def test_cog_roundtrip(tmp_path: Path):
    test_file = tmp_path / "test_dem.tif"
    width, height = 512, 512
    res = 20.0
    transform = from_origin(-5120.0, 5120.0, res, res)
    proj = aoi_crs()
    nodata = -32768.0

    raw = np.linspace(-4000.0, -2000.0, width * height, dtype=np.float32).reshape((height, width))
    raw[0, 0] = np.nan

    meta = {
        "id": "gale.L0.test",
        "site_id": "gale",
        "family": "topography",
        "name": "Test Elevation",
        "unit": "m",
        "colormap": "cividis",
        "resolution_m": res,
        "level": "L0",
        "time_dependent": False,
        "valid_time": None,
        "source_ids": ["test"],
        "credit": "SIMULATED",
        "simulated": True,
        "display_tint": False,
        "uncertainty_note": "test",
        "cog_url": "/data/gale/L0/test_dem.tif",
    }

    out_path = write_cog(test_file, raw, transform, proj, nodata, meta)
    assert out_path.is_file()
    assert out_path.with_suffix(".json").is_file()

    with rasterio.open(out_path) as src:
        assert src.width == width
        assert src.height == height
        assert src.crs.to_proj4() == rasterio.crs.CRS.from_proj4(proj).to_proj4()
        assert src.transform == transform
        assert src.nodata == nodata

        data = src.read(1)
        assert data[0, 0] == nodata
        assert data[1, 1] == pytest.approx(raw[1, 1], rel=1e-5)
        # Check that overviews were built for dimension > blocksize (256)
        assert len(src.overviews(1)) >= 1


def test_layermeta_required_fields_from_contract(tmp_path: Path):
    openapi_doc = yaml.safe_load((REPO / "contracts" / "openapi.yaml").read_text(encoding="utf-8"))
    required_fields = set(openapi_doc["components"]["schemas"]["LayerMeta"]["required"])

    # Check sidecar created by write_cog
    test_file = tmp_path / "layer.tif"
    meta_in = {
        "id": "gale.L0.elevation",
        "site_id": "gale",
        "family": "topography",
        "name": "Elevation",
        "unit": "m",
        "level": "L0",
        "time_dependent": False,
        "credit": "SIMULATED",
        "simulated": True,
        "cog_url": "/data/gale/L0/elevation.tif",
    }
    write_cog(test_file, np.zeros((16, 16), dtype=np.float32), from_origin(0, 0, 10, 10), aoi_crs(), -9999.0, meta_in)

    sidecar = json.loads(test_file.with_suffix(".json").read_text(encoding="utf-8"))
    for field in required_fields:
        assert field in sidecar, f"Missing required LayerMeta field: {field}"

    # Also check L0 and L1 JSON sidecars in data/processed/
    for level in ("L0", "L1"):
        sidecar_path = REPO / "data" / "processed" / "gale" / level / "elevation.json"
        if sidecar_path.is_file():
            data = json.loads(sidecar_path.read_text(encoding="utf-8"))
            for field in required_fields:
                assert field in data, f"Missing field {field} in {sidecar_path}"
            assert len(data["value_range"]) == 2
            assert data["value_range"][0] <= data["value_range"][1]


def test_synthetic_dem_determinism():
    tr, w, h = grid_for(200.0)  # small grid for fast test
    d1 = generate_synthetic_dem(w, h, tr, seed=42)
    d2 = generate_synthetic_dem(w, h, tr, seed=42)
    d3 = generate_synthetic_dem(w, h, tr, seed=123)

    assert np.array_equal(d1, d2)
    assert not np.array_equal(d1, d3)
