"""Live API integration tests.

Verifies live endpoints on http://127.0.0.1:8000:
- /health
- /sources (credit non-empty for every product)
- /sites/gale/clock (sol 5074 on 2026-11-14T08:31:31Z; link delay 659 ± 2 s)
- places inside the AOI bbox
- traverse.geojson coordinates inside the AOI bbox

Skipped when the server is down or unreachable.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

LIVE_SERVER = "http://127.0.0.1:8000"
API_BASE = f"{LIVE_SERVER}/api/v1"

# Bounding box for Gale AOI from contracts/projection.json
AOI_BBOX = {
    "lat_min": -4.89,
    "lat_max": -4.55,
    "lon_min": 137.27,
    "lon_max": 137.53,
}


def _check_live_server() -> bool:
    """Check if the live API server is responding on http://127.0.0.1:8000."""
    try:
        r = httpx.get(f"{API_BASE}/health", timeout=1.0)
        return r.status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _check_live_server(),
    reason="Live API server at http://127.0.0.1:8000 is not reachable (or down)",
)


def test_live_health() -> None:
    """Check that /health endpoint is operational and reports valid contract status."""
    r = httpx.get(f"{API_BASE}/health", timeout=5.0)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "ok"
    assert data["contract_version"] == 1
    assert "data_levels" in data


def test_live_sources_credit_non_empty() -> None:
    """Check that /sources returns products and every product has a non-empty credit line."""
    r = httpx.get(f"{API_BASE}/sources", timeout=5.0)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list) and len(items) > 0, "Expected non-empty list of data sources"
    for p in items:
        assert p.get("credit"), f"Product {p.get('id')} is missing a non-empty credit"
        assert p.get("source_url"), f"Product {p.get('id')} is missing source_url"
        assert isinstance(p.get("simulated"), bool), f"Product {p.get('id')} simulated must be bool"


def test_live_gale_clock_sol_and_delay() -> None:
    """Check /sites/gale/clock: Sol 5074 on 2026-11-14T08:31:31Z; link delay 659 ± 2 s."""
    r = httpx.get(f"{API_BASE}/sites/gale/clock", params={"utc": "2026-11-14T08:31:31Z"}, timeout=5.0)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["mission_sol"] == 5074, f"Expected mission_sol 5074, got {data.get('mission_sol')}"
    assert data["earth_link_one_way_s"] == pytest.approx(659.0, abs=2.0)
    assert 0 <= data["lmst_h"] < 24
    assert 0 <= data["ls_deg"] < 360


def test_live_places_inside_aoi_bbox() -> None:
    """Check that every place returned by /sites/gale/places lies within the Gale AOI bbox."""
    r = httpx.get(f"{API_BASE}/sites/gale/places", timeout=5.0)
    assert r.status_code == 200, r.text
    places = r.json()
    assert isinstance(places, list) and len(places) > 0, "No places returned for Gale"
    for p in places:
        lat = float(p["lat"])
        lon = float(p["lon"])
        assert (
            AOI_BBOX["lat_min"] <= lat <= AOI_BBOX["lat_max"]
        ), f"Place {p.get('name')} lat {lat} outside bbox [{AOI_BBOX['lat_min']}, {AOI_BBOX['lat_max']}]"
        assert (
            AOI_BBOX["lon_min"] <= lon <= AOI_BBOX["lon_max"]
        ), f"Place {p.get('name')} lon {lon} outside bbox [{AOI_BBOX['lon_min']}, {AOI_BBOX['lon_max']}]"


def test_traverse_coordinates_inside_aoi_bbox(repo_root: Path) -> None:
    """Check that all coordinates in data/processed/gale/traverse.geojson fall inside the AOI bbox."""
    traverse_file = repo_root / "data" / "processed" / "gale" / "traverse.geojson"
    assert traverse_file.exists(), f"traverse.geojson not found at {traverse_file}"

    with open(traverse_file, encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    assert len(features) > 0, "traverse.geojson has no features"
    coords = features[0]["geometry"]["coordinates"]
    assert len(coords) > 0, "traverse.geojson has empty coordinates"

    for pt in coords:
        lon, lat = float(pt[0]), float(pt[1])
        assert (
            AOI_BBOX["lat_min"] <= lat <= AOI_BBOX["lat_max"]
        ), f"Traverse point lat {lat} outside bbox [{AOI_BBOX['lat_min']}, {AOI_BBOX['lat_max']}]"
        assert (
            AOI_BBOX["lon_min"] <= lon <= AOI_BBOX["lon_max"]
        ), f"Traverse point lon {lon} outside bbox [{AOI_BBOX['lon_min']}, {AOI_BBOX['lon_max']}]"
