"""F29 Theta* tests: line of sight vs exact geometry, cost parity with F28, any-angle behaviour."""

from fractions import Fraction

import numpy as np
import pytest

from marsnav.routing import astar as K
from marsnav.routing.astar import OFFSETS, NoPathError, _crossed_blocked, edge_terms, search
from marsnav.routing.cost import Astronaut, pack_params, resolve_weights
from marsnav.routing.theta import (
    cost_lower_bound_per_m,
    line_of_sight,
    polyline_length_m,
    segment_terms,
    theta_path_terms,
    theta_star,
)


def flat_layers(h, w, blocked=None):
    return {"z": np.zeros((h, w)), "rough_n": np.zeros((h, w)), "haz": np.zeros((h, w)), "dose_h": np.full((h, w), 0.02),
            "sci": np.zeros((h, w)), "blocked": np.zeros((h, w), dtype=bool) if blocked is None else blocked}


def random_layers(h, w, rng, blocked_frac=0.1):
    z = np.cumsum(rng.normal(0, 0.8, (h, w)), axis=1) + np.cumsum(rng.normal(0, 0.8, (h, w)), axis=0)
    return {"z": z, "rough_n": rng.random((h, w)) * 0.5, "haz": rng.random((h, w)), "dose_h": 0.02 + rng.random((h, w)) * 0.01,
            "sci": np.zeros((h, w)), "blocked": rng.random((h, w)) < blocked_frac}


def hits_square(r0, c0, r1, c1, r, c):
    """Exact test (rational arithmetic): does the segment touch the closed unit square centred on cell (r, c)?"""
    t0, t1 = Fraction(0), Fraction(1)
    for p0, d, ctr in ((r0, r1 - r0, r), (c0, c1 - c0, c)):
        lo, hi = Fraction(2 * ctr - 1, 2), Fraction(2 * ctr + 1, 2)
        if d == 0:
            if not lo <= p0 <= hi:
                return False
        else:
            ta, tb = (lo - p0) / d, (hi - p0) / d
            if ta > tb:
                ta, tb = tb, ta
            t0, t1 = max(t0, ta), min(t1, tb)
            if t0 > t1:
                return False
    return True


def reference_los(blocked, a, b):
    (r0, c0), (r1, c1) = a, b
    for r in range(min(r0, r1), max(r0, r1) + 1):
        for c in range(min(c0, c1), max(c0, c1) + 1):
            if blocked[r, c] and hits_square(r0, c0, r1, c1, r, c):
                return False
    return True


# --- line of sight -----------------------------------------------------------------------------------------------
def test_f29_los_matches_exact_geometry_on_random_segments():
    rng = np.random.default_rng(11)
    checked = blocked_count = 0
    for _ in range(60):
        blocked = rng.random((14, 14)) < 0.25
        for _ in range(12):
            a = (int(rng.integers(0, 14)), int(rng.integers(0, 14)))
            b = (int(rng.integers(0, 14)), int(rng.integers(0, 14)))
            blocked[a] = blocked[b] = False
            expect = reference_los(blocked, a, b)
            assert bool(line_of_sight(blocked, a[0], a[1], b[0], b[1])) == expect, (a, b)
            checked += 1
            blocked_count += not expect
    assert checked == 720 and 100 < blocked_count < 620  # both outcomes exercised


def test_f29_los_equals_f28_edge_rule_for_neighbour_moves():
    rng = np.random.default_rng(5)
    for _ in range(40):
        blocked = rng.random((9, 9)) < 0.3
        for r in range(2, 7):
            for c in range(2, 7):
                for dr, dc in OFFSETS:
                    rv, cv = r + dr, c + dc
                    f28 = not blocked[rv, cv] and not _crossed_blocked(blocked, r, c, int(dr), int(dc))
                    assert bool(line_of_sight(blocked, r, c, rv, cv)) == f28


def test_f29_no_corner_cutting_between_diagonal_walls():
    blocked = np.zeros((9, 9), dtype=bool)
    blocked[4, 3] = blocked[3, 4] = True  # two walls touching at the corner the diagonal (3,3)->(4,4) would pass through
    assert not line_of_sight(blocked, 3, 3, 4, 4)
    assert not line_of_sight(blocked, 1, 1, 7, 7)
    blocked[3, 4] = False
    assert not line_of_sight(blocked, 3, 3, 4, 4)  # one blocked side cell is enough
    blocked[4, 3] = False
    assert line_of_sight(blocked, 1, 1, 7, 7)


# --- segment cost ------------------------------------------------------------------------------------------------
def test_segment_terms_equals_edge_terms_for_neighbour_moves():
    rng = np.random.default_rng(2)
    L = random_layers(12, 12, rng, 0.0)
    P = pack_params(resolve_weights("BALANCED"), Astronaut())
    args = (L["z"], L["rough_n"], L["haz"], L["dose_h"], L["sci"])
    for dr, dc in OFFSETS:
        a, b = edge_terms(*args, 5, 5, 5 + int(dr), 5 + int(dc), 20.0, P), segment_terms(*args, 5, 5, 5 + int(dr), 5 + int(dc), 20.0, P)
        assert np.allclose(a, b, rtol=1e-12, atol=0.0)


def test_segment_cost_on_inclined_plane_equals_sum_of_unit_edges():
    h, w = 30, 30
    rows, cols = np.mgrid[0:h, 0:w]
    L = flat_layers(h, w)
    L["z"] = 1.5 * cols + 0.8 * rows  # constant grade on the plane
    L["haz"] = np.full((h, w), 0.2)
    P = pack_params(resolve_weights("BALANCED"), Astronaut())
    args = (L["z"], L["rough_n"], L["haz"], L["dose_h"], L["sci"])
    # along a row: 12 unit steps of one cell
    unit = edge_terms(*args, 4, 3, 4, 4, 10.0, P)
    seg = segment_terms(*args, 4, 3, 4, 15, 10.0, P)
    assert np.allclose(seg, [12 * x for x in unit], rtol=1e-9)
    # along a diagonal: 7 diagonal moves
    diag = edge_terms(*args, 4, 3, 5, 4, 10.0, P)
    seg = segment_terms(*args, 4, 3, 11, 10, 10.0, P)
    assert np.allclose(seg, [7 * x for x in diag], rtol=1e-9)


def test_segment_over_a_cliff_is_infeasible_but_gentle_ground_is_not():
    L = flat_layers(10, 20)
    L["z"][:, 8:] = 40.0  # 40 m step between neighbouring 10 m cells
    P = pack_params(resolve_weights("FASTEST"), Astronaut())
    args = (L["z"], L["rough_n"], L["haz"], L["dose_h"], L["sci"])
    assert segment_terms(*args, 3, 2, 3, 14, 10.0, P)[0] == np.inf
    assert np.isfinite(segment_terms(*args, 3, 9, 3, 18, 10.0, P)[0])


def test_cost_lower_bound_is_below_every_edge_cost_per_metre():
    rng = np.random.default_rng(9)
    for profile in ("FASTEST", "SAFEST", "BALANCED", "SCIENCE"):
        P = pack_params(resolve_weights(profile), Astronaut())
        L = random_layers(15, 15, rng, 0.0)
        L["sci"] = rng.random((15, 15))
        lb = cost_lower_bound_per_m(P)
        for r in range(1, 14):
            for c in range(1, 14):
                for dr, dc in OFFSETS:
                    rv, cv = r + int(dr), c + int(dc)
                    if 0 <= rv < 15 and 0 <= cv < 15:
                        cost = edge_terms(L["z"], L["rough_n"], L["haz"], L["dose_h"], L["sci"], r, c, rv, cv, 10.0, P)[0]
                        if np.isfinite(cost):
                            assert cost / (10.0 * np.hypot(dr, dc)) >= lb


# --- search ------------------------------------------------------------------------------------------------------
def test_f29_open_flat_grid_is_the_straight_line():
    L = flat_layers(50, 50)
    P = pack_params(resolve_weights("FASTEST"), Astronaut())
    path, cost, _ = theta_star(L, 10.0, P, (0, 0), (30, 45))
    assert path == [(0, 0), (30, 45)]
    assert polyline_length_m(path, 10.0) == pytest.approx(10.0 * np.hypot(30, 45))
    a_path, a_cost, _ = search(L, 10.0, P, (0, 0), (30, 45))
    assert cost < a_cost  # staircase A* path is strictly longer
    assert theta_path_terms(L, 10.0, P, path)[:, 0].sum() == pytest.approx(cost, rel=1e-12)


@pytest.mark.parametrize("seed", range(60))
def test_f29_never_costs_more_than_astar_and_respects_obstacles(seed):
    rng = np.random.default_rng(seed)
    h, w = (int(x) for x in rng.integers(15, 40, size=2))
    L = random_layers(h, w, rng)
    L["blocked"][0, 0] = L["blocked"][-1, -1] = False
    P = pack_params(resolve_weights("BALANCED"), Astronaut())
    goal = (h - 1, w - 1)
    try:
        _, c_astar, _ = search(L, 20.0, P, (0, 0), goal)
    except NoPathError:
        with pytest.raises(NoPathError):
            theta_star(L, 20.0, P, (0, 0), goal)
        return
    path, c_theta, _ = theta_star(L, 20.0, P, (0, 0), goal)
    assert path[0] == (0, 0) and path[-1] == goal
    assert c_theta <= c_astar * (1 + 1e-9)
    assert theta_path_terms(L, 20.0, P, path)[:, 0].sum() == pytest.approx(c_theta, rel=1e-9)
    for a, b in zip(path[:-1], path[1:], strict=True):
        assert not L["blocked"][a] and not L["blocked"][b]
        assert reference_los(L["blocked"], a, b), (a, b)


def test_f29_on_uniform_ground_paths_are_not_longer_than_astar_and_often_shorter():
    P = pack_params(resolve_weights("FASTEST"), Astronaut())
    shorter = total = 0
    for seed in range(60):
        rng = np.random.default_rng(100 + seed)
        h, w = (int(x) for x in rng.integers(20, 45, size=2))
        blocked = rng.random((h, w)) < 0.15
        blocked[0, 0] = blocked[-1, -1] = False
        L = flat_layers(h, w, blocked)  # flat, uniform: cost is proportional to length
        try:
            a_path, _, _ = search(L, 10.0, P, (0, 0), (h - 1, w - 1))
        except NoPathError:
            continue
        t_path, _, _ = theta_star(L, 10.0, P, (0, 0), (h - 1, w - 1))
        la, lt = polyline_length_m(a_path, 10.0), polyline_length_m(t_path, 10.0)
        assert lt <= la + 1e-9
        total += 1
        shorter += lt < la - 1e-6
    assert total >= 40 and shorter >= 0.5 * total


def test_f29_wall_with_gap_goes_through_the_gap_and_wall_without_gap_fails():
    blocked = np.zeros((30, 30), dtype=bool)
    blocked[:, 15] = True
    L = flat_layers(30, 30, blocked)
    P = pack_params(resolve_weights("FASTEST"), Astronaut())
    with pytest.raises(NoPathError):
        theta_star(L, 10.0, P, (15, 3), (15, 27))
    blocked[5, 15] = False
    path, _, _ = theta_star(L, 10.0, P, (15, 3), (15, 27))
    assert (5, 15) in path
    assert K.N_PARAMS == len(P)
