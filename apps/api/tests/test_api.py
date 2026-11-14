"""API behaviour tests. They pass with real data (data/processed/gale/L1) and without it (synthetic L0 fallback), so
every point used below lies within ±2 km of the AOI centre."""

import json

import numpy as np
import pytest
from marsnav.geodesy import aoi_to_geo, geo_to_aoi

B = "/api/v1"
CENTER = (-4.72, 137.40)
UTC = "2026-11-14T15:30:00Z"


def wp(lat, lon, role="via"):
    return {"lat": lat, "lon": lon, "role": role}


def test_health_and_sites(client):
    h = client.get(f"{B}/health").json()
    assert h["status"] == "ok" and h["contract_version"] == 1
    sites = client.get(f"{B}/sites").json()
    assert len(sites) == 1 and sites[0]["id"] == "gale"
    for key in ("center", "bbox", "proj_aoi", "base", "data_levels", "default_level", "hazard_resolution_m"):
        assert key in sites[0]
    assert client.get(f"{B}/sites/nowhere").status_code == 404


def test_route_and_alternatives_contract(client):
    body = {"site_id": "gale", "start_utc": UTC, "waypoints": [wp(*CENTER, "start"), wp(-4.705, 137.41, "goal")]}
    r = client.post(f"{B}/route", json={**body, "profile": "SAFEST"})
    assert r.status_code == 200, r.text
    route = r.json()
    for key in ("route_id", "profile", "geometry", "xy", "totals", "segments", "feasibility", "assumptions", "data_levels", "simulated_inputs"):
        assert key in route
    assert route["geometry"]["type"] == "LineString" and len(route["geometry"]["coordinates"]) >= 2
    assert route["totals"]["time_s"] > 0 and route["totals"]["dose_mSv"] > 0
    alt = client.post(f"{B}/route/alternatives", json=body).json()
    profiles = [x["profile"] for x in alt["routes"]]
    assert profiles == ["FASTEST", "SAFEST", "BALANCED", "SCIENCE"]
    by = {x["profile"]: x for x in alt["routes"]}
    assert by["FASTEST"]["totals"]["time_s"] <= by["SAFEST"]["totals"]["time_s"] + 1e-6
    assert by["SAFEST"]["totals"]["risk"] <= by["FASTEST"]["totals"]["risk"] + 1e-6


def test_pareto_and_uncertainty_endpoints(client):
    body = {"site_id": "gale", "start_utc": UTC, "waypoints": [wp(*CENTER, "start"), wp(-4.705, 137.41, "goal")]}
    p = client.post(f"{B}/route/pareto", json={**body, "n_points": 5})
    assert p.status_code == 200, p.text
    res = p.json()
    assert 1 <= len(res["routes"]) <= 5 and res["knee_route_id"] in {r["route_id"] for r in res["routes"]}
    assert [f["time_s"] for f in res["front"]] == sorted(f["time_s"] for f in res["front"])
    u = client.post(f"{B}/route/uncertainty", json={"route": body, "runs": 30, "seed": 7})
    assert u.status_code == 200, u.text
    q = u.json()["quantiles"]
    for key in ("time_s", "dose_mSv", "energy_kJ", "o2_l"):
        assert len(q[key]) == 3 and q[key][0] <= q[key][1] <= q[key][2]
    assert client.post(f"{B}/route/uncertainty", json={"route": body, "runs": 5}).status_code == 422


def test_route_errors_are_human_readable(client):
    far = {"site_id": "gale", "waypoints": [wp(*CENTER), wp(10.0, 10.0)]}
    r = client.post(f"{B}/route", json=far)
    assert r.status_code == 400 and r.json()["code"] == "OUT_OF_AOI" and "outside" in r.json()["message"]
    assert client.post(f"{B}/route", json={"site_id": "gale", "waypoints": [wp(*CENTER)]}).status_code == 422
    assert client.post(f"{B}/route", json={"site_id": "mars2", "waypoints": [wp(*CENTER), wp(*CENTER)]}).status_code == 404


def test_places_search_and_coordinates(client):
    found = client.get(f"{B}/places/search", params={"q": "bradbury"}).json()
    assert found and found[0]["kind"] == "base"
    coord = client.get(f"{B}/places/search", params={"q": "-4.7, 137.4"}).json()
    assert coord[0]["kind"] == "coordinate" and coord[0]["lat"] == pytest.approx(-4.7)
    assert client.get(f"{B}/sites/gale/places").json()[0]["id"] == "gale.base"


def test_whats_here_sun_environment(client):
    w = client.get(f"{B}/sites/gale/whats-here", params={"lat": CENTER[0], "lon": CENTER[1], "utc": UTC}).json()
    assert w["elevation_m"] is not None and 0 <= w["slope_deg"] < 90 and 0 < w["sky_fraction"] <= 1
    s = client.get(f"{B}/sun", params={"lat": CENTER[0], "lon": CENTER[1], "utc": UTC}).json()
    assert -90 <= s["elevation_deg"] <= 90 and 0 <= s["azimuth_deg"] < 360
    e = client.get(f"{B}/environment", params={"site_id": "gale", "lat": CENTER[0], "lon": CENTER[1], "utc": UTC}).json()
    assert e["dose_rate_mSv_h"] > 0 and "surface_temp_K" in e["simulated_fields"]
    assert client.get(f"{B}/sun", params={"lat": 0, "lon": 0, "utc": "not-a-time"}).status_code == 400


def test_sun_compass_roundtrip(client):
    s = client.get(f"{B}/sun", params={"lat": CENTER[0], "lon": CENTER[1], "utc": UTC}).json()
    beta = (s["azimuth_deg"] - 123.0) % 360
    r = client.post(f"{B}/localize/sun-compass", json={"utc": UTC, "approx_position": {"lat": CENTER[0], "lon": CENTER[1]}, "beta_deg": beta}).json()
    assert r["heading_deg"] == pytest.approx(123.0, abs=1e-6)
    assert any("Magnetic" in x for x in r["warnings"])


def test_resection_roundtrip(client):
    true_x, true_y = 150.0, -80.0
    lm_xy = [(1500.0, 1200.0), (-1300.0, 900.0), (200.0, -1600.0)]
    obs = []
    for x, y in lm_xy:
        lat, lon = aoi_to_geo(x, y)
        bearing = float(np.degrees(np.arctan2(x - true_x, y - true_y)) % 360)
        obs.append({"landmark": {"lat": float(lat), "lon": float(lon)}, "bearing_deg": bearing, "sigma_deg": 1.0})
    r = client.post(f"{B}/localize/resection", json={"site_id": "gale", "observations": obs, "heading_known": True}).json()
    assert r["converged"] and np.hypot(r["xy"]["x"] - true_x, r["xy"]["y"] - true_y) < 0.01
    assert r["ellipse"]["semi_major_m"] >= r["ellipse"]["semi_minor_m"] > 0 and r["gdop"] > 0
    lat, lon = aoi_to_geo(true_x, true_y)
    assert r["position"]["lat"] == pytest.approx(float(lat), abs=1e-7)
    one = client.post(f"{B}/localize/resection", json={"site_id": "gale", "observations": obs[:1], "heading_known": True})
    assert one.status_code == 422


def test_back_to_base_and_off_route(client):
    lat, lon = aoi_to_geo(-1200.0, 900.0)
    base = aoi_to_geo(300.0, -300.0)
    r = client.post(f"{B}/route/back-to-base", json={"site_id": "gale", "position": {"lat": float(lat), "lon": float(lon)},
                                                    "base": {"lat": float(base[0]), "lon": float(base[1])}, "start_utc": UTC}).json()
    assert 0 <= r["bearing_deg"] < 360 and r["distance_m"] >= r["straight_distance_m"] - 1e-6
    p_lat, p_lon = aoi_to_geo(50.0, 0.0)
    payload = {"route_xy": [[0, 0], [100, 0], [100, 100]], "position": {"lat": float(p_lat), "lon": float(p_lon)}}
    o = client.post(f"{B}/route/off-route", json=payload).json()
    assert o["distance_m"] == pytest.approx(0.0, abs=0.01) and o["progress_m"] == pytest.approx(50.0, abs=0.01) and o["reroute"] is False


def test_route_verdict_and_watney_fields(client):
    body = {"site_id": "gale", "start_utc": UTC, "waypoints": [wp(*CENTER, "start"), wp(-4.705, 137.41, "goal")]}
    r = client.post(f"{B}/route", json={**body, "profile": "SAFEST"}).json()
    assert r["verdict"]["call"] in ("READY", "CAUTION", "NO_GO") and isinstance(r["verdict"]["reasons"], list)
    for key in ("shelter_time_s", "turnback_distance_m", "o2_depleted_at_m", "o2_depleted_at_s", "sunset_in_s"):
        assert key in r["totals"]
    assert r["totals"]["sunset_in_s"] is None or r["totals"]["sunset_in_s"] >= 0
    short = client.post(f"{B}/route", json={**body, "astronaut": {"eva_max_s": 600}}).json()
    assert short["verdict"]["call"] == "NO_GO" and short["verdict"]["reasons"]


def test_space_weather_alerts_with_stubbed_donki(client, monkeypatch):
    from app import spaceweather

    sim = {"simulationID": "S1", "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/WSA-ENLIL/1/-1",
           "cmeInputs": [{"speed": 600.0}],
           "impactList": [{"location": "Mars", "arrivalTime": "2026-11-13T12:00Z", "isGlancingBlow": True, "isMinorImpact": False},
                          {"location": "Earth", "arrivalTime": "2026-11-12T12:00Z"}]}
    monkeypatch.setattr(spaceweather, "fetch_simulations", lambda s, e: [sim])
    live = client.get(f"{B}/alerts/space-weather", params={"mode": "live", "from": "2026-10-15T00:00:00Z", "to": "2026-11-14T00:00:00Z"}).json()
    assert len(live) == 1 and live[0]["kind"] == "CME" and live[0]["mode"] == "live" and "glancing" in live[0]["message"]
    assert live[0]["link"].startswith("https://ccmc.gsfc.nasa.gov/")
    assert client.get(f"{B}/alerts/space-weather", params={"mode": "replay"}).json()[0]["mode"] == "replay"
    drill = client.get(f"{B}/alerts/space-weather", params={"mode": "simulated"}).json()[0]
    assert drill["kind"] == "SEP" and drill["mode"] == "simulated" and "SIMULATED" in drill["message"]

    import httpx

    def boom(s, e):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(spaceweather, "fetch_simulations", boom)
    off = client.get(f"{B}/alerts/space-weather", params={"mode": "live"}).json()
    assert off[0]["kind"] == "DATA_QUALITY" and "not checked" in off[0]["message"]


def test_sources_list_has_credit_for_every_product(client):
    items = client.get(f"{B}/sources").json()
    assert isinstance(items, list)
    for p in items:
        assert p["credit"] and p["source_url"] and isinstance(p["simulated"], bool)


def test_site_clock_matches_sol_atlas_reference(client):
    """Independent cross-check: the Sol Atlas site showed Perseverance sol 2039 and a 10m59s link delay on 2026-11-14 08:31 UTC.
    Same formulas for the Gale/Curiosity clock: sol 5074 by hand (5213 Earth days / 1.02749)."""
    c = client.get(f"{B}/sites/gale/clock", params={"utc": "2026-11-14T08:31:31Z"}).json()
    assert c["mission_sol"] == 5074 and c["mission_name"].startswith("Curiosity")
    assert 0 <= c["lmst_h"] < 24 and 0 <= c["ls_deg"] < 360
    assert c["earth_link_one_way_s"] == pytest.approx(659.0, abs=2.0)
    assert client.get(f"{B}/sites/nowhere/clock").status_code == 404


def test_light_time(client):
    r = client.get(f"{B}/earth/light-time", params={"utc": UTC}).json()
    assert 180 < r["one_way_s"] < 1340 and r["accuracy"] == "approximate"


def test_orbiters_and_comms_windows(client, tmp_path, monkeypatch):
    from app import sites

    mro_like = {"id": "test.relay", "name": "Test relay (SIMULATED elements)", "agency": "test", "status": "active", "relay_capable": True,
                "accuracy": "approximate", "source": "unit test", "credit": "test",
                "elements": {"a_m": 3686190.0, "e": 0.0, "i_deg": 92.7, "raan_deg": 40.0, "argp_deg": 0.0, "M0_deg": 0.0,
                             "epoch_utc": "2026-11-14T00:00:00Z"}}
    (tmp_path / "orbiters.json").write_text(json.dumps({"orbiters": [mro_like]}), encoding="utf-8")
    real_root = sites.data_root()
    monkeypatch.setattr(sites, "data_root", lambda: tmp_path)
    listed = client.get(f"{B}/orbiters").json()
    assert listed[0]["id"] == "test.relay"
    st = client.get(f"{B}/orbiters/states", params={"utc": UTC}).json()
    assert st[0]["id"] == "test.relay" and abs(st[0]["alt_m"] - 290000.0) < 5000 and -90 <= st[0]["lat"] <= 90
    assert len(st[0]["xyz_bodyfixed_m"]) == 3
    monkeypatch.setattr(sites, "data_root", lambda: real_root)  # the grid layers live in the real data root
    monkeypatch.setattr(sites, "load_orbiters", lambda: [mro_like])
    w = client.get(f"{B}/comms/windows", params={"site_id": "gale", "from": "2026-11-14T00:00:00Z", "to": "2026-11-16T00:00:00Z",
                                                "lat": CENTER[0], "lon": CENTER[1]}).json()
    assert len(w) >= 1
    assert [x["aos_utc"] for x in w] == sorted(x["aos_utc"] for x in w)
    for x in w:
        assert x["orbiter_id"] == "test.relay" and x["duration_s"] >= 0 and x["los_utc"] > x["aos_utc"] and isinstance(x["terrain_masked"], bool)
    too_long = client.get(f"{B}/comms/windows", params={"site_id": "gale", "from": "2026-11-14T00:00:00Z", "to": "2026-12-14T00:00:00Z"})
    assert too_long.status_code == 400


def test_geo_aoi_helpers_consistent():
    x, y = geo_to_aoi(*CENTER)
    assert abs(float(x)) < 1e-6 and abs(float(y)) < 1e-6
