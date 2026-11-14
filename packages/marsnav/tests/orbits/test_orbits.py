import numpy as np
import pytest

from marsnav.config import param
from marsnav.orbits import (
    Elements,
    contact_windows,
    earth_mars_light_time,
    horizon_at,
    look_angles,
    mars_rotation_deg,
    mean_motion,
    orbit_positions,
    solve_kepler,
    to_unix,
    visible,
)
from marsnav.routing.offroute import off_route

R = param("constants.R_sphere")
EPOCH = "2026-11-14T00:00:00Z"


def circ(alt=400e3, inc=0.0, raan=0.0, argp=0.0, m0=0.0):
    return Elements(R + alt, 0.0, inc, raan, argp, m0, EPOCH)


def test_f49_kepler_solver_residual():
    rng = np.random.default_rng(5)
    for e in (0.0, 0.1, 0.5, 0.9):
        M = rng.uniform(-np.pi, np.pi, 200)
        E = solve_kepler(M, e)
        assert np.max(np.abs(E - e * np.sin(E) - M)) < 1e-10


def test_f49_circular_radius_and_period():
    el = circ()
    n = mean_motion(el.a_m)
    T = 2 * np.pi / n
    t0 = to_unix(EPOCH)
    p = orbit_positions(el, np.array([t0, t0 + T / 3, t0 + T]), j2=False)
    r = np.linalg.norm(p["xyz_inertial"], axis=1)
    assert np.allclose(r, el.a_m)
    assert np.allclose(p["xyz_inertial"][0], p["xyz_inertial"][2], atol=1e-3)
    assert np.allclose(p["alt_m"], 400e3)


def test_f49_latitude_follows_inclination():
    el = circ(inc=30.0)
    n = mean_motion(el.a_m)
    t = to_unix(EPOCH) + (np.pi / 2) / n  # argument of latitude 90 deg
    p = orbit_positions(el, np.array([t]), j2=False)
    assert p["lat_deg"][0] == pytest.approx(30.0, abs=1e-6)


def test_f49_body_fixed_longitude_uses_iau_rotation():
    el = circ()
    t0 = to_unix(EPOCH)
    p = orbit_positions(el, np.array([t0]), j2=False)
    W = float(mars_rotation_deg(t0))
    assert (p["lon_deg"][0] - (-W) + 180) % 360 - 180 == pytest.approx(0.0, abs=1e-9)
    # one sidereal day later the rotation angle advanced by Wdot*1 day
    assert (float(mars_rotation_deg(t0 + 86400)) - W) % 360 == pytest.approx(param("constants.Wdot_deg_per_day") % 360, abs=1e-6)


def test_f49_j2_nodal_precession_sign_and_size():
    from marsnav.orbits import j2_rates

    # prograde near-polar sun-synchronous-like orbit: node moves east (positive) for i > 90 deg
    rd_retro, _, _ = j2_rates(Elements(R + 300e3, 0.0, 93.0, 0, 0, 0, EPOCH))
    rd_pro, _, _ = j2_rates(Elements(R + 300e3, 0.0, 30.0, 0, 0, 0, EPOCH))
    assert rd_retro > 0 > rd_pro
    # MRO-like orbit precesses on the order of 0.5 deg/day (sun-synchronous design) — loose order-of-magnitude check
    assert 0.1 < np.degrees(rd_retro) * 86400 < 3.0


def test_f50_zenith_and_horizon_geometry():
    zen = np.array([[R + 400e3, 0.0, 0.0]])
    e, _, rng = look_angles(0.0, 0.0, zen)
    assert e[0] == pytest.approx(90.0)
    assert rng[0] == pytest.approx(400e3)
    theta = np.radians(10.0)
    h = 400e3
    sc = (R + h) * np.array([[np.cos(theta), np.sin(theta), 0.0]])
    e2, az, _ = look_angles(0.0, 0.0, sc)
    expect = np.degrees(np.arctan2((R + h) * np.cos(theta) - R, (R + h) * np.sin(theta)))
    assert e2[0] == pytest.approx(expect)
    assert az[0] == pytest.approx(90.0)  # due east


def test_f50_terrain_blocks_low_pass():
    el = np.array([5.0, 15.0, 25.0])
    az = np.array([90.0, 90.0, 90.0])
    flat = np.zeros(72)
    wall = np.zeros(72)
    wall[17:19] = np.radians(20.0)  # 85-95 deg azimuth
    assert list(visible(el, az, 10.0, flat)) == [False, True, True]
    assert list(visible(el, az, 10.0, wall)) == [False, False, True]


def test_horizon_interpolation_is_periodic():
    h = np.radians(np.arange(72, dtype=float))
    assert horizon_at(h, 0.0) == pytest.approx(0.0)
    assert horizon_at(h, 2.5) == pytest.approx(np.radians(0.5))
    assert horizon_at(h, 357.5) == pytest.approx(np.radians((71.0 + 0.0) / 2))  # wraps from index 71 back to index 0


def _equatorial_pass_duration(mask=0.0, alt=400e3):
    n = mean_motion(R + alt)
    w = np.radians(param("constants.Wdot_deg_per_day")) / 86400.0
    theta = np.arccos(R / (R + alt))
    return 2 * theta / (n - w)


def test_f51_pass_duration_matches_analytic():
    el = circ()
    t0 = to_unix(EPOCH)
    wins = contact_windows(el, 0.0, 0.0, t0, t0 + 6 * 3600, mask_deg=0.0, j2=False, step_s=20.0)
    full = [w for w in wins if w["max_elevation_deg"] > 80]  # overhead passes (equatorial orbit over equatorial site)
    assert full, "expected at least one overhead pass in 6 h"
    for w in full:
        assert w["duration_s"] == pytest.approx(_equatorial_pass_duration(), abs=25.0)
        assert w["terrain_masked"] is False
        assert w["los"] > w["aos"]


def test_f51_terrain_shortens_and_hides_passes():
    el = circ()
    t0 = to_unix(EPOCH)
    base = contact_windows(el, 0.0, 0.0, t0, t0 + 6 * 3600, mask_deg=0.0, j2=False, step_s=20.0)
    best = max(base, key=lambda w: w["max_elevation_deg"])
    low = contact_windows(el, 0.0, 0.0, t0, t0 + 6 * 3600, mask_deg=0.0, horizon_rad=np.full(72, np.radians(15.0)), j2=False, step_s=20.0)
    best_low = max(low, key=lambda w: w["max_elevation_deg"])
    assert best_low["duration_s"] < best["duration_s"] - 60
    assert best_low["terrain_masked"] is True
    blocked = contact_windows(el, 0.0, 0.0, t0, t0 + 6 * 3600, mask_deg=0.0, horizon_rad=np.full(72, np.radians(89.0)), j2=False, step_s=20.0)
    assert blocked and all(w["duration_s"] == 0.0 and w["terrain_masked"] for w in blocked)


def test_f52_light_time_ranges_and_known_geometry():
    lt = earth_mars_light_time("2025-01-12T00:00:00Z")  # close to the 2025 opposition: ~0.64 AU
    assert lt["distance_m"] / 149597870700.0 == pytest.approx(0.642, abs=0.02)
    far = earth_mars_light_time("2023-11-18T00:00:00Z")  # solar conjunction: ~2.6 AU
    assert 2.5 < far["distance_m"] / 149597870700.0 < 2.7
    assert 180 < lt["one_way_s"] < 360 and 1250 < far["one_way_s"] < 1400
    for d in ("2026-11-14T00:00:00Z", "2027-06-01T00:00:00Z", "2029-02-01T00:00:00Z"):
        s = earth_mars_light_time(d)["one_way_s"]
        assert 180 < s < 1340


def test_f53_distance_progress_and_reroute():
    route = [[0, 0], [100, 0], [100, 100]]
    on = off_route(route, [50, 0])
    assert on["distance_m"] == pytest.approx(0.0)
    assert on["progress_m"] == pytest.approx(50.0)
    assert on["progress_fraction"] == pytest.approx(0.25)
    side = off_route(route, [100, 40])
    assert side["distance_m"] == pytest.approx(0.0) and side["progress_m"] == pytest.approx(140.0)
    far = off_route(route, [60, 60])
    assert far["distance_m"] == pytest.approx(40.0)
    assert far["reroute"] is False  # first fix only
    assert off_route(route, [60, 60], recent_distances_m=[41.0, 39.0 + 2.0], d_off_m=25.0, k_off=3)["reroute"] is True
    assert off_route(route, [60, 60], recent_distances_m=[5.0, 41.0], d_off_m=25.0, k_off=3)["reroute"] is False
    with pytest.raises(ValueError):
        off_route([[0, 0]], [1, 1])
