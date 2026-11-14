"""Route planning on a SiteGrid (F28 search + F30/F31 ordering + F36 smoothing + F37 breakdown + F45 back-to-base).

Output dictionaries follow contracts/openapi.yaml (RouteResult, BackToBaseResult, OrderResult).
"""

from __future__ import annotations

import hashlib
import itertools
import math
import time
from datetime import UTC, datetime, timedelta

import numpy as np

from marsnav.config import param
from marsnav.geodesy import bearing_xy
from marsnav.routing import astar as K
from marsnav.routing.astar import NoPathError, path_terms, search
from marsnav.routing.cost import Astronaut, CellLayers, build_layers, pack_params, resolve_weights
from marsnav.routing.grid import SiteGrid
from marsnav.routing.mobility import o2_use
from marsnav.routing.returnfield import eva_margin, return_field
from marsnav.sun import parse_utc, sun_position

ASSUMPTIONS = [
    "Environment (sun, shadows, temperature) is evaluated at the departure time for the whole route (P1: arrival time).",
    "Walking speed: normalised Tobler function with v_flat from params.yaml (ASSUMPTION).",
    "Energy: Minetti et al. 2002 with the grade-dependent part scaled by g_Mars/g_Earth (ASSUMPTION).",
    "Dose: RAD open-sky reference scaled by terrain sky fraction and pressure (ASSUMPTION beta).",
    "Hazards smaller than the grid resolution are not resolved.",
]


def sunset_in_s(lat: float, lon: float, utc: str) -> float | None:
    """Seconds from ``utc`` until the sun drops below the horizon at the site (0 if already down; None if it stays up for 24 h)."""
    step = int(param("verdict.sunset_search_step_s"))
    t0 = parse_utc(utc)
    for k in range(0, 86400 // step + 1):
        if sun_position(lat, lon, t0 + timedelta(seconds=k * step)).elevation_deg <= 0.0:
            return float(k * step)
    return None


def route_verdict(totals: dict, violations: list[dict], astro: Astronaut) -> dict:
    """READY / CAUTION / NO_GO call with plain-English reasons.

    NO_GO: any hard violation (EVA time, oxygen, return reserve). CAUTION: thin return margin, steep sections, a walk that ends after
    sunset, much of the route in shadow, or temperatures close to the suit limit. Thresholds are ASSUMPTIONS in params.yaml (verdict.*).
    """
    if violations:
        return {"call": "NO_GO", "reasons": [v["message"] for v in violations]}
    reasons: list[str] = []
    m = totals.get("return_margin")
    if m is not None and m < float(param("verdict.margin_caution")):
        reasons.append(f"The return margin is only {m * 100:.0f}% of the EVA budget.")
    if totals["max_slope_deg"] > float(param("verdict.slope_caution_deg")):
        reasons.append(f"Steep sections up to {totals['max_slope_deg']:.0f} degrees.")
    sun_s = totals.get("sunset_in_s")
    if sun_s is not None and totals["time_s"] > sun_s:
        reasons.append(f"The walk ends {(totals['time_s'] - sun_s) / 60:.0f} min after sunset.")
    if (totals.get("shadow_fraction") or 0.0) > float(param("verdict.shadow_caution_frac")):
        reasons.append(f"{(totals['shadow_fraction'] or 0) * 100:.0f}% of the route is in shadow (cold, low light).")
    t_min = totals.get("min_temp_K")
    if t_min is not None and t_min < astro.T_min_K + float(param("verdict.temp_caution_margin_K")):
        reasons.append(f"The surface cools to {t_min:.0f} K, close to the suit limit of {astro.T_min_K:.0f} K.")
    return {"call": "CAUTION" if reasons else "READY", "reasons": reasons}


def douglas_peucker(xy: np.ndarray, tol: float) -> np.ndarray:
    """F36 — simplified vertex indices of a polyline (first/last kept); max deviation ≤ tol."""
    n = len(xy)
    if n < 3:
        return np.arange(n)
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = xy[a], xy[b]
        seg = q - p
        L = float(np.hypot(*seg))
        pts = xy[a + 1:b]
        if L == 0:
            d = np.hypot(*(pts - p).T)
        else:
            d = np.abs(seg[0] * (pts[:, 1] - p[1]) - seg[1] * (pts[:, 0] - p[0])) / L
        k = int(np.argmax(d))
        if d[k] > tol:
            m = a + 1 + k
            keep[m] = True
            stack += [(a, m), (m, b)]
    return np.flatnonzero(keep)


def _leg_path(layers: CellLayers, grid: SiteGrid, P: np.ndarray, a: tuple[int, int], b: tuple[int, int],
              c_min: float) -> list[tuple[int, int]]:
    path, _, _ = search(layers.arrays, grid.cell, P, a, b, heuristic=True, c_min=c_min)
    return path


def _route_id(*parts: object) -> str:
    return "r_" + hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:12]


def _limiting_factor(seg_terms: dict[str, float], grade: float, dose_rate_mean: float, dose_ref_h: float) -> str:
    hz = {k: v for k, v in seg_terms.items() if k in ("slope", "roughness", "shadow", "thermal", "comms")}
    name, val = max(hz.items(), key=lambda kv: kv[1])
    if val >= 0.5:
        return name
    if grade > 0.15:
        return "energy"
    if dose_rate_mean > 1.1 * dose_ref_h:
        return "dose"
    return "time"


def plan_route(grid: SiteGrid, waypoints_rc: list[tuple[int, int]], profile: str = "BALANCED", weights: dict | None = None,
               start_utc: str | None = None, astronaut: dict | None = None, return_to_start: bool = False,
               optimize_order: bool = False, max_segments: int = 120, layers: CellLayers | None = None,
               base_rc: tuple[int, int] | None = None, return_cells: bool = False) -> dict:
    """Plan a route through waypoint cells. Raises NoPathError when a leg is infeasible.

    With ``base_rc`` the F34 return field and F35 reserve check run and fill totals.return_margin (< 0 adds a RETURN_RESERVE violation).
    """
    t0 = time.perf_counter()
    if len(waypoints_rc) < 2:
        raise ValueError("at least two waypoints are required")
    for r, c in waypoints_rc:
        if not grid.inside(r, c):
            raise NoPathError(f"waypoint cell {(r, c)} is outside the site grid")
    utc = start_utc or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    astro = Astronaut.from_api(astronaut)
    w = resolve_weights(profile, weights)
    P = pack_params(w, astro)
    layers = layers or build_layers(grid, utc, astro)
    arr = layers.arrays
    c_min = K.min_cost_per_metre(arr["z"], arr["rough_n"], arr["haz"], arr["dose_h"], arr["sci"], arr["blocked"], grid.cell, P)

    order = list(range(len(waypoints_rc)))
    if optimize_order and len(waypoints_rc) >= 3:
        order = order_waypoints(grid, waypoints_rc, profile, utc, astronaut, return_to_start, layers=layers)["order"]
    pts = [waypoints_rc[i] for i in order]
    if return_to_start:
        pts.append(pts[0])

    path: list[tuple[int, int]] = []
    for a, b in itertools.pairwise(pts):
        leg = _leg_path(layers, grid, P, a, b, c_min)
        path.extend(leg if not path else leg[1:])

    terms = path_terms(arr, grid.cell, P, path)  # cost, tau, energy, dose, hazard, science
    rr = np.array([p[0] for p in path])
    cc = np.array([p[1] for p in path])
    xs, ys = grid.rc_to_xy(rr, cc)
    zs = arr["z"][rr, cc]
    d_edges = np.hypot(np.diff(xs), np.diff(ys))
    dz = np.diff(zs)
    f_sci = 1.0 - w["alpha"] * terms[:, 5]
    refs = [float(param(f"routing.refs.{k}")) for k in ("tau_ref", "E_ref", "D_ref", "Hz_ref")]
    comp = np.column_stack([w["w_tau"] * terms[:, 1] / refs[0], w["w_E"] * terms[:, 2] / refs[1],
                            w["w_D"] * terms[:, 3] / refs[2], w["w_H"] * terms[:, 4] / refs[3]]) * f_sci[:, None]
    t_cum = np.concatenate([[0.0], np.cumsum(terms[:, 1])])
    start_dt = parse_utc(utc)
    dose_ref_h = float(param("radiation.dose_eq_ref")) / 24.0
    hz_terms = layers.hazard_terms

    n_e = len(terms)
    per = max(1, math.ceil(n_e / max_segments))
    segments = []
    lat_all, lon_all = grid.rc_to_latlon(rr, cc)
    for s, a in enumerate(range(0, n_e, per)):
        b = min(a + per, n_e)
        L = float(d_edges[a:b].sum())
        rise = float(zs[b] - zs[a])
        cells_r, cells_c = rr[a:b + 1], cc[a:b + 1]
        sub = {k: float(np.mean(hz_terms[k][cells_r, cells_c])) for k in ("slope", "roughness", "shadow", "thermal", "comms")}
        dose_mean = float(np.mean(arr["dose_h"][cells_r, cells_c]))
        grade = rise / L if L > 0 else 0.0
        energy = float(terms[a:b, 2].sum())
        dur = float(terms[a:b, 1].sum())
        segments.append({
            "i": s,
            "start": {"lat": float(lat_all[a]), "lon": float(lon_all[a])},
            "end": {"lat": float(lat_all[b]), "lon": float(lon_all[b])},
            "length_m": L,
            "duration_s": dur,
            "slope_deg": float(np.degrees(np.arctan(grade))),
            "ascent_m": float(np.clip(dz[a:b], 0, None).sum()),
            "components": {"time": float(comp[a:b, 0].sum()), "energy": float(comp[a:b, 1].sum()),
                           "dose": float(comp[a:b, 2].sum()), "hazard": float(comp[a:b, 3].sum()),
                           "science_factor": float(np.average(f_sci[a:b], weights=np.maximum(d_edges[a:b], 1e-9)))},
            "cost": float(terms[a:b, 0].sum()),
            "limiting_factor": _limiting_factor(sub, grade, dose_mean, dose_ref_h),
            "t_start_utc": (start_dt + timedelta(seconds=float(t_cum[a]))).isoformat().replace("+00:00", "Z"),
            "sun": {"elevation_deg": layers.sun.elevation_deg, "azimuth_deg": layers.sun.azimuth_deg,
                    "shadowed": bool(np.mean(layers.shadow[cells_r, cells_c]) > 0.5)},
            "temp_K": float(np.mean(layers.temp_K[cells_r, cells_c])),
            "dose_rate_mSv_h": dose_mean,
            "energy_kJ": energy / 1000.0,
            "o2_l": float(o2_use(energy, dur, astro.mass_astronaut)),
        })

    total_time = float(terms[:, 1].sum())
    total_energy = float(terms[:, 2].sum())
    total_dose = float(terms[:, 3].sum())
    total_hz = float(terms[:, 4].sum())
    o2 = float(o2_use(total_energy, total_time, astro.mass_astronaut))
    grades = np.abs(dz) / np.maximum(d_edges, 1e-9)
    shadow_frac = float(np.sum(d_edges * layers.shadow[rr[1:], cc[1:]]) / max(d_edges.sum(), 1e-9))
    ret_margin, ret = None, None
    d_cum = np.concatenate([[0.0], np.cumsum(d_edges)])
    if base_rc is not None and grid.inside(*base_rc):
        key = ("ret", tuple(base_rc), astro.v_flat, astro.m_tot)
        if key not in layers.cache:
            layers.cache[key] = return_field(arr, grid.cell, pack_params(resolve_weights("FASTEST"), astro), tuple(base_rc))
        e_cum = np.concatenate([[0.0], np.cumsum(terms[:, 2])])
        ret = eva_margin(layers.cache[key], rr, cc, t_cum, e_cum, astro)
        ret_margin = ret["margin"]
    totals = {
        "time_s": total_time, "length_m": float(d_edges.sum()),
        "ascent_m": float(np.clip(dz, 0, None).sum()), "descent_m": float(np.clip(-dz, 0, None).sum()),
        "max_slope_deg": float(np.degrees(np.arctan(grades.max()))) if len(grades) else 0.0,
        "dose_mSv": total_dose, "energy_kJ": total_energy / 1000.0, "o2_l": o2,
        "min_temp_K": float(np.min(layers.temp_K[rr, cc])), "shadow_fraction": shadow_frac,
        "science_score": float(np.mean(arr["sci"][rr, cc])),
        "return_margin": ret_margin,
        "risk": total_dose / refs[2] + total_hz / refs[3],
    }
    violations = []
    if total_time > astro.eva_max_s:
        violations.append({"kind": "EVA_TIME", "message": f"Route takes {total_time / 3600:.1f} h, above the "
                           f"{astro.eva_max_s / 3600:.1f} h EVA limit. Split the traverse or use a rover.", "at_index": None})
    usable_o2 = astro.o2_capacity_l * (1 - astro.reserve_fraction)
    if o2 > usable_o2:
        violations.append({"kind": "O2", "message": f"Needs {o2:.0f} L O2, above the usable {usable_o2:.0f} L "
                           "(capacity minus reserve).", "at_index": None})

    if ret is not None and ret["first_violation"] is not None:
        k = ret["first_violation"]
        what = "oxygen" if ret["limiting"] == "oxygen" else "time"
        violations.append({"kind": "RETURN_RESERVE", "at_index": int(k), "message": (
            f"{d_cum[k] / 1000:.1f} km into the route the remaining {what} no longer covers the way back to base with the "
            f"{astro.reserve_fraction * 100:.0f}% reserve. Turn around earlier or shorten the traverse.")})
    # Watney-style check extras: shelter time, turn-back point, oxygen-out point, daylight, verdict.
    shelter_s = turnback_m = None
    if ret is not None:
        rt = layers.cache[key]["time_s"][rr, cc]
        shelter_s = float(np.max(rt[np.isfinite(rt)])) if np.isfinite(rt).any() else None
        fv = ret["first_violation"]
        turnback_m = float(d_cum[max(fv - 1, 0)]) if fv is not None else None
    cum_e = np.concatenate([[0.0], np.cumsum(terms[:, 2])])
    depleted = np.flatnonzero(o2_use(cum_e, t_cum, astro.mass_astronaut) >= astro.o2_capacity_l)
    lat0, lon0 = grid.center_latlon()
    totals.update({
        "shelter_time_s": shelter_s, "turnback_distance_m": turnback_m,
        "o2_depleted_at_m": float(d_cum[depleted[0]]) if depleted.size else None,
        "o2_depleted_at_s": float(t_cum[depleted[0]]) if depleted.size else None,
        "sunset_in_s": sunset_in_s(lat0, lon0, utc),
    })
    verdict = route_verdict(totals, violations, astro)
    keep = douglas_peucker(np.column_stack([xs, ys]), 0.5 * grid.cell)
    coords = [[float(lon_all[k]), float(lat_all[k]), float(zs[k])] for k in keep]
    result = {
        "route_id": _route_id(grid.site_id, grid.level, profile, w, pts, utc),
        "site_id": grid.site_id,
        "profile": profile,
        "weights": w,
        "geometry": {"type": "LineString", "coordinates": coords},
        "xy": [[float(xs[k]), float(ys[k])] for k in keep],
        "waypoint_order": order,
        "totals": totals,
        "segments": segments,
        "feasibility": {"ok": not violations, "violations": violations},
        "verdict": verdict,
        "uncertainty": None,
        "assumptions": ASSUMPTIONS,
        "data_levels": [grid.level],
        "simulated_inputs": layers.simulated,
        "computed_ms": (time.perf_counter() - t0) * 1000.0,
    }
    if return_cells:
        result["cells"] = [[int(r), int(c)] for r, c in zip(rr, cc, strict=True)]
    return result


def non_dominated(routes: list[dict]) -> list[dict]:
    """Routes not dominated in (time_s, risk) — both minimised — sorted by time."""
    pts = [(r["totals"]["time_s"], r["totals"]["risk"]) for r in routes]
    keep = []
    for i, (t, k) in enumerate(pts):
        dominated = any((t2 <= t and k2 <= k) and (t2 < t or k2 < k) for j, (t2, k2) in enumerate(pts) if j != i)
        if not dominated:
            keep.append(routes[i])
    return sorted(keep, key=lambda r: r["totals"]["time_s"])


def knee_point(front: list[dict]) -> int:
    """F33 — index of the knee: the front point closest to the utopia point (t_min, risk_min) in normalised coordinates."""
    if len(front) <= 2:
        return 0 if len(front) == 1 else 0
    t = np.array([r["totals"]["time_s"] for r in front])
    k = np.array([r["totals"]["risk"] for r in front])
    tn = (t - t.min()) / max(np.ptp(t), 1e-12)
    kn = (k - k.min()) / max(np.ptp(k), 1e-12)
    return int(np.argmin(np.hypot(tn, kn)))


def pareto_routes(grid: SiteGrid, waypoints_rc: list[tuple[int, int]], n_points: int = 7, start_utc: str | None = None,
                  astronaut: dict | None = None, **kw) -> dict:
    """F32 + F33 — non-dominated routes on the time-vs-risk front by sweeping the weights from pure time to pure safety.

    Returns {routes, front, knee_route_id}; the first route is labelled FASTEST, the last SAFEST, the knee BALANCED.
    """
    utc = start_utc or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    layers = build_layers(grid, utc, Astronaut.from_api(astronaut))
    sweep = max(2 * n_points + 1, 9)
    seen, cands = set(), []
    for lam in np.linspace(0.0, 1.0, sweep):
        w = {"w_tau": 1.0 - lam, "w_E": 0.1, "w_D": 0.5 * lam, "w_H": 0.5 * lam, "alpha": 0.0}
        r = plan_route(grid, waypoints_rc, "BALANCED", weights=w, start_utc=utc, astronaut=astronaut, layers=layers, **kw)
        key = (round(r["totals"]["time_s"], 1), round(r["totals"]["risk"], 4))
        if key not in seen:
            seen.add(key)
            cands.append(r)
    front = non_dominated(cands)
    if len(front) > n_points:
        idx = np.unique(np.round(np.linspace(0, len(front) - 1, n_points)).astype(int))
        front = [front[i] for i in idx]
    knee = knee_point(front)
    for i, r in enumerate(front):
        r["profile"] = "FASTEST" if i == 0 and len(front) > 1 else "SAFEST" if i == len(front) - 1 and len(front) > 1 else "BALANCED"
    if front:
        front[knee]["profile"] = "BALANCED"
    return {"routes": front, "front": [{"route_id": r["route_id"], "time_s": r["totals"]["time_s"], "risk": r["totals"]["risk"]} for r in front],
            "knee_route_id": front[knee]["route_id"] if front else None}


def alternatives(grid: SiteGrid, waypoints_rc: list[tuple[int, int]], profiles: list[str], **kw) -> dict:
    astro = Astronaut.from_api(kw.get("astronaut"))
    utc = kw.get("start_utc") or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    layers = build_layers(grid, utc, astro)
    routes = [plan_route(grid, waypoints_rc, profile=p, start_utc=utc, layers=layers,
                         **{k: v for k, v in kw.items() if k not in ("start_utc",)}) for p in profiles]
    best_t = min(routes, key=lambda r: r["totals"]["time_s"])["route_id"] if routes else None
    best_r = min(routes, key=lambda r: r["totals"]["risk"])["route_id"] if routes else None
    return {"routes": routes, "best_time_route_id": best_t, "best_risk_route_id": best_r}


def order_waypoints(grid: SiteGrid, waypoints_rc: list[tuple[int, int]], profile: str = "BALANCED", start_utc: str | None = None,
                    astronaut: dict | None = None, return_to_start: bool = True, layers: CellLayers | None = None) -> dict:
    """F30 + F31 — pairwise cost matrix, then Held–Karp (n ≤ 13) or nearest neighbour + 2-opt. Index 0 stays first."""
    utc = start_utc or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    astro = Astronaut.from_api(astronaut)
    P = pack_params(resolve_weights(profile), astro)
    layers = layers or build_layers(grid, utc, astro)
    n = len(waypoints_rc)
    M = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i != j:
                M[i, j] = search(layers.arrays, grid.cell, P, waypoints_rc[i], waypoints_rc[j])[1]
    if n <= 13:
        order, cost = held_karp(M, return_to_start)
        method = "held_karp"
    else:
        order, cost = nn_two_opt(M, return_to_start)
        method = "nn_2opt"
    return {"order": order, "cost_matrix": M.tolist(), "total_cost": cost, "method": method}


def _tour_cost(M: np.ndarray, order: list[int], closed: bool) -> float:
    c = sum(M[a, b] for a, b in itertools.pairwise(order))
    return float(c + (M[order[-1], order[0]] if closed else 0.0))


def held_karp(M: np.ndarray, closed: bool) -> tuple[list[int], float]:
    n = len(M)
    dp: dict[tuple[int, int], tuple[float, int]] = {(1 | (1 << k), k): (M[0, k], 0) for k in range(1, n)}
    for size in range(3, n + 1):
        for subset in itertools.combinations(range(1, n), size - 1):
            mask = 1 | sum(1 << s for s in subset)
            for k in subset:
                prev = mask ^ (1 << k)
                dp[(mask, k)] = min(((dp[(prev, m)][0] + M[m, k], m) for m in subset if m != k), key=lambda t: t[0])
    full = (1 << n) - 1
    if n == 1:
        return [0], 0.0
    end_cost = {k: dp[(full, k)][0] + (M[k, 0] if closed else 0.0) for k in range(1, n)}
    last = min(end_cost, key=end_cost.get)  # type: ignore[arg-type]
    order, mask, k = [], full, last
    while k != 0:
        order.append(k)
        _, prev_k = dp[(mask, k)]
        mask ^= 1 << k
        k = prev_k
    order.append(0)
    order.reverse()
    return order, float(end_cost[last])


def nn_two_opt(M: np.ndarray, closed: bool) -> tuple[list[int], float]:
    n = len(M)
    order, left = [0], set(range(1, n))
    while left:
        nxt = min(left, key=lambda j: M[order[-1], j])
        order.append(nxt)
        left.remove(nxt)
    improved = True
    while improved:
        improved = False
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                cand = order[:i] + order[i:j + 1][::-1] + order[j + 1:]
                if _tour_cost(M, cand, closed) < _tour_cost(M, order, closed) - 1e-12:
                    order, improved = cand, True
    return order, _tour_cost(M, order, closed)


def back_to_base(grid: SiteGrid, pos_rc: tuple[int, int], base_rc: tuple[int, int], start_utc: str | None = None,
                 profile: str = "SAFEST", astronaut: dict | None = None) -> dict:
    """F45 — route from the current position back to base with bearing, distance, ETA and dose."""
    route = plan_route(grid, [pos_rc, base_rc], profile=profile, start_utc=start_utc, astronaut=astronaut)
    xy = np.asarray(route["xy"])
    x0, y0 = grid.rc_to_xy(*pos_rc)
    x1, y1 = grid.rc_to_xy(*base_rc)
    return {
        "bearing_deg": float(bearing_xy(xy[0, 0], xy[0, 1], xy[1, 0], xy[1, 1])) if len(xy) > 1 else 0.0,
        "straight_bearing_deg": float(bearing_xy(x0, y0, x1, y1)),
        "distance_m": route["totals"]["length_m"],
        "straight_distance_m": float(np.hypot(x1 - x0, y1 - y0)),
        "eta_s": route["totals"]["time_s"],
        "dose_mSv": route["totals"]["dose_mSv"],
        "route": route,
    }
