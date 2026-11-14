"""Export, viewshed, rover and skyline endpoints. Routes use level L1 (200 m) so the tests stay fast."""

from __future__ import annotations

import base64

import numpy as np
import pytest
from app import sites

B = "/api/v1"
UTC = "2026-11-14T15:30:00Z"
CENTER = (-4.72, 137.40)


def wp(lat, lon, role="via"):
    return {"lat": lat, "lon": lon, "role": role}


@pytest.fixture(scope="module")
def l1_route(client):
    body = {"site_id": "gale", "level": "L1", "start_utc": UTC, "profile": "SAFEST",
            "waypoints": [wp(*CENTER, "start"), wp(-4.705, 137.41, "goal")]}
    r = client.post(f"{B}/route", json=body)
    assert r.status_code == 200, r.text
    return r.json(), body["waypoints"]


def test_export_is_rfc7946_without_crs(client, l1_route):
    route, waypoints = l1_route
    r = client.post(f"{B}/route/export", json={"route": route, "waypoints": [{"lat": w["lat"], "lon": w["lon"]} for w in waypoints]})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/geo+json")
    gj = r.json()
    assert gj["type"] == "FeatureCollection" and "crs" not in gj
    line = next(f for f in gj["features"] if f["geometry"]["type"] == "LineString")
    lon, lat = line["geometry"]["coordinates"][0][:2]
    assert -180 <= lon < 180 and abs(lat - CENTER[0]) < 0.05 and abs(lon - CENTER[1]) < 0.05
    assert "Mars" in str(gj["properties"]["coordinate_note"])


def test_export_download_header_and_bad_route(client, l1_route):
    route, _ = l1_route
    r = client.post(f"{B}/route/export", params={"download": "true"}, json={"route": route})
    assert "attachment" in r.headers["content-disposition"]
    bad = client.post(f"{B}/route/export", json={"route": {"geometry": {"type": "LineString", "coordinates": []}}})
    assert bad.status_code == 422 and bad.json()["code"] == "BAD_ROUTE"


def test_viewshed_mask_matches_crop(client):
    r = client.get(f"{B}/sites/gale/viewshed", params={"lat": CENTER[0], "lon": CENTER[1], "radius_m": 1500, "level": "L1"})
    assert r.status_code == 200, r.text
    v = r.json()
    rows, cols = v["crop"]["rows"], v["crop"]["cols"]
    bits = np.unpackbits(np.frombuffer(base64.b64decode(v["visible_b64"]), dtype=np.uint8))[: rows * cols]
    assert bits.size == rows * cols and 0 < v["visible_fraction"] <= 1
    r0, c0 = v["observer"]["row"] - v["crop"]["row0"], v["observer"]["col"] - v["crop"]["col0"]
    assert bits.reshape(rows, cols)[r0, c0] == 1  # the observer sees its own cell
    assert v["bounds"]["north_west"]["lat"] > v["bounds"]["south_east"]["lat"]


def test_viewshed_outside_area_is_a_human_error(client):
    r = client.get(f"{B}/sites/gale/viewshed", params={"lat": 10.0, "lon": 10.0})
    assert r.status_code == 400 and r.json()["code"] == "OUT_OF_AOI"
    assert client.get(f"{B}/sites/gale/viewshed", params={"lat": CENTER[0], "lon": CENTER[1], "radius_m": 5}).status_code == 422


def test_rover_route_reports_walkback(client):
    body = {"site_id": "gale", "level": "L1", "start_utc": UTC, "waypoints": [wp(-4.5895, 137.4417, "start"), wp(-4.62, 137.43, "goal")],
            "rover": {"kind": "unpressurised"}}
    r = client.post(f"{B}/route/rover", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["mobility"] == "rover" and "walkback" in out and "feasibility" in out and "verdict" in out
    assert out["walkback"]["margin_min"] is not None


def test_skyline_recovers_a_known_pose(client):
    grid = sites.get_grid("gale", "L1")
    from marsnav.terrain import horizon_profile

    r0, c0 = grid.latlon_to_rc(*CENTER)
    h = np.degrees(horizon_profile(np.where(np.isfinite(grid.z), grid.z, np.nanmin(grid.z)), grid.cell, r0, c0, n_az=72))
    if float(np.ptp(h)) < 0.5:
        pytest.skip("no horizon relief at the test point on this data level")
    heading = 40.0  # the observer looks towards azimuth 40 deg: relative azimuth = absolute - heading
    az_abs = np.arange(72) * 5.0
    rel = ((az_abs - heading + 180.0) % 360.0) - 180.0
    order = np.argsort(rel)
    horizon = [{"az_rel_deg": float(rel[i]), "elev_deg": float(h[i])} for i in order]
    res = client.post(f"{B}/localize/skyline", json={"site_id": "gale", "level": "L1", "horizon": horizon,
                                                      "prior": {"lat": CENTER[0], "lon": CENTER[1]}, "radius_m": 3000})
    assert res.status_code == 200, res.text
    out = res.json()
    assert set(out) >= {"position", "heading_deg", "confidence", "flags", "cov_xy"}
    assert 0.0 <= out["confidence"] <= 1.0
    assert out["candidates"] > 100
    # self-consistent best case (the observation comes from the same DEM): about 100 m on 200 m cells, heading within a degree
    from marsnav.geodesy import geo_to_aoi

    x0, y0 = geo_to_aoi(*CENTER)
    assert np.hypot(out["xy"]["x"] - x0, out["xy"]["y"] - y0) < 400.0
    assert abs(((out["heading_deg"] - heading + 180.0) % 360.0) - 180.0) < 3.0


def test_skyline_rejects_short_or_outside(client):
    short = client.post(f"{B}/localize/skyline", json={"site_id": "gale", "horizon": [{"az_rel_deg": 0, "elev_deg": 1}]})
    assert short.status_code == 422
    out = client.post(f"{B}/localize/skyline", json={"site_id": "gale", "prior": {"lat": 10.0, "lon": 10.0},
                                                      "horizon": [{"az_rel_deg": float(a), "elev_deg": 2.0} for a in range(0, 360, 20)]})
    assert out.status_code == 400 and out.json()["code"] == "OUT_OF_AOI"
