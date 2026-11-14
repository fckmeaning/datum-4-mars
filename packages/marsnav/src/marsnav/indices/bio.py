"""F55 — geo-biological interest index B (0-100): B = 100·(a·Water + b·Minerals + c·Geology + d·Sediment) / (sum of the weights with data).

This is a PROXY index for past habitability potential used to rank places of scientific interest. It is NOT evidence of life and says nothing
about present habitability. Inputs are sub-scores in [0, 1]:
  Water      signs of ancient water activity (e.g. hydrated minerals, channels, deltas, alluvial fans),
  Minerals   minerals of interest (e.g. phyllosilicates, sulfates, carbonates from CRISM summary parameters),
  Geology    geological signs (unit age / type from a geologic map),
  Sediment   sedimentary formations (layered deposits from a geologic map or imagery).

Data honesty: an input with no real data is never invented. Missing inputs (``None``, an all-NaN array, or cells flagged unavailable by a mask)
drop out and the weights are renormalised over the inputs that exist in that cell; ``coverage`` is the share of the total weight that had data
and ``partial`` says the result rests on a subset. A cell with no data at all is NaN. Weights are ASSUMPTION values (``indices.bio.*``).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from marsnav.config import param
from marsnav.indices.walkability import classify

NAMES = ("water", "minerals", "geology", "sediment")
DISCLAIMER = "Geo-biological interest (proxy index for past habitability), not evidence of life."


def bio_weights() -> dict[str, float]:
    """The four weights from config, normalised to sum 1."""
    w = {"water": float(param("indices.bio.w_water")), "minerals": float(param("indices.bio.w_minerals")),
         "geology": float(param("indices.bio.w_geology")), "sediment": float(param("indices.bio.w_sediment"))}
    total = sum(w.values())
    if total <= 0:
        raise ValueError("indices.bio weights must have a positive sum")
    return {k: v / total for k, v in w.items()}


@dataclass(frozen=True)
class BioResult:
    B: NDArray  # 0-100, NaN where no input has data
    classes: NDArray  # int8: 2 green, 1 yellow, 0 red, -1 not classified (no data or coverage below ``indices.bio.min_coverage``)
    coverage: NDArray  # share of the total weight that had data, [0, 1]
    inputs_used: list[str]  # inputs with data in at least one cell
    partial: bool  # True when any cell is computed from fewer than all four inputs
    weights: dict[str, float]
    disclaimer: str


def bio_potential_index(water: NDArray | None, minerals: NDArray | None, geology: NDArray | None, sediment: NDArray | None,
                        masks: Mapping[str, NDArray | None] | None = None, w: dict[str, float] | None = None) -> BioResult:
    """F55 — geo-biological interest index with per-cell renormalisation over the inputs that have real data."""
    inputs = {"water": water, "minerals": minerals, "geology": geology, "sediment": sediment}
    shape = next((np.shape(a) for a in inputs.values() if a is not None), None)
    if shape is None:
        raise ValueError("at least one input array is required to know the grid shape")
    weights = bio_weights() if w is None else w
    masks = masks or {}
    num = np.zeros(shape)
    wsum = np.zeros(shape)
    used: list[str] = []
    for name in NAMES:
        arr = inputs[name]
        if arr is None:
            continue
        a = np.asarray(arr, dtype=float)
        if a.shape != shape:
            raise ValueError(f"input '{name}' has shape {a.shape}, expected {shape}")
        avail = np.isfinite(a)
        m = masks.get(name)
        if m is not None:
            avail = avail & np.asarray(m, dtype=bool)
        if not avail.any():
            continue
        used.append(name)
        num += np.where(avail, weights[name] * np.clip(a, 0.0, 1.0), 0.0)
        wsum += np.where(avail, weights[name], 0.0)
    total = sum(weights.values())
    coverage = wsum / total
    B = np.where(wsum > 0, 100.0 * num / np.where(wsum > 0, wsum, 1.0), np.nan)
    classes = classify(B)
    classes = np.where(coverage >= float(param("indices.bio.min_coverage")), classes, -1).astype(np.int8)
    partial = bool(((coverage > 0) & (coverage < 1.0 - 1e-12)).any())
    return BioResult(B, classes, coverage, used, partial, weights, DISCLAIMER)
