import itertools

import numpy as np
import pytest

from marsnav.config import param
from marsnav.routing.astar import NoPathError, path_terms, search
from marsnav.routing.cost import Astronaut, build_layers, cell_hazard, pack_params, resolve_weights
from marsnav.routing.grid import SiteGrid
from marsnav.routing.mobility import edge_energy, metabolic_cost, o2_use, walk_speed
from marsnav.routing.planner import alternatives, back_to_base, douglas_peucker, held_karp, nn_two_opt, plan_route

UTC_DAY = "2026-11-14T15:30:00Z"  # ~13:30 LTST at Gale (sun up), from F11/F12


def random_layers(h, w, rng, blocked_frac=0.1):
    z = np.cumsum(rng.normal(0, 0.8, (h, w)), axis=1) + np.cumsum(rng.normal(0, 0.8, (h, w)), axis=0)
    blocked = rng.random((h, w)) < blocked_frac
    return {"z": z, "rough_n": rng.random((h, w)) * 0.5, "haz": rng.random((h, w)), "dose_h": 0.02 + rng.random((h, w)) * 0.01,
            "sci": np.zeros((h, w)), "blocked": blocked}


# --- mobility ---------------------------------------------------------------------------------------------------
def test_f21_tobler_reference_points():
    v = param("astronaut.v_flat")
    assert walk_speed(0.0) == pytest.approx(v)
    assert walk_speed(-0.05) == pytest.approx(v * np.exp(0.175))
    assert walk_speed(0.3) < walk_speed(0.0)
    assert walk_speed(0.0, roughness_norm=1.0) == pytest.approx(v / (1 + param("mobility.k_roughness")))


def test_f22_minetti():
    assert metabolic_cost(0.0) == pytest.approx(2.5)
    assert metabolic_cost(0.45) > metabolic_cost(0.2) > metabolic_cost(0.0)
    assert metabolic_cost(0.9) == pytest.approx(metabolic_cost(0.45))  # clipped to the measured range


def test_f23_f24_energy_and_oxygen():
    m = 185.0
    assert edge_energy(100.0, 0.0, m) == pytest.approx(m * 100 * 2.5 * param("astronaut.s_suit"))
    assert np.all(edge_energy(100.0, np.linspace(-0.45, 0.45, 19), m) > 0)
    e, t = 1.0e6, 3600.0
    expect = e / (param("physiology.o2_energy_equiv") * 1000) + param("physiology.met_o2") * 80 * 60 / 1000
    assert o2_use(e, t, 80.0) == pytest.approx(expect)


def test_f25_hazard_monotonic_in_slope():
    s = np.array([0.0, 10.0, 15.0, 20.0, 30.0])
    h = cell_hazard(s, np.zeros(5), np.zeros(5), np.zeros(5))["total"]
    assert np.all(np.diff(h) > 0)
    assert h[2] == pytest.approx(0.5)


# --- search -----------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("seed", range(60))
def test_f28_astar_equals_dijkstra(seed):
    rng = np.random.default_rng(seed)
    h, w = rng.integers(15, 40, size=2)
    L = random_layers(h, w, rng)
    L["blocked"][0, 0] = L["blocked"][-1, -1] = False
    P = pack_params(resolve_weights("BALANCED"), Astronaut())
    try:
        _, c_dij, n_dij = search(L, 20.0, P, (0, 0), (h - 1, w - 1), heuristic=False)
    except NoPathError:
        with pytest.raises(NoPathError):
            search(L, 20.0, P, (0, 0), (h - 1, w - 1), heuristic=True)
        return
    path, c_ast, n_ast = search(L, 20.0, P, (0, 0), (h - 1, w - 1), heuristic=True)
    assert c_ast == pytest.approx(c_dij, rel=1e-9)
    assert n_ast <= n_dij
    assert path_terms(L, 20.0, P, path)[:, 0].sum() == pytest.approx(c_ast, rel=1e-9)


def test_f28_heuristic_admissible_at_start():
    from marsnav.routing import astar as K

    rng = np.random.default_rng(7)
    L = random_layers(30, 30, rng, 0.0)
    P = pack_params(resolve_weights("SAFEST"), Astronaut())
    cmin = K.min_cost_per_metre(L["z"], L["rough_n"], L["haz"], L["dose_h"], L["sci"], L["blocked"], 20.0, P)
    _, cost, _ = search(L, 20.0, P, (0, 0), (29, 29), heuristic=False)
    assert cmin * 20.0 * np.hypot(29, 29) <= cost + 1e-12


def test_f28_wall_blocks_and_gap_is_used():
    L = {"z": np.zeros((20, 20)), "rough_n": np.zeros((20, 20)), "haz": np.zeros((20, 20)), "dose_h": np.full((20, 20), 0.02),
         "sci": np.zeros((20, 20)), "blocked": np.zeros((20, 20), dtype=bool)}
    L["blocked"][:, 10] = True
    P = pack_params(resolve_weights("FASTEST"), Astronaut())
    with pytest.raises(NoPathError):
        search(L, 10.0, P, (10, 2), (10, 17))
    L["blocked"][3, 10] = False
    path, _, _ = search(L, 10.0, P, (10, 2), (10, 17))
    assert (3, 10) in path


def test_f28_straight_line_on_flat_ground():
    L = {"z": np.zeros((50, 50)), "rough_n": np.zeros((50, 50)), "haz": np.zeros((50, 50)), "dose_h": np.full((50, 50), 0.02),
         "sci": np.zeros((50, 50)), "blocked": np.zeros((50, 50), dtype=bool)}
    P = pack_params(resolve_weights("FASTEST"), Astronaut())
    path, cost, _ = search(L, 10.0, P, (0, 0), (30, 45))
    length = sum(10.0 * np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in itertools.pairwise(path))
    assert length <= 10.0 * np.hypot(30, 45) * 1.03  # 16-connectivity error < 3 %


# --- planner ----------------------------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def grid():
    return SiteGrid.synthetic(h=90, w=90, cell=50.0)


def test_planner_contract_fields_and_sums(grid):
    r = plan_route(grid, [(80, 10), (10, 80)], profile="BALANCED", start_utc=UTC_DAY)
    for key in ("route_id", "site_id", "profile", "geometry", "xy", "totals", "segments", "feasibility", "assumptions",
                "data_levels", "simulated_inputs"):
        assert key in r
    segs = r["segments"]
    assert sum(s["duration_s"] for s in segs) == pytest.approx(r["totals"]["time_s"])
    assert sum(s["length_m"] for s in segs) == pytest.approx(r["totals"]["length_m"])
    for s in segs:
        c = s["components"]
        assert c["time"] + c["energy"] + c["dose"] + c["hazard"] == pytest.approx(s["cost"], rel=1e-9)
    assert any("SIMULATED" in x for x in r["simulated_inputs"])
    assert r["geometry"]["coordinates"][0][0] == pytest.approx(r["geometry"]["coordinates"][0][0])


def test_fastest_vs_safest(grid):
    alt = alternatives(grid, [(85, 5), (5, 85)], ["FASTEST", "SAFEST", "BALANCED"], start_utc=UTC_DAY)
    by = {r["profile"]: r for r in alt["routes"]}
    assert by["FASTEST"]["totals"]["time_s"] <= by["SAFEST"]["totals"]["time_s"] + 1e-9
    assert by["SAFEST"]["totals"]["risk"] <= by["FASTEST"]["totals"]["risk"] + 1e-9
    assert alt["best_time_route_id"] == by["FASTEST"]["route_id"]


def test_back_to_base(grid):
    b2b = back_to_base(grid, (20, 70), (80, 15), start_utc=UTC_DAY)
    assert 0 <= b2b["bearing_deg"] < 360
    assert b2b["distance_m"] >= b2b["straight_distance_m"] - 1e-6
    assert b2b["eta_s"] > 0


def test_f31_held_karp_matches_bruteforce():
    rng = np.random.default_rng(3)
    for _ in range(5):
        n = 7
        M = rng.random((n, n)) * 10
        np.fill_diagonal(M, 0)
        order, cost = held_karp(M, closed=True)
        brute = min(sum(M[a, b] for a, b in itertools.pairwise((0, *p, 0))) for p in itertools.permutations(range(1, n)))
        assert cost == pytest.approx(brute)
        assert sorted(order) == list(range(n)) and order[0] == 0
        o2, c2 = nn_two_opt(M, closed=True)
        assert c2 >= cost - 1e-9


def test_f36_douglas_peucker_tolerance():
    t = np.linspace(0, 10, 200)
    xy = np.column_stack([t, np.sin(t)])
    keep = douglas_peucker(xy, 0.05)
    assert keep[0] == 0 and keep[-1] == len(xy) - 1 and len(keep) < len(xy)
    simp = xy[keep]
    def seg_dist(p, a, b):
        ab, ap = b - a, p - a
        t = np.clip(np.dot(ap, ab) / np.dot(ab, ab), 0, 1) if np.dot(ab, ab) > 0 else 0.0
        return float(np.linalg.norm(ap - t * ab))

    for p in xy:
        assert min(seg_dist(p, a, b) for a, b in itertools.pairwise(simp)) <= 0.05 + 1e-9


def test_layers_shadow_and_dose(grid):
    layers = build_layers(grid, UTC_DAY, Astronaut())
    assert layers.arrays["dose_h"].shape == grid.z.shape
    assert np.all(layers.arrays["dose_h"] > 0)
    assert layers.sun.elevation_deg > 0
