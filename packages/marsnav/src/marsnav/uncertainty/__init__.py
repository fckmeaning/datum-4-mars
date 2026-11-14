"""F38 — Monte Carlo uncertainty of a route's totals over the ASSUMPTION parameters.

The route (cells) is held fixed; each run draws the parameters below uniformly from their ``range`` in config/params.yaml and
re-evaluates time, dose, energy and oxygen along it. Output: [p5, p50, p95] per metric. Deterministic for a given seed.
"""

from __future__ import annotations

import numpy as np

from marsnav.config import entry, param
from marsnav.env import dose_rate, pressure
from marsnav.routing import astar as K
from marsnav.routing.astar import path_terms
from marsnav.routing.cost import Astronaut, CellLayers, pack_params, resolve_weights
from marsnav.routing.grid import SiteGrid
from marsnav.routing.mobility import o2_use

VARIED = ("astronaut.v_flat", "astronaut.mass_astronaut", "astronaut.mass_suit", "astronaut.mass_payload", "astronaut.s_suit",
          "mobility.k_roughness", "radiation.dose_eq_ref", "radiation.beta_pressure_dose", "atmosphere.P_ref")


def _draw(rng: np.random.Generator) -> dict[str, float]:
    out = {}
    for key in VARIED:
        e = entry(key)
        lo, hi = e["range"]
        out[key] = float(rng.uniform(lo, hi))
    return out


def route_uncertainty(grid: SiteGrid, layers: CellLayers, cells: list[tuple[int, int]], profile: str = "BALANCED",
                      astronaut: dict | None = None, runs: int | None = None, seed: int | None = None,
                      return_samples: bool = False) -> dict:
    runs = int(param("uncertainty.mc_runs")) if runs is None else runs
    seed = int(param("uncertainty.seed")) if seed is None else seed
    rng = np.random.default_rng(seed)
    astro = Astronaut.from_api(astronaut)
    base_P = pack_params(resolve_weights(profile), astro)
    arr = dict(layers.arrays)
    sky = grid.sky_fraction
    z = arr["z"]
    nominal = {"dose_eq_ref": float(param("radiation.dose_eq_ref"))}
    samples = {"time_s": [], "dose_mSv": [], "energy_kJ": [], "o2_l": []}
    for _ in range(runs):
        d = _draw(rng)
        P = base_P.copy()
        P[K.P_V_FLAT] = d["astronaut.v_flat"]
        P[K.P_K_R] = d["mobility.k_roughness"]
        P[K.P_S_SUIT] = d["astronaut.s_suit"]
        P[K.P_M_TOT] = d["astronaut.mass_astronaut"] + d["astronaut.mass_suit"] + d["astronaut.mass_payload"]
        p_ref = d["atmosphere.P_ref"]
        dose_h = dose_rate(sky, pressure(z, grid.z_ref, p_ref), P_ref=p_ref, beta=d["radiation.beta_pressure_dose"])
        arr["dose_h"] = dose_h * (d["radiation.dose_eq_ref"] / nominal["dose_eq_ref"])
        t = path_terms(arr, grid.cell, P, cells)
        time_s, energy = float(t[:, 1].sum()), float(t[:, 2].sum())
        samples["time_s"].append(time_s)
        samples["dose_mSv"].append(float(t[:, 3].sum()))
        samples["energy_kJ"].append(energy / 1000.0)
        samples["o2_l"].append(float(o2_use(energy, time_s, d["astronaut.mass_astronaut"])))
    q = {k: [float(x) for x in np.percentile(v, [5, 50, 95])] for k, v in samples.items()}
    out = {"quantiles": q, "runs": runs, "seed": seed, "varied_parameters": list(VARIED)}
    if return_samples:
        out["samples"] = {k: np.asarray(v) for k, v in samples.items()}
    return out
