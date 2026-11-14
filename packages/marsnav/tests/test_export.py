"""Route export to RFC 7946 GeoJSON: structure, coordinate order, no crs, elevations, flags."""

import copy
import json

import numpy as np
import pytest

from marsnav.export import GENERATOR, route_to_geojson


def make_route(**over):
    route = {
        "route_id": "r-test-1", "site_id": "gale", "profile": "SAFEST",
        "geometry": {"type": "LineString", "coordinates": [[137.3983, -4.7217, -4159.8], [137.4085, -4.7048, -4250.4]]},
        "xy": [[0.0, 0.0], [600.0, 1000.0]],
        "waypoint_order": [0, 1],
        "totals": {"time_s": 1450.0, "length_m": 1341.6, "ascent_m": 3.0, "descent_m": 94.0, "max_slope_deg": 6.1, "dose_mSv": 0.02,
                   "energy_kJ": 900.0, "o2_l": 31.0, "min_temp_K": None, "risk": 0.2, "sunset_in_s": None},
        "segments": [
            {"i": 0, "start": {"lat": -4.7217, "lon": 137.3983}, "end": {"lat": -4.7149, "lon": 137.4017}, "length_m": 447.2, "duration_s": 483.0,
             "slope_deg": -3.4, "ascent_m": 0.0, "components": {"time": 0.01, "energy": 0.02, "dose": 0.14, "hazard": 0.03, "science_factor": 1.0},
             "cost": 0.2, "limiting_factor": "time", "t_start_utc": "2026-11-14T15:30:00Z",
             "sun": {"elevation_deg": 68.6, "azimuth_deg": 310.7, "shadowed": False},
             "temp_K": 250.0, "dose_rate_mSv_h": 0.03, "energy_kJ": 300.0, "o2_l": 10.0},
            {"i": 1, "start": {"lat": -4.7149, "lon": 137.4017}, "end": {"lat": -4.7048, "lon": 137.4085}, "length_m": 894.4, "duration_s": 967.0,
             "slope_deg": -5.0, "ascent_m": 3.0, "components": {"time": 0.02, "energy": 0.03, "dose": 0.2, "hazard": 0.05, "science_factor": 1.0},
             "cost": 0.3, "limiting_factor": "dose", "t_start_utc": "2026-11-14T15:38:03Z",
             "sun": {"elevation_deg": 68.0, "azimuth_deg": 311.0, "shadowed": False},
             "temp_K": 251.0, "dose_rate_mSv_h": 0.03, "energy_kJ": 600.0, "o2_l": 21.0},
        ],
        "feasibility": {"ok": True, "violations": []},
        "verdict": {"call": "CAUTION", "reasons": ["The return margin is only 12% of the EVA budget."]},
        "uncertainty": None,
        "assumptions": ["Walking speed: normalised Tobler function (ASSUMPTION)."],
        "data_levels": ["L1"], "simulated_inputs": ["surface temperature (default diurnal model)"],
    }
    route.update(over)
    return route


WAYPOINTS = [{"lat": -4.7217, "lon": 137.3983, "role": "start", "name": "Base"}, {"lat": -4.7048, "lon": 137.4085, "role": "goal", "dwell_min": 20}]


def has_key(obj, key):
    if isinstance(obj, dict):
        return key in obj or any(has_key(v, key) for v in obj.values())
    if isinstance(obj, list):
        return any(has_key(v, key) for v in obj)
    return False


def test_feature_collection_structure_and_no_crs():
    fc = route_to_geojson(make_route(), WAYPOINTS)
    assert fc["type"] == "FeatureCollection" and isinstance(fc["features"], list)
    assert not has_key(fc, "crs")  # RFC 7946 removed the member
    kinds = [f["properties"]["featureType"] for f in fc["features"]]
    assert kinds.count("MarsRoute") == 1 and kinds.count("MarsWaypoint") == 2 and kinds.count("MarsRouteSegment") == 2
    for f in fc["features"]:
        assert f["type"] == "Feature" and f["geometry"]["type"] in ("LineString", "Point")
    json.dumps(fc, allow_nan=False)  # strictly JSON: no NaN / numpy scalars


def test_coordinate_order_is_lon_lat_elevation_and_elevations_are_preserved():
    fc = route_to_geojson(make_route(), WAYPOINTS)
    line = fc["features"][0]["geometry"]["coordinates"]
    assert line[0] == [137.3983, -4.7217, -4159.8] and line[1] == [137.4085, -4.7048, -4250.4]
    for lon, lat, z in line:
        assert 137 < lon < 138 and -5 < lat < -4 and z < -4000  # longitude first, then latitude, then metres
    pts = [f for f in fc["features"] if f["properties"]["featureType"] == "MarsWaypoint"]
    assert pts[0]["geometry"]["coordinates"] == [137.3983, -4.7217, -4159.8]  # elevation taken from the geometry vertex
    assert fc["bbox"] == [137.3983, -4.7217, 137.4085, -4.7048]


def test_missing_elevations_give_2d_unless_a_lookup_is_supplied():
    r = make_route(geometry={"type": "LineString", "coordinates": [[137.3983, -4.7217], [137.4085, -4.7048]]})
    fc = route_to_geojson(r, WAYPOINTS)
    assert all(len(p) == 2 for p in fc["features"][0]["geometry"]["coordinates"])
    fc3 = route_to_geojson(r, WAYPOINTS, elevation_at=lambda lat, lon: -4000.0 - 100.0 * (lat + 4.7))
    pos = fc3["features"][0]["geometry"]["coordinates"]
    assert all(len(p) == 3 for p in pos) and pos[0][2] == pytest.approx(-3997.83, abs=0.01)


def test_longitude_is_wrapped_to_minus180_180():
    r = make_route(geometry={"type": "LineString", "coordinates": [[190.0, 10.0, 0.0], [180.0, 11.0, 0.0], [-181.0, 12.0, 0.0]]}, segments=[])
    line = route_to_geojson(r)["features"][0]["geometry"]["coordinates"]
    assert [p[0] for p in line] == [-170.0, -180.0, 179.0]


def test_waypoint_points_carry_cumulative_telemetry_and_visiting_order():
    wp = [{"lat": -4.7048, "lon": 137.4085, "role": "goal"}, {"lat": -4.7217, "lon": 137.3983, "role": "start"}]
    fc = route_to_geojson(make_route(waypoint_order=[1, 0]), wp)
    pts = [f["properties"] for f in fc["features"] if f["properties"]["featureType"] == "MarsWaypoint"]
    assert [p["request_index"] for p in pts] == [1, 0] and [p["stop_index"] for p in pts] == [0, 1]
    assert pts[0]["cumulative_distance_m"] == 0.0 and pts[0]["cumulative_time_s"] == 0.0
    assert pts[1]["cumulative_distance_m"] == pytest.approx(1341.6) and pts[1]["cumulative_time_s"] == pytest.approx(1450.0)
    assert pts[1]["t_utc"] == "2026-11-14T15:54:10Z"  # last segment start 15:38:03 + 967 s
    assert pts[0]["sun"]["elevation_deg"] == 68.6 and pts[0]["snap_distance_m"] < 5.0


def test_default_waypoints_are_start_and_goal_from_the_geometry():
    fc = route_to_geojson(make_route())
    roles = [f["properties"]["role"] for f in fc["features"] if f["properties"]["featureType"] == "MarsWaypoint"]
    assert roles == ["start", "goal"]


def test_simulated_flags_and_provenance_are_carried():
    fc = route_to_geojson(make_route(), WAYPOINTS)
    top = fc["properties"]
    assert top["simulated"] is True and top["data_levels"] == ["L1"] and top["simulated_inputs"] == ["surface temperature (default diurnal model)"]
    assert top["generator"] == GENERATOR and top["contract_version"] == 1
    route_props = fc["features"][0]["properties"]
    assert route_props["simulated"] is True and route_props["assumptions"] and route_props["verdict"]["call"] == "CAUTION"
    clean = route_to_geojson(make_route(simulated_inputs=[]), WAYPOINTS)["properties"]
    assert clean["simulated"] is False
    assert route_to_geojson(make_route(simulated_inputs=[], data_levels=["L0"]), WAYPOINTS)["properties"]["simulated"] is True  # D-02: L0 synthetic
    assert route_to_geojson(make_route(accuracy="approximate"), WAYPOINTS)["properties"]["approximate"] is True


def test_coordinate_note_states_body_radius_and_latitude_type():
    note = route_to_geojson(make_route(), WAYPOINTS)["properties"]["coordinate_note"]
    for word in ("Mars", "3396190", "planetocentric", "EAST", "WGS 84"):
        assert word in note
    assert "no crs" in note.lower()


def test_nan_and_numpy_values_become_json_safe():
    r = make_route()
    r["totals"] = {**r["totals"], "time_s": float("nan"), "risk": np.float64(0.25), "n": np.int64(3)}
    fc = route_to_geojson(r, WAYPOINTS)
    totals = fc["features"][0]["properties"]["totals"]
    assert totals["time_s"] is None and totals["risk"] == 0.25 and totals["n"] == 3
    json.dumps(fc, allow_nan=False)


def test_segments_can_be_left_out_and_input_is_not_mutated():
    r = make_route()
    before = copy.deepcopy(r)
    fc = route_to_geojson(r, WAYPOINTS, include_segments=False)
    assert all(f["properties"]["featureType"] != "MarsRouteSegment" for f in fc["features"])
    assert r == before


@pytest.mark.parametrize("bad", [
    {"geometry": {"type": "Point", "coordinates": [1, 2]}},
    {"geometry": {"type": "LineString", "coordinates": [[137.4, -4.7]]}},
    {"geometry": {"type": "LineString", "coordinates": [[137.4, -95.0], [137.5, -4.7]]}},
])
def test_invalid_geometry_is_rejected(bad):
    with pytest.raises(ValueError):
        route_to_geojson(make_route(**bad))


def test_waypoint_without_coordinates_is_rejected():
    with pytest.raises(ValueError, match="lat/lon"):
        route_to_geojson(make_route(), [{"place_id": "gale.base"}, {"lat": -4.7, "lon": 137.4}])
