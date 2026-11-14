"""Tests for landing sites, Gale places, and POV images (Ticket T-104, Decision D-13)."""

from __future__ import annotations

import json
from pathlib import Path
import pytest

DATA_ROOT = Path(__file__).resolve().parents[2]
PROCESSED = DATA_ROOT / "processed"
RAW = DATA_ROOT / "raw" / "msl"
import sys
sys.path.insert(0, str(DATA_ROOT / "pipeline"))
from aoi import aoi_bbox_geo


@pytest.fixture
def aoi_bbox():
    return aoi_bbox_geo()


@pytest.fixture
def waypoints_sol_map():
    wp_file = RAW / "MSL_waypoints.json"
    assert wp_file.is_file(), f"Missing {wp_file}"
    data = json.loads(wp_file.read_text(encoding="utf-8"))
    sol_map = {}
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        sol = props.get("sol")
        coords = geom.get("coordinates")
        if sol is not None and coords and len(coords) >= 2:
            # coords are [lon, lat]
            sol_map[int(sol)] = (float(coords[1]), float(coords[0]))
    return sol_map


def test_landing_sites():
    f = PROCESSED / "landing_sites.json"
    assert f.is_file(), f"Missing {f}"
    data = json.loads(f.read_text(encoding="utf-8"))
    assert "sites" in data
    sites = data["sites"]
    assert len(sites) >= 9

    required_keys = {"id", "name", "mission", "year", "lat", "lon", "status", "source_url", "evidence"}
    curiosity_found = False

    for s in sites:
        assert required_keys <= set(s.keys()), f"Missing keys in {s['id']}"
        assert -90.0 <= s["lat"] <= 90.0
        assert -180.0 <= s["lon"] <= 180.0
        assert s["source_url"].startswith("http")
        assert len(s["evidence"]) > 5

        if s["id"] == "curiosity":
            curiosity_found = True
            assert s["status"] == "open"
        else:
            assert s["status"] == "locked"
            assert s.get("label") == "Phase 2"

    assert curiosity_found, "Curiosity Gale landing site missing from landing_sites.json"


def test_gale_places_within_aoi(aoi_bbox):
    f = PROCESSED / "gale" / "places.json"
    assert f.is_file(), f"Missing {f}"
    data = json.loads(f.read_text(encoding="utf-8"))
    places = data.get("places", data)
    assert len(places) >= 10

    place_ids = {p["id"] for p in places}
    assert "gale.base" in place_ids
    assert "gale.boxwork_region" in place_ids
    assert "gale.rover_now" in place_ids

    valid_kinds = {"gazetteer", "mission_informal", "base", "user", "coordinate"}

    for p in places:
        assert "id" in p and "name" in p and "lat" in p and "lon" in p and "source" in p
        assert p["kind"] in valid_kinds
        assert "evidence" in p
        assert "sols" in p and len(p["sols"]) == 2

        # Check inside Gale AOI bbox
        lat, lon = p["lat"], p["lon"]
        assert aoi_bbox["lat_min"] <= lat <= aoi_bbox["lat_max"], f"{p['id']} lat {lat} outside AOI"
        assert aoi_bbox["lon_min"] <= lon <= aoi_bbox["lon_max"], f"{p['id']} lon {lon} outside AOI"


def test_gale_pov_schema_and_https(aoi_bbox):
    f = PROCESSED / "gale" / "pov.json"
    assert f.is_file(), f"Missing {f}"
    data = json.loads(f.read_text(encoding="utf-8"))
    images = data.get("images", data)
    assert 8 <= len(images) <= 10

    required_keys = {"url", "thumbnail_url", "camera", "sol", "credit", "lat", "lon", "position_quality"}

    for img in images:
        assert required_keys <= set(img.keys())
        assert img["url"].startswith("https://"), f"URL not HTTPS: {img['url']}"
        assert img["thumbnail_url"].startswith("https://"), f"Thumbnail not HTTPS: {img['thumbnail_url']}"
        assert img["position_quality"] in {"exact", "approximate"}
        assert "NASA" in img["credit"]

        # Inside AOI
        assert aoi_bbox["lat_min"] <= img["lat"] <= aoi_bbox["lat_max"]
        assert aoi_bbox["lon_min"] <= img["lon"] <= aoi_bbox["lon_max"]


def test_pov_sol_matches_waypoints(waypoints_sol_map):
    f = PROCESSED / "gale" / "pov.json"
    data = json.loads(f.read_text(encoding="utf-8"))
    images = data.get("images", data)

    for img in images:
        sol = img["sol"]
        if img["position_quality"] == "exact":
            assert sol in waypoints_sol_map, f"Sol {sol} claimed exact but missing in waypoints"
            wp_lat, wp_lon = waypoints_sol_map[sol]
            assert abs(img["lat"] - wp_lat) < 1e-5, f"Sol {sol} lat mismatch: {img['lat']} vs {wp_lat}"
            assert abs(img["lon"] - wp_lon) < 1e-5, f"Sol {sol} lon mismatch: {img['lon']} vs {wp_lon}"
