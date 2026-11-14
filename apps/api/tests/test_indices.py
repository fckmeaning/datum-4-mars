"""Index endpoints, tested on a small app that mounts the router with main's error handler (main.py will include the router itself)."""

from __future__ import annotations

import numpy as np
import pytest
from app import indices, main
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

B = "/api/v1/sites/gale"


@pytest.fixture(scope="module")
def api():
    app = FastAPI()
    app.add_exception_handler(HTTPException, main.http_error)
    app.include_router(indices.router)
    return TestClient(app)


def test_isochrones_feature_collection(api):
    r = api.get(f"{B}/isochrones", params={"minutes": "15,30,60", "level": "L1"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/geo+json"), r.text
    fc = r.json()
    assert fc["type"] == "FeatureCollection"
    mins = [f["properties"]["minutes"] for f in fc["features"]]
    assert mins == [15.0, 30.0, 60.0]
    km2 = [f["properties"]["reachable_km2"] for f in fc["features"]]
    assert km2[0] < km2[1] < km2[2]
    for f in fc["features"]:
        assert f["geometry"]["type"] == "MultiLineString"
        lon, lat = f["geometry"]["coordinates"][0][0]
        assert -180 <= lon < 180 and abs(lat + 4.7) < 0.6 and abs(lon - 137.4) < 0.6
    assert "WGS 84" in fc["properties"]["coordinate_note"] and fc["properties"]["level"] == "L1"


def test_isochrones_bad_minutes_are_human_errors(api):
    for bad in ("abc", "0,10", "700", ",".join(str(i) for i in range(1, 12))):
        r = api.get(f"{B}/isochrones", params={"minutes": bad, "level": "L1"})
        assert r.status_code == 422 and r.json()["code"] == "BAD_MINUTES", bad


def test_isochrones_unknown_site_and_level(api):
    assert api.get("/api/v1/sites/mars2/isochrones").status_code == 404
    r = api.get(f"{B}/isochrones", params={"level": "L9"})
    assert r.status_code == 422


def test_walkability_summary(api):
    r = api.get(f"{B}/walkability/summary", params={"level": "L1"})
    assert r.status_code == 200, r.text
    s = r.json()
    c = s["counts"]
    assert c["green"] + c["yellow"] + c["red"] + c["no_data"] == s["cells"]
    assert pytest_approx_one(s["shares"]["green"] + s["shares"]["yellow"] + s["shares"]["red"])
    assert 0 <= s["mean_W"] <= 100 and s["resolution_m"] == 200.0
    assert s["inputs_used"] == ["slope", "roughness", "obstacle_density", "data_uncertainty"]
    assert abs(sum(s["weights"].values()) - 1.0) < 1e-3 and s["thresholds"] == {"green_min": 70.0, "yellow_min": 40.0}
    assert "not resolved" in s["limitation"] and s["layer_id"] == "gale.L1.walkability"


def test_walkability_summary_default_level_uses_the_routing_level(api):
    s = api.get(f"{B}/walkability/summary").json()
    assert s["level"] in ("L1", "L2", "L3", "L0")
    assert np.isfinite(s["mean_W"])


def pytest_approx_one(x: float) -> bool:
    return abs(x - 1.0) < 1e-3
