import numpy as np
import pytest

from marsnav.config import param
from marsnav.routing.cost import Astronaut, build_layers, pack_params, resolve_weights
from marsnav.routing.grid import SiteGrid
from marsnav.routing.planner import knee_point, non_dominated, pareto_routes, plan_route
from marsnav.routing.returnfield import eva_margin, return_field
from marsnav.uncertainty import route_uncertainty

UTC = "2026-11-14T15:30:00Z"


def flat_layers(h=60, w=60, slope_x=0.0):
    cols = np.arange(w)[None, :] * np.ones((h, 1))
    return {"z": slope_x * cols * 10.0, "rough_n": np.zeros((h, w)), "haz": np.zeros((h, w)), "dose_h": np.full((h, w), 0.026),
            "sci": np.zeros((h, w)), "blocked": np.zeros((h, w), dtype=bool)}


def test_f34_flat_return_time_is_distance_over_speed():
    L = flat_layers()
    P = pack_params(resolve_weights("FASTEST"), Astronaut())
    ret = return_field(L, 10.0, P, (30, 30))
    T = ret["time_s"]
    assert T[30, 30] == 0.0 and np.all(np.isfinite(T))
    v = param("astronaut.v_flat")
    assert T[30, 50] == pytest.approx(200.0 / v, rel=1e-9)  # straight line along a row
    assert T[10, 50] == pytest.approx(np.hypot(20, 20) * 10.0 / v, rel=0.04)  # 16-connectivity error < 4 %
    assert ret["energy_J"][30, 50] > 0 and ret["dose_mSv"][30, 50] > 0


def test_f34_climbing_back_is_slower_than_descending():
    L = flat_layers(slope_x=0.1)  # terrain rises to the east
    P = pack_params(resolve_weights("FASTEST"), Astronaut())
    T = return_field(L, 10.0, P, (30, 30))["time_s"]
    assert T[30, 10] > T[30, 50]  # west cell must climb back to the base, east cell walks downhill


def test_f35_margin_signs():
    L = flat_layers()
    astro = Astronaut()
    P = pack_params(resolve_weights("FASTEST"), astro)
    ret = return_field(L, 10.0, P, (30, 30))
    rr = np.full(5, 30)
    cc = np.array([30, 35, 40, 45, 50])
    t_cum = np.array([0.0, 500.0, 1000.0, 1500.0, 2000.0])
    ok = eva_margin(ret, rr, cc, t_cum, t_cum * 400.0, astro)
    assert ok["margin"] > 0 and ok["first_violation"] is None
    late = eva_margin(ret, rr, cc, t_cum + 5.0 * 3600.0, t_cum * 400.0, astro)  # 5 h spent of the 5.25 h usable (7 h minus 25 % reserve)
    assert late["margin"] < 0 and late["first_violation"] is not None


@pytest.fixture(scope="module")
def grid():
    return SiteGrid.synthetic(h=90, w=90, cell=50.0)


def test_planner_reports_return_margin_and_violation(grid):
    base = (45, 45)
    near = plan_route(grid, [base, (60, 55)], "FASTEST", start_utc=UTC, base_rc=base)
    assert near["totals"]["return_margin"] is not None and near["totals"]["return_margin"] > 0
    assert not any(v["kind"] == "RETURN_RESERVE" for v in near["feasibility"]["violations"])
    short = {"eva_max_s": 3600.0}  # a 1 h EVA cannot cover the way out and back
    far = plan_route(grid, [base, (5, 80)], "FASTEST", start_utc=UTC, astronaut=short, base_rc=base)
    assert far["totals"]["return_margin"] < 0
    assert any(v["kind"] == "RETURN_RESERVE" for v in far["feasibility"]["violations"])
    assert plan_route(grid, [base, (60, 55)], "FASTEST", start_utc=UTC)["totals"]["return_margin"] is None


def test_f32_f33_pareto_front_properties(grid):
    res = pareto_routes(grid, [(80, 8), (8, 80)], n_points=5, start_utc=UTC)
    routes = res["routes"]
    assert 1 <= len(routes) <= 5
    pts = [(r["totals"]["time_s"], r["totals"]["risk"]) for r in routes]
    for i, (t, k) in enumerate(pts):
        assert not any(t2 <= t and k2 <= k and (t2 < t or k2 < k) for j, (t2, k2) in enumerate(pts) if j != i)
    assert [p[0] for p in pts] == sorted(p[0] for p in pts)
    assert res["knee_route_id"] in {r["route_id"] for r in routes}
    if len(routes) > 1:
        assert routes[0]["profile"] == "FASTEST" or res["knee_route_id"] == routes[0]["route_id"]
        assert pts[0][1] >= pts[-1][1] - 1e-9  # risk falls as time grows along the front


def test_f33_knee_on_synthetic_front():
    def r(t, k):
        return {"totals": {"time_s": t, "risk": k}}

    front = [r(1.0, 10.0), r(1.5, 2.0), r(10.0, 1.0)]
    assert knee_point(front) == 1  # the elbow
    assert [x["totals"]["time_s"] for x in non_dominated(front + [r(11.0, 11.0)])] == [1.0, 1.5, 10.0]


def test_f38_uncertainty_deterministic_and_brackets_nominal(grid):
    layers = build_layers(grid, UTC, Astronaut())
    free = np.argwhere(~layers.arrays["blocked"])
    base = (45, 45)
    goal = tuple(int(v) for v in free[np.argmin(np.hypot(free[:, 0] - 62, free[:, 1] - 58))])
    assert not layers.arrays["blocked"][base]
    route = plan_route(grid, [base, goal], "BALANCED", start_utc=UTC, return_cells=True, layers=layers)
    cells = [tuple(c) for c in route["cells"]]
    a = route_uncertainty(grid, layers, cells, runs=60, seed=1, return_samples=True)
    b = route_uncertainty(grid, layers, cells, runs=60, seed=1)
    c = route_uncertainty(grid, layers, cells, runs=60, seed=2)
    assert a["quantiles"] == b["quantiles"]
    assert a["quantiles"] != c["quantiles"]
    for key, nominal in (("time_s", route["totals"]["time_s"]), ("dose_mSv", route["totals"]["dose_mSv"]),
                         ("energy_kJ", route["totals"]["energy_kJ"])):
        q = a["quantiles"][key]
        assert q[0] <= q[1] <= q[2] and q[0] < q[2]
        assert a["samples"][key].min() <= nominal <= a["samples"][key].max()
