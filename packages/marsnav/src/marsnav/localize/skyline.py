"""F43 — skyline (horizon) matching: position and heading from the horizon line seen by the astronaut.

For every candidate position the horizon profile h(φ) is synthesised from the DEM with F07. The observed profile (elevation
angles of the horizon line at azimuths relative to the viewing direction, e.g. traced on a photo with a known field of view)
is compared with it by a *masked*, normalised circular cross-correlation computed with FFTs: the lag of the peak is the
heading ψ (observed relative azimuth + ψ = absolute azimuth), the peak value in [−1, 1] is the score of that candidate.
A narrow field of view is handled by the mask (bins without observation do not count). The best candidate is then refined
on finer grids around it.

Frame: AOI metres, x east, y north; DEM grid with row 0 = north edge, column 0 = west edge (see marsnav.terrain).
Azimuths and headings: degrees clockwise from north.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import ArrayLike, NDArray

from marsnav.terrain import horizon_profile

# ---- tunable numbers (ASSUMPTION: not measured, chosen for the demo; the CEO may move them to config/params.yaml) ----
N_AZ_DEFAULT = 180  # azimuth bins of the synthetic profile (2 deg); a parabolic peak interpolation gives sub-bin headings
R_MAX_M_DEFAULT = 20000.0  # ray length for the synthetic horizon (same as F07)
OBSERVER_HEIGHT_M = 1.7  # eye height above the surface
MAX_COARSE_CANDIDATES = 900  # default coarse search grid size
REFINE_FACTOR = 3  # each refinement level uses a (2·factor+1)² grid with step = previous step / factor
REFINE_LEVELS = 2
TOP_K_REFINE = 5  # distinct coarse candidates refined
LIKELIHOOD_TAU = 0.05  # score difference that lowers the normalised likelihood by a factor e
CONF_FLOOR = 0.05  # lower bound of the confidence used to inflate σ (σ = base/√confidence)
VARIANCE_EPS_DEG2 = 1e-6  # profiles flatter than this (deg²) carry no information
LOW_CONFIDENCE = 0.5  # below this the result is flagged LOW_CONFIDENCE
MISFIT_EPS = 1e-3  # noise floor of the misfit 1 − score (≈ noise power / profile variance); keeps the ratio finite
AMBIGUOUS_RATIO = 3.0  # misfit ratio (second / best) below this is flagged AMBIGUOUS


@dataclass
class SkylineResult:
    x: float  # best position, AOI metres (east)
    y: float  # best position, AOI metres (north)
    heading_deg: float  # facing azimuth in [0, 360)
    score: float  # normalised correlation of the best candidate, [-1, 1]
    confidence: float  # [0, 1] = clip(score) · (1 − 1/misfit_ratio); 0 when the profile carries no information
    peak_ratio: float  # best score / best score outside the exclusion radius (inf if the other is <= 0); near 1 for smooth skylines
    misfit_ratio: float  # (1 − second + ε)/(1 − best + ε): how much worse the second-best place fits (>= 1; sharper than peak_ratio)
    cov_xy: NDArray  # 2×2 position covariance [m²] for the EKF (ASSUMPTION: derived from step size and confidence)
    sigma_heading_deg: float
    candidates_xy: NDArray  # (N, 2) coarse candidates, AOI metres
    scores: NDArray  # (N,) best correlation over all headings per coarse candidate (the likelihood map, flat)
    headings_deg: NDArray  # (N,) heading of that best correlation
    likelihood: NDArray  # (N,) exp((score − best)/τ), normalised to sum 1
    grid_shape: tuple[int, int] | None  # (ny, nx) when the candidates form a grid (reshape the arrays above), else None
    flags: list[str] = field(default_factory=list)


def _regularise(obs_elev_deg: ArrayLike, obs_az_deg: ArrayLike, n_az: int) -> tuple[NDArray, NDArray]:
    """Resample the observed profile onto n_az relative-azimuth bins (θ_j = j·360/n_az); returns values and 0/1 mask."""
    e = np.clip(np.asarray(obs_elev_deg, dtype=float), 0.0, None)
    a = np.asarray(obs_az_deg, dtype=float)
    if e.shape != a.shape or e.ndim != 1 or e.size < 2:
        raise ValueError("observed elevations and azimuths must be 1-D arrays of equal length >= 2")
    order = np.argsort(a)
    a, e = a[order], e[order]
    bins = np.arange(n_az) * 360.0 / n_az
    step = float(np.median(np.diff(a)))
    if a[-1] - a[0] >= 360.0 - 1.5 * max(step, 1e-9):  # full circle
        aa = np.mod(a, 360.0)  # np.interp with period needs the abscissae in a single period
        return np.interp(bins, aa, e, period=360.0), np.ones(n_az)
    theta = a[0] + np.mod(bins - a[0], 360.0)
    mask = theta <= a[-1]
    return np.where(mask, np.interp(theta, a, e), 0.0), mask.astype(float)


def _masked_ncc(s: NDArray, o: NDArray, m: NDArray) -> NDArray:
    """Pearson correlation of the observed bins (mask m) with the synthetic profile s shifted by every lag k, via FFT.

    c[k] = Σ_j m_j·o_j·s[(j+k) mod n] etc.; returns ncc[k] for k = 0..n−1 (heading ψ_k = k·360/n).
    """
    n = len(s)
    big_n = float(m.sum())
    if big_n < 3:
        return np.zeros(n)

    def corr(a: NDArray, b: NDArray) -> NDArray:
        return np.fft.irfft(np.fft.rfft(a) * np.conj(np.fft.rfft(b)), n)

    s1 = corr(s, m)
    s2 = corr(s * s, m)
    so = corr(s, m * o)
    o1 = float(np.sum(m * o))
    o2 = float(np.sum(m * o * o))
    cov = so - s1 * o1 / big_n
    var_s = s2 - s1 * s1 / big_n
    var_o = o2 - o1 * o1 / big_n
    ok = (var_s > VARIANCE_EPS_DEG2 * big_n) & (var_o > VARIANCE_EPS_DEG2 * big_n)
    out = np.zeros(n)
    out[ok] = cov[ok] / np.sqrt(var_s[ok] * var_o)
    return np.clip(out, -1.0, 1.0)


def _parabolic_peak(y: NDArray, k: int) -> float:
    """Sub-bin offset (in bins, within ±0.5) of a circular peak at index k."""
    n = len(y)
    ym, y0, yp = y[(k - 1) % n], y[k], y[(k + 1) % n]
    d = ym - 2 * y0 + yp
    if d >= -1e-12:
        return 0.0
    return float(np.clip(0.5 * (ym - yp) / d, -0.5, 0.5))


def _evaluate(dem: NDArray, cell: float, origin_xy: tuple[float, float], xy: NDArray, o: NDArray, m: NDArray, n_az: int,
              r_max: float, obs_h: float) -> tuple[NDArray, NDArray, NDArray]:
    """Best score, heading [deg] and the maximum variance of the synthetic profile for each candidate (x, y)."""
    n = len(xy)
    score, head, var = np.zeros(n), np.zeros(n), np.zeros(n)
    for i, (x, y) in enumerate(xy):
        col = (x - origin_xy[0]) / cell
        row = (origin_xy[1] - y) / cell
        s = np.degrees(horizon_profile(dem, cell, row, col, n_az, r_max, obs_h))
        var[i] = float(np.var(s))
        ncc = _masked_ncc(s, o, m)
        k = int(np.argmax(ncc))
        score[i] = ncc[k]
        head[i] = ((k + _parabolic_peak(ncc, k)) * 360.0 / n_az) % 360.0
    return score, head, var


def skyline_match(dem: NDArray, cell: float, obs_elev_deg: ArrayLike, obs_az_deg: ArrayLike, *,
                  candidates_xy: ArrayLike | None = None, origin_xy: tuple[float, float] = (0.0, 0.0),
                  coarse_step_m: float | None = None, n_az: int = N_AZ_DEFAULT, r_max: float = R_MAX_M_DEFAULT,
                  observer_height: float = OBSERVER_HEIGHT_M, refine: bool = True, exclusion_m: float | None = None) -> SkylineResult:
    """F43 — position and heading from the observed horizon line.

    dem, cell: AOI grid (row 0 north) and its cell size [m]; origin_xy = AOI (x, y) of the centre of cell (0, 0).
    obs_elev_deg / obs_az_deg: horizon elevation [deg] at azimuths RELATIVE to the viewing direction [deg, clockwise]; a
    360° panorama or a narrow field of view (e.g. −30…+30). candidates_xy: (N, 2) AOI positions to test; default is a
    regular grid over the whole DEM with at most ~MAX_COARSE_CANDIDATES points.
    The synthetic and the observed profile are both clipped at 0 (an open horizon carries no shape information), so a flat
    DEM or a featureless observation yields score 0, confidence 0 and the flag FLAT_HORIZON instead of a false certainty.
    """
    dem = np.asarray(dem, dtype=float)
    H, W = dem.shape
    o, m = _regularise(obs_elev_deg, obs_az_deg, n_az)
    flags: list[str] = []
    grid_shape: tuple[int, int] | None = None
    if candidates_xy is None:
        stride = max(1, int(np.ceil(np.sqrt(H * W / MAX_COARSE_CANDIDATES))))
        xs = origin_xy[0] + np.arange(0, W, stride) * cell
        ys = origin_xy[1] - np.arange(0, H, stride) * cell
        gx, gy = np.meshgrid(xs, ys)
        cand = np.column_stack([gx.ravel(), gy.ravel()])
        grid_shape = (len(ys), len(xs))
        step = stride * cell if coarse_step_m is None else float(coarse_step_m)
    else:
        cand = np.atleast_2d(np.asarray(candidates_xy, dtype=float))
        step = 4.0 * cell if coarse_step_m is None else float(coarse_step_m)

    score, head, var = _evaluate(dem, cell, origin_xy, cand, o, m, n_az, r_max, observer_height)
    # seeds: the best coarse candidates that are at least 1.5 coarse steps apart. Refining only the single best misses
    # narrow correlation peaks next to terrain features, because the coarse grid can straddle them.
    seeds: list[int] = []
    for i in np.argsort(-score):
        if len(seeds) >= (TOP_K_REFINE if refine else 1):
            break
        if all(np.hypot(*(cand[i] - cand[j])) > 1.5 * step for j in seeds):
            seeds.append(int(i))

    refined: list[tuple[float, float, float, float]] = []  # (x, y, score, heading) after refinement, one per seed
    cur_step = step
    for i in seeds:
        sx, sy = cand[i]
        sc, hd = float(score[i]), float(head[i])
        cur_step = step
        if refine and sc > 0:
            for _ in range(REFINE_LEVELS):
                new_step = cur_step / REFINE_FACTOR
                off = np.arange(-REFINE_FACTOR, REFINE_FACTOR + 1) * new_step
                ox, oy = np.meshgrid(off, off)
                local = np.column_stack([sx + ox.ravel(), sy + oy.ravel()])
                s2, h2, _ = _evaluate(dem, cell, origin_xy, local, o, m, n_az, r_max, observer_height)
                j = int(np.argmax(s2))
                if s2[j] >= sc:
                    sx, sy = local[j]
                    sc, hd = float(s2[j]), float(h2[j])
                cur_step = new_step
        refined.append((float(sx), float(sy), sc, hd))
    bx, by, best_score, best_head = max(refined, key=lambda t: t[2])

    # second best: any coarse candidate or refined seed outside the exclusion radius of the final best position
    excl = 2.0 * step if exclusion_m is None else float(exclusion_m)
    far = np.hypot(cand[:, 0] - bx, cand[:, 1] - by) > excl
    others = [float(np.max(score[far]))] if np.any(far) else []
    others += [t[2] for t in refined if np.hypot(t[0] - bx, t[1] - by) > excl]
    second = max(others) if others else float("nan")

    if best_score <= 0 or float(np.max(var)) < VARIANCE_EPS_DEG2 or float(np.var(o[m > 0])) < VARIANCE_EPS_DEG2:
        flags.append("FLAT_HORIZON")
        confidence, ratio, misfit_ratio = 0.0, float("nan"), float("nan")
    else:
        if np.isnan(second):  # the whole search area lies inside the exclusion radius: nothing to compare with
            ratio, misfit_ratio = float("inf"), float("inf")
            ratio_term = 1.0
        else:
            ratio = best_score / second if second > 0 else float("inf")
            misfit_ratio = max((1.0 - second + MISFIT_EPS) / (1.0 - best_score + MISFIT_EPS), 1.0)
            ratio_term = 1.0 - 1.0 / misfit_ratio
        confidence = float(np.clip(best_score, 0.0, 1.0) * ratio_term)
        if misfit_ratio < AMBIGUOUS_RATIO:
            flags.append("AMBIGUOUS")
    if confidence < LOW_CONFIDENCE:
        flags.append("LOW_CONFIDENCE")

    infl = 1.0 / np.sqrt(max(confidence, CONF_FLOOR))
    sigma_xy = max(cur_step, cell) * infl
    sigma_h = max(360.0 / n_az, 1.0) * infl
    lik = np.exp((score - float(np.max(score))) / LIKELIHOOD_TAU)
    lik = lik / lik.sum()
    return SkylineResult(float(bx), float(by), float(best_head % 360.0), best_score, confidence, float(ratio), float(misfit_ratio),
                         np.diag([sigma_xy**2, sigma_xy**2]), float(sigma_h), cand, score, head, lik, grid_shape, flags)
