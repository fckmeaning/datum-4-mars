"""Rover mobility and the Apollo walkback rule (extends F34/F35).

Walkback rule: a rover traverse is acceptable only if, at EVERY point of it, the crew could walk back to base on foot
with the suit consumables (oxygen, EVA time) they would still have if the rover failed right there, keeping the reserve.
The way back uses the walking model and the F34 return field; the way out uses the rover model.

* unpressurised rover: the crew is suited while driving, so driving burns suit oxygen (seated metabolic rate) and EVA time;
* pressurised rover: the crew rides in the cabin, suit consumables are untouched until a breakdown; the walk back starts
  from full suits.

The rover speed, slope limit, speed law and seated metabolic rate come from config/params.yaml (section ``rover``); the other
numbers marked ASSUMPTION are module-level constants. All are returned in the plan's ``assumptions`` list. None of them is validated against flight hardware.
"""

from __future__ import annotations

import itertools
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime

import numpy as np
from numpy.typing import NDArray

from marsnav.config import param
from marsnav.routing import astar as K
from marsnav.routing.astar import NoPathError, path_terms, search
from marsnav.routing.cost import Astronaut, CellLayers, build_layers, pack_params, resolve_weights
from marsnav.routing.grid import SiteGrid
from marsnav.routing.mobility import o2_use
from marsnav.routing.planner import _route_id, douglas_peucker
from marsnav.routing.returnfield import return_field

# ---- rover model constants: config/params.yaml (section "rover"), the other ASSUMPTIONS stay module-level ----------------
ROVER_SPEED_M_S = float(param("rover.speed_m_s"))          # ASSUMPTION: 5 km/h cruise on flat ground
ROVER_THETA_MAX_DEG = float(param("rover.theta_max_deg"))  # ASSUMPTION: steepest slope the rover may drive (the suited crew walk limit is 25 deg)
ROVER_STEP_MAX_M = 0.4              # ASSUMPTION: obstacle/step the rover can clear (meaningful only at L3 resolution)
ROVER_TOBLER_A = float(param("rover.tobler_a"))            # ASSUMPTION: speed falls as exp(-a*|grade|); rover loses ~1/3 of its speed at 15 deg
ROVER_TOBLER_B = float(param("rover.tobler_b"))            # ASSUMPTION: speed peaks on flat ground (no downhill bonus for a braking rover)
ROVER_K_ROUGHNESS = float(param("rover.k_roughness"))      # ASSUMPTION: speed divided by (1 + k*roughness_norm)
SEATED_MET = float(param("rover.seated_met"))              # ASSUMPTION: suited crew sitting in an unpressurised rover, in multiples of 1 MET
ROVER_BATTERY_RESERVE = 0.2         # ASSUMPTION: fraction of the battery kept in reserve
ROVER_PRESETS: dict[str, dict] = {
    # mass_kg: rover + crew + payload; crr: rolling resistance on loose regolith; drive_eff: battery-to-wheel efficiency;
    # aux_w: housekeeping power; dose_shield: crew dose relative to standing in the open (hull shielding)
    "unpressurised": {"mass_kg": 480.0, "crr": 0.15, "drive_eff": 0.6, "aux_w": 100.0, "battery_kwh": 8.0, "dose_shield": 1.0},
    "pressurised": {"mass_kg": 3500.0, "crr": 0.15, "drive_eff": 0.6, "aux_w": 1500.0, "battery_kwh": 40.0, "dose_shield": 0.5},
}
ENERGY_FLOOR_FRAC = 0.2             # ASSUMPTION: downhill driving still needs 20 % of the flat rolling energy (braking, no regeneration)

ASSUMPTIONS_ROVER = [
    f"Rover cruise speed {ROVER_SPEED_M_S * 3.6:.0f} km/h, slope limit {ROVER_THETA_MAX_DEG:.0f} deg, "
    f"speed falls as exp(-{ROVER_TOBLER_A}|grade|) (ASSUMPTION).",
    f"Seated suited crew in an unpressurised rover burn oxygen at {SEATED_MET} MET (ASSUMPTION).",
    "Rover energy = m*g_Mars*d*(Crr*cos(theta)+sin(theta))/eta + auxiliary power*time, downhill floored at 20 % (ASSUMPTION; no regeneration).",
    "Walkback: the return on foot is the time-optimal walk (F34) with the walking model; the reserve fraction applies to EVA time and oxygen.",
    "Pressurised rover: suit consumables are not used while driving; the walk back starts from full suits (ASSUMPTION).",
]


@dataclass
class Rover:
    """Rover parameters; ``kind`` selects the preset ('unpressurised' | 'pressurised'), other fields override it."""

    kind: str = "unpressurised"
    speed_m_s: float = ROVER_SPEED_M_S
    theta_max_deg: float = ROVER_THETA_MAX_DEG
    step_max_m: float = ROVER_STEP_MAX_M
    tobler_a: float = ROVER_TOBLER_A
    tobler_b: float = ROVER_TOBLER_B
    k_roughness: float = ROVER_K_ROUGHNESS
    seated_met: float = SEATED_MET
    mass_kg: float = 0.0
    crr: float = 0.0
    drive_eff: float = 0.0
    aux_w: float = 0.0
    battery_kwh: float = 0.0
    dose_shield: float = 0.0
    extra: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.kind not in ROVER_PRESETS:
            raise ValueError(f"unknown rover kind '{self.kind}'; use one of {sorted(ROVER_PRESETS)}")
        for k, v in ROVER_PRESETS[self.kind].items():
            if getattr(self, k) == 0.0:
                setattr(self, k, v)

    @property
    def pressurized(self) -> bool:
        return self.kind == "pressurised"

    @classmethod
    def from_api(cls, d: dict | None) -> Rover:
        if not d:
            return cls()
        mapping = {"kind": "kind", "speed_m_s": "speed_m_s", "theta_max_deg": "theta_max_deg", "step_max_m": "step_max_m",
                   "mass_kg": "mass_kg", "battery_kWh": "battery_kwh", "aux_w": "aux_w", "dose_shield": "dose_shield",
                   "seated_met": "seated_met"}
        kw = {attr: (str(d[k]) if attr == "kind" else float(d[k])) for k, attr in mapping.items() if d.get(k) is not None}
        return cls(**kw)


def rover_energy(d_m: NDArray, dz_m: NDArray, tau_s: NDArray, rover: Rover) -> NDArray:
    """Rover battery energy [J] per edge: m·g_Mars·d·max(Crr·cosθ + sinθ, floor)/η + aux·τ (ASSUMPTION model)."""
    d = np.asarray(d_m, dtype=float)
    theta = np.arctan2(np.asarray(dz_m, dtype=float), np.maximum(d, 1e-12))
    spec = np.maximum(rover.crr * np.cos(theta) + np.sin(theta), ENERGY_FLOOR_FRAC * rover.crr)
    g_m = float(param("constants.g_mars"))
    return rover.mass_kg * g_m * d * spec / rover.drive_eff + rover.aux_w * np.asarray(tau_s, dtype=float)


def pack_rover_params(weights: dict[str, float], astro: Astronaut, rover: Rover) -> NDArray:
    """Packed kernel vector for driving: Tobler-shaped rover speed, rover slope limit, energy weight zero.

    Energy is not an objective (the kernel's energy polynomial is the walking one); battery use is checked afterwards with
    ``rover_energy``. The search therefore weighs time, dose and hazard.
    """
    w = dict(weights)
    w["w_E"] = 0.0
    P = pack_params(w, astro)
    P[K.P_V_FLAT] = rover.speed_m_s
    P[K.P_TOB_A] = rover.tobler_a
    P[K.P_TOB_B] = rover.tobler_b
    P[K.P_K_R] = rover.k_roughness
    P[K.P_GRADE_LIM] = float(np.tan(np.radians(rover.theta_max_deg)))
    return P


def walkback_margin(ret: dict[str, NDArray], rr: NDArray, cc: NDArray, t_drive_s: NDArray, astro: Astronaut,
                    pressurized: bool = False, seated_met: float = SEATED_MET, mass_astronaut: float | None = None) -> dict:
    """F35 (walkback form) — resource margin at every route vertex if the rover failed there and the crew walked home.

    margin_k = min( (usable_time − t_used_k − t_back_k)/EVA_max , (usable_O2 − O2_used_k − O2_back_k)/O2_capacity ), with
    usable = budget·(1 − reserve). t_used and O2_used are what driving has consumed (zero for a pressurised rover);
    t_back and O2_back come from the F34 return field (walking). Unreachable on foot gives −inf.
    Returns arrays ``margin``, ``margin_time``, ``margin_o2``, ``reachable`` and ``first_violation`` (index or None).
    """
    m = astro.mass_astronaut if mass_astronaut is None else mass_astronaut
    t_drive = np.asarray(t_drive_s, dtype=float)
    t_back = ret["time_s"][rr, cc]
    e_back = ret["energy_J"][rr, cc]
    reachable = np.isfinite(t_back)
    t_back = np.where(reachable, t_back, 0.0)
    e_back = np.where(reachable, e_back, 0.0)
    keep = 1.0 - astro.reserve_fraction
    t_used = np.zeros_like(t_drive) if pressurized else t_drive
    met_o2 = float(param("physiology.met_o2"))  # mL/(kg·min) per MET
    o2_out = np.zeros_like(t_drive) if pressurized else seated_met * met_o2 * m * (t_drive / 60.0) / 1000.0
    m_time = (astro.eva_max_s * keep - t_used - t_back) / astro.eva_max_s
    m_o2 = (astro.o2_capacity_l * keep - o2_out - o2_use(e_back, t_back, m)) / astro.o2_capacity_l
    margin = np.where(reachable, np.minimum(m_time, m_o2), -np.inf)
    bad = np.flatnonzero(margin < 0)
    return {"margin": margin, "margin_time": m_time, "margin_o2": m_o2, "reachable": reachable,
            "first_violation": int(bad[0]) if bad.size else None}


def zero_margin_crossing(margin: NDArray, d_cum: NDArray) -> dict | None:
    """Where the margin first drops below zero: {index, fraction, distance_m} (vertex index k−1 → k), None if it never does.

    Linear interpolation of the margin between the two vertices; if the crew cannot walk back from vertex k at all (−inf)
    the last safe vertex k−1 is returned (fraction 0).
    """
    bad = np.flatnonzero(margin < 0)
    if bad.size == 0:
        return None
    k = int(bad[0])
    if k == 0:
        return {"index": 0, "fraction": 0.0, "distance_m": 0.0}
    m0, m1 = float(margin[k - 1]), float(margin[k])
    frac = m0 / (m0 - m1) if np.isfinite(m1) and m0 != m1 else 0.0
    frac = float(min(max(frac, 0.0), 1.0))
    return {"index": k - 1, "fraction": frac, "distance_m": float(d_cum[k - 1] + frac * (d_cum[k] - d_cum[k - 1]))}


def plan_rover_route(grid: SiteGrid, waypoints_rc: list[tuple[int, int]], base_rc: tuple[int, int], rover: dict | Rover | None = None,
                     profile: str = "BALANCED", start_utc: str | None = None, astronaut: dict | None = None,
                     return_to_base: bool = False, layers: CellLayers | None = None, return_cells: bool = False) -> dict:
    """Plan a rover traverse through waypoint cells and apply the Apollo walkback rule along it.

    Raises ``NoPathError`` when a leg cannot be driven (slope/step/no-data limits of the rover). A traverse that breaks the
    walkback rule or the battery is still returned, with ``feasibility.ok = False`` and a plain-English reason, plus
    ``walkback.max_safe_distance_m`` (how far along the route the rule still holds) and ``walkback.zero_margin_point``.
    """
    t_start = time.perf_counter()
    if len(waypoints_rc) < 2:
        raise ValueError("at least two waypoints are required")
    if not grid.inside(*base_rc):
        raise ValueError(f"base cell {tuple(base_rc)} is outside the site grid")
    for r, c in waypoints_rc:
        if not grid.inside(r, c):
            raise NoPathError(f"waypoint cell {(r, c)} is outside the site grid")
    utc = start_utc or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    astro = Astronaut.from_api(astronaut)
    rv = rover if isinstance(rover, Rover) else Rover.from_api(rover)
    layers = layers or build_layers(grid, utc, astro)
    arr = layers.arrays

    blocked = (~np.isfinite(grid.z)) | (arr["slope_deg"] > rv.theta_max_deg)
    if "step_max_m" in grid.extras:
        blocked |= grid.extras["step_max_m"] > rv.step_max_m
    arr_r = {**arr, "blocked": blocked, "dose_h": arr["dose_h"] * rv.dose_shield}
    w = resolve_weights(profile)
    P = pack_rover_params(w, astro, rv)
    c_min = K.min_cost_per_metre(arr_r["z"], arr_r["rough_n"], arr_r["haz"], arr_r["dose_h"], arr_r["sci"], arr_r["blocked"], grid.cell, P)

    pts = [tuple(p) for p in waypoints_rc]
    if return_to_base:
        pts.append(tuple(base_rc))
    path: list[tuple[int, int]] = []
    for a, b in itertools.pairwise(pts):
        leg, _, _ = search(arr_r, grid.cell, P, a, b, heuristic=True, c_min=c_min)
        path.extend(leg if not path else leg[1:])

    terms = path_terms(arr_r, grid.cell, P, path)  # cost, tau, (walking energy: unused), dose, hazard, science
    rr = np.array([p[0] for p in path])
    cc = np.array([p[1] for p in path])
    xs, ys = grid.rc_to_xy(rr, cc)
    zs = arr["z"][rr, cc]
    d_edges = np.hypot(np.diff(xs), np.diff(ys))
    dz = np.diff(zs)
    tau = terms[:, 1]
    t_cum = np.concatenate([[0.0], np.cumsum(tau)])
    d_cum = np.concatenate([[0.0], np.cumsum(d_edges)])
    energy_j = rover_energy(d_edges, dz, tau, rv)
    battery_kwh_used = float(energy_j.sum() / 3.6e6)

    key = ("ret", tuple(base_rc), astro.v_flat, astro.m_tot)  # same cache key as plan_route, so layers can be shared
    if key not in layers.cache:
        layers.cache[key] = return_field(arr, grid.cell, pack_params(resolve_weights("FASTEST"), astro), tuple(base_rc))
    wb = walkback_margin(layers.cache[key], rr, cc, t_cum, astro, rv.pressurized, rv.seated_met)
    margin = wb["margin"]
    crossing = zero_margin_crossing(margin, d_cum)

    refs = [float(param(f"routing.refs.{k}")) for k in ("D_ref", "Hz_ref")]
    totals = {
        "time_s": float(tau.sum()), "length_m": float(d_edges.sum()),
        "ascent_m": float(np.clip(dz, 0, None).sum()), "descent_m": float(np.clip(-dz, 0, None).sum()),
        "max_slope_deg": float(np.degrees(np.arctan(np.max(np.abs(dz) / np.maximum(d_edges, 1e-9))))) if len(dz) else 0.0,
        "energy_kWh": battery_kwh_used, "battery_fraction": battery_kwh_used / rv.battery_kwh,
        "dose_mSv": float(terms[:, 3].sum()), "risk": float(terms[:, 3].sum() / refs[0] + terms[:, 4].sum() / refs[1]),
        "walkback_margin_min": float(np.min(margin)) if np.isfinite(np.min(margin)) else -1.0,
    }

    violations: list[dict] = []
    point = None
    if crossing is not None:
        k = wb["first_violation"]
        point = _crossing_point(grid, crossing, rr, cc, base_rc)
        if not bool(wb["reachable"][k]):
            why = "the terrain from there back to base is too steep or missing for suited walking"
        else:
            limiting = "oxygen" if wb["margin_o2"][k] < wb["margin_time"][k] else "EVA time"
            why = f"the remaining {limiting} would not cover the walk back with the {astro.reserve_fraction * 100:.0f}% reserve"
        violations.append({"kind": "WALKBACK", "at_index": int(k), "message": (
            f"{crossing['distance_m'] / 1000:.1f} km into the drive, {why}. If the rover failed beyond this point the crew could not "
            "walk home. Turn around before it, shorten the traverse or use a pressurised rover.")})
    if battery_kwh_used > rv.battery_kwh * (1.0 - ROVER_BATTERY_RESERVE):
        violations.append({"kind": "BATTERY", "at_index": None, "message": (
            f"The traverse needs {battery_kwh_used:.1f} kWh, above the usable {rv.battery_kwh * (1 - ROVER_BATTERY_RESERVE):.1f} kWh "
            f"({ROVER_BATTERY_RESERVE * 100:.0f}% battery reserve kept).")})

    m_caution = float(param("verdict.margin_caution"))
    if violations:
        verdict = {"call": "NO_GO", "reasons": [v["message"] for v in violations]}
    elif totals["walkback_margin_min"] < m_caution:
        verdict = {"call": "CAUTION", "reasons": [f"The walkback margin is only {totals['walkback_margin_min'] * 100:.0f}% of the EVA budget."]}
    else:
        verdict = {"call": "READY", "reasons": []}

    lat_all, lon_all = grid.rc_to_latlon(rr, cc)
    keep = douglas_peucker(np.column_stack([xs, ys]), 0.5 * grid.cell)
    step = max(1, len(margin) // 200)
    result = {
        "route_id": _route_id(grid.site_id, grid.level, "rover", rv.kind, profile, pts, utc),
        "site_id": grid.site_id, "mobility": "rover", "rover": {"kind": rv.kind, "speed_m_s": rv.speed_m_s, "theta_max_deg": rv.theta_max_deg,
                                                              "battery_kWh": rv.battery_kwh, "pressurized": rv.pressurized},
        "profile": profile,
        "geometry": {"type": "LineString", "coordinates": [[float(lon_all[k]), float(lat_all[k]), float(zs[k])] for k in keep]},
        "xy": [[float(xs[k]), float(ys[k])] for k in keep],
        "totals": totals,
        "walkback": {
            "margin_min": totals["walkback_margin_min"],
            "first_violation_index": wb["first_violation"],
            "max_safe_distance_m": crossing["distance_m"] if crossing else float(d_cum[-1]),
            "zero_margin_point": point,
            "margin_profile": [[float(d_cum[i]), float(max(margin[i], -1.0))] for i in range(0, len(margin), step)],
        },
        "feasibility": {"ok": not violations, "violations": violations},
        "verdict": verdict,
        "assumptions": ASSUMPTIONS_ROVER,
        "data_levels": [grid.level], "simulated_inputs": layers.simulated,
        "computed_ms": (time.perf_counter() - t_start) * 1000.0,
    }
    if return_cells:
        result["cells"] = [[int(r), int(c)] for r, c in zip(rr, cc, strict=True)]
    return result


def _crossing_point(grid: SiteGrid, crossing: dict, rr: NDArray, cc: NDArray, base_rc: tuple[int, int]) -> dict:
    k, f = crossing["index"], crossing["fraction"]
    k2 = min(k + 1, len(rr) - 1)
    r = rr[k] + f * (rr[k2] - rr[k])
    c = cc[k] + f * (cc[k2] - cc[k])
    lat, lon = grid.rc_to_latlon(r, c)
    x, y = grid.rc_to_xy(r, c)
    xb, yb = grid.rc_to_xy(*base_rc)
    return {"lat": float(lat), "lon": float(lon), "along_route_m": crossing["distance_m"],
            "distance_from_base_m": float(np.hypot(x - xb, y - yb))}
