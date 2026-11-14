"""Rover mode and the Apollo walkback rule."""

import numpy as np
import pytest

from marsnav.config import param
from marsnav.routing import astar as K
from marsnav.routing.astar import NoPathError
from marsnav.routing.cost import Astronaut, build_layers, pack_params, resolve_weights
from marsnav.routing.grid import SiteGrid
from marsnav.routing.planner import plan_route
from marsnav.routing.returnfield import eva_margin, return_field
from marsnav.routing.rover import (
    ROVER_SPEED_M_S,
    SEATED_MET,
    Rover,
    pack_rover_params,
    plan_rover_route,
    rover_energy,
    walkback_margin,
    zero_margin_crossing,
)

UTC = "2026-11-14T15:30:00Z"
CELL = 100.0


def flat_grid(h, w):
    g = SiteGrid.synthetic(h=h, w=w, cell=CELL)
    g.z = np.full_like(g.z, -4500.0)
    return g


@pytest.fixture(scope="module")
def flat():
    g = flat_grid(60, 170)
    return g, build_layers(g, UTC, Astronaut())


def analytic_radius_m(pressurized):
    """Distance from base (flat ground, straight line) at which the walkback margin reaches zero, from first principles."""
    a = Astronaut()
    keep = 1.0 - a.reserve_fraction
    met, eq = float(param("physiology.met_o2")), float(param("physiology.o2_energy_equiv")) * 1000.0
    c0, s_suit = 2.5, float(param("astronaut.s_suit"))
    walk_o2_per_m = a.m_tot * c0 * s_suit / eq + met * a.mass_astronaut / 1000.0 / 60.0 / a.v_flat
    drive_o2_per_m = 0.0 if pressurized else SEATED_MET * met * a.mass_astronaut / 1000.0 / 60.0 / ROVER_SPEED_M_S
    d_o2 = a.o2_capacity_l * keep / (walk_o2_per_m + drive_o2_per_m)
    d_time = a.eva_max_s * keep / (1.0 / a.v_flat + (0.0 if pressurized else 1.0 / ROVER_SPEED_M_S))
    return min(d_o2, d_time)


# --- pieces ------------------------------------------------------------------------------------------------------
def test_rover_presets_and_overrides():
    u, p = Rover(), Rover(kind="pressurised")
    assert not u.pressurized and p.pressurized
    assert p.mass_kg > u.mass_kg and p.dose_shield < u.dose_shield
    r = Rover.from_api({"kind": "pressurised", "battery_kWh": 12.0, "speed_m_s": 2.0})
    assert r.battery_kwh == 12.0 and r.speed_m_s == 2.0 and r.mass_kg == p.mass_kg
    with pytest.raises(ValueError):
        Rover(kind="hovercraft")


def test_rover_pack_params_is_faster_and_climbs_steeper_than_walking():
    w = resolve_weights("BALANCED")
    P_walk, P_rov = pack_params(w, Astronaut()), pack_rover_params(w, Astronaut(), Rover())
    assert P_rov[K.P_V_FLAT] > P_walk[K.P_V_FLAT]
    assert P_rov[K.P_GRADE_LIM] > P_walk[K.P_GRADE_LIM]  # 30 deg vs the walking limit
    assert P_rov[K.P_W_E] == 0.0  # walking energy is not an objective for the rover


def test_rover_energy_flat_uphill_downhill():
    rv = Rover()
    d, tau = np.array([100.0, 100.0, 100.0]), np.array([72.0, 72.0, 72.0])
    e = rover_energy(d, np.array([0.0, 30.0, -30.0]), tau, rv)
    flat_expected = rv.mass_kg * float(param("constants.g_mars")) * 100.0 * rv.crr / rv.drive_eff + rv.aux_w * 72.0
    assert e[0] == pytest.approx(flat_expected)
    assert e[1] > e[0] > e[2] > rv.aux_w * 72.0  # downhill is cheaper but never free


def test_zero_margin_crossing_interpolates():
    margin = np.array([0.2, 0.1, -0.1, -0.3])
    out = zero_margin_crossing(margin, np.array([0.0, 100.0, 200.0, 300.0]))
    assert out == {"index": 1, "fraction": pytest.approx(0.5), "distance_m": pytest.approx(150.0)}
    assert zero_margin_crossing(np.array([0.3, 0.2]), np.array([0.0, 1.0])) is None
    unreachable = zero_margin_crossing(np.array([0.2, -np.inf]), np.array([0.0, 50.0]))
    assert unreachable == {"index": 0, "fraction": 0.0, "distance_m": 0.0}


def test_walkback_margin_matches_f35_for_seated_suited_crew():
    L = {"z": np.zeros((60, 60)), "rough_n": np.zeros((60, 60)), "haz": np.zeros((60, 60)), "dose_h": np.full((60, 60), 0.026),
         "sci": np.zeros((60, 60)), "blocked": np.zeros((60, 60), dtype=bool)}
    astro = Astronaut()
    ret = return_field(L, 10.0, pack_params(resolve_weights("FASTEST"), astro), (30, 30))
    rr, cc = np.full(6, 30), np.array([30, 34, 38, 42, 46, 50])
    t = np.linspace(0.0, 4000.0, 6)
    wb = walkback_margin(ret, rr, cc, t, astro, pressurized=False)
    # F35 sees the seated crew as extra "energy" on top of the 1 MET it already counts as basal oxygen
    met, eq = float(param("physiology.met_o2")), float(param("physiology.o2_energy_equiv")) * 1000.0
    e_equiv = (SEATED_MET - 1.0) * met * astro.mass_astronaut / 1000.0 / 60.0 * t * eq
    f35 = eva_margin(ret, rr, cc, t, e_equiv, astro)
    assert float(wb["margin"].min()) == pytest.approx(f35["margin"], rel=1e-9)
    pr = walkback_margin(ret, rr, cc, t, astro, pressurized=True)
    assert np.all(pr["margin"] >= wb["margin"])  # a cabin never leaves the crew worse off


# --- the rule on a route -----------------------------------------------------------------------------------------
def test_margin_decreases_monotonically_with_distance_from_base(flat):
    g, layers = flat
    r = plan_rover_route(g, [(30, 8), (30, 100)], (30, 8), start_utc=UTC, layers=layers)
    prof = np.array(r["walkback"]["margin_profile"])
    assert prof[0, 0] == 0.0 and prof[0, 1] > prof[-1, 1]
    assert np.all(np.diff(prof[:, 1]) <= 1e-12)
    assert np.all(np.diff(prof[:, 0]) > 0)


def test_short_traverse_is_accepted(flat):
    g, layers = flat
    r = plan_rover_route(g, [(30, 8), (30, 40)], (30, 8), start_utc=UTC, layers=layers)
    assert r["feasibility"]["ok"] and r["verdict"]["call"] in ("READY", "CAUTION")
    assert r["walkback"]["zero_margin_point"] is None
    assert r["walkback"]["max_safe_distance_m"] == pytest.approx(r["totals"]["length_m"])
    assert r["totals"]["walkback_margin_min"] > 0 and r["mobility"] == "rover"
    assert r["geometry"]["type"] == "LineString" and r["totals"]["time_s"] > 0


@pytest.mark.parametrize("kind", ["unpressurised", "pressurised"])
def test_route_beyond_walkback_radius_is_rejected_with_reason(flat, kind):
    g, layers = flat
    far = plan_rover_route(g, [(30, 8), (30, 160)], (30, 8), rover={"kind": kind}, start_utc=UTC, layers=layers)  # 15.2 km out
    assert not far["feasibility"]["ok"] and far["verdict"]["call"] == "NO_GO"
    v = next(x for x in far["feasibility"]["violations"] if x["kind"] == "WALKBACK")
    assert "walk" in v["message"] and "km" in v["message"] and "oxygen" in v["message"]
    expect = analytic_radius_m(kind == "pressurised")
    assert far["walkback"]["max_safe_distance_m"] == pytest.approx(expect, rel=0.03)
    pt = far["walkback"]["zero_margin_point"]
    assert pt["along_route_m"] == pytest.approx(far["walkback"]["max_safe_distance_m"])
    assert pt["distance_from_base_m"] == pytest.approx(pt["along_route_m"], rel=0.02)  # straight route out of the base
    assert far["walkback"]["max_safe_distance_m"] < far["totals"]["length_m"]


def test_pressurised_rover_reaches_farther_than_suited_crew_in_the_open_rover(flat):
    g, layers = flat
    out = {k: plan_rover_route(g, [(30, 8), (30, 160)], (30, 8), rover={"kind": k}, start_utc=UTC, layers=layers)
           for k in ("unpressurised", "pressurised")}
    assert out["pressurised"]["walkback"]["max_safe_distance_m"] > out["unpressurised"]["walkback"]["max_safe_distance_m"]


def test_round_trip_margin_recovers_on_the_way_home(flat):
    g, layers = flat
    r = plan_rover_route(g, [(30, 8), (30, 60)], (30, 8), return_to_base=True, start_utc=UTC, layers=layers)
    prof = np.array(r["walkback"]["margin_profile"])
    k = int(np.argmin(prof[:, 1]))
    assert 0 < k < len(prof) - 1 and prof[-1, 1] < prof[0, 1]  # best at the base, worst at the turning point, home with consumables spent


def test_rover_crosses_ground_too_steep_to_walk_back_over(flat):
    g = flat_grid(60, 100)
    _, cols = np.mgrid[0:60, 0:100]
    g.z = -4500.0 + np.clip(cols - 40, 0, 4) * 51.0  # 27 deg ramp over 4 cells (rover limit 30, walking limit 25)
    layers = build_layers(g, UTC, Astronaut())
    assert layers.arrays["blocked"][30, 42] and layers.arrays["slope_deg"][30, 42] < 30.0
    with pytest.raises(NoPathError):
        plan_route(g, [(30, 10), (30, 70)], "FASTEST", start_utc=UTC, layers=layers)  # on foot the ramp is a wall
    r = plan_rover_route(g, [(30, 10), (30, 70)], (30, 10), start_utc=UTC, layers=layers)
    assert not r["feasibility"]["ok"]
    v = next(x for x in r["feasibility"]["violations"] if x["kind"] == "WALKBACK")
    assert "too steep" in v["message"]
    assert r["walkback"]["max_safe_distance_m"] < 3500.0  # the walk-back wall starts about 3 km out


def test_battery_violation(flat):
    g, layers = flat
    r = plan_rover_route(g, [(30, 8), (30, 40)], (30, 8), rover={"battery_kWh": 0.2}, start_utc=UTC, layers=layers)
    assert any(v["kind"] == "BATTERY" for v in r["feasibility"]["violations"]) and r["verdict"]["call"] == "NO_GO"


def test_unknown_base_and_single_waypoint_are_errors(flat):
    g, layers = flat
    with pytest.raises(ValueError):
        plan_rover_route(g, [(30, 8), (30, 40)], (500, 500), start_utc=UTC, layers=layers)
    with pytest.raises(ValueError):
        plan_rover_route(g, [(30, 8)], (30, 8), start_utc=UTC, layers=layers)
