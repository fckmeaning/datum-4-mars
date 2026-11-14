"""F43 skyline matching: known pose recovery, narrow field of view, flat terrain, candidate lists, FFT correlation."""

from functools import lru_cache

import numpy as np
import pytest

from marsnav.localize import skyline_match
from marsnav.localize.skyline import _masked_ncc
from marsnav.terrain import horizon_profile

CELL = 20.0
N = 200
ORIGIN = (0.0, (N - 1) * CELL)  # AOI (x, y) of the centre of cell (0, 0); x east, y north, row 0 = north edge


@lru_cache(maxsize=4)
def terrain(seed: int, bowl: float, n_bumps: int, hmax: float) -> np.ndarray:
    """Synthetic basin ringed by hills: the horizon is above 0 everywhere and changes with position."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:N, 0:N] * CELL
    c = N * CELL / 2
    z = bowl * ((xx - c) ** 2 + (yy - c) ** 2)
    for _ in range(n_bumps):
        bx, by = rng.uniform(0, N * CELL, 2)
        h, w = rng.uniform(30, hmax), rng.uniform(100, 350)
        z += h * np.exp(-((xx - bx) ** 2 + (yy - by) ** 2) / (2 * w * w))
    return z


def observe(dem, pose, rel_az, noise_deg=0.1, seed=7):
    """Horizon seen from pose = (x, y, heading_deg) at azimuths rel_az relative to the viewing direction, plus noise."""
    x, y, heading = pose
    s = np.degrees(horizon_profile(dem, CELL, (ORIGIN[1] - y) / CELL, (x - ORIGIN[0]) / CELL, 360))
    rng = np.random.default_rng(seed)
    return np.interp((rel_az + heading) % 360.0, np.arange(360.0), s, period=360.0) + rng.normal(0.0, noise_deg, len(rel_az))


def angle_err(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


POSES = [(1900.0, 2150.0, 123.4), (2500.0, 1500.0, 301.0), (1200.0, 2800.0, 17.5)]


@pytest.mark.parametrize("pose", POSES)
def test_f43_panorama_recovers_pose(pose):
    """MATH.md key test: heading within 1°, position within 2 cells, with 0.1° noise on the observed horizon."""
    dem = terrain(3, 1.5e-5, 60, 200.0)
    rel = np.arange(360.0)
    r = skyline_match(dem, CELL, observe(dem, pose, rel), rel, origin_xy=ORIGIN)
    assert np.hypot(r.x - pose[0], r.y - pose[1]) <= 2 * CELL
    assert abs(angle_err(r.heading_deg, pose[2])) <= 1.0
    assert r.score > 0.99 and r.confidence >= 0.5 and "FLAT_HORIZON" not in r.flags and "AMBIGUOUS" not in r.flags


def test_f43_wide_field_of_view_recovers_pose():
    dem = terrain(3, 1.5e-5, 60, 200.0)
    pose = POSES[1]
    rel = np.arange(-120.0, 120.5, 1.0)  # 240° field of view
    r = skyline_match(dem, CELL, observe(dem, pose, rel), rel, origin_xy=ORIGIN)
    assert np.hypot(r.x - pose[0], r.y - pose[1]) <= 2 * CELL
    assert abs(angle_err(r.heading_deg, pose[2])) <= 1.0


@pytest.mark.parametrize("terrain_args", [(3, 4e-5, 40, 120.0), (3, 1.5e-5, 60, 200.0), (5, 1e-5, 25, 250.0)])
def test_f43_narrow_view_is_never_confident_and_wrong(terrain_args):
    """A 120° view of a smooth skyline can be genuinely ambiguous. Then the result must say so (AMBIGUOUS / low confidence);
    whenever it claims confidence the pose must be right."""
    dem = terrain(*terrain_args)
    rel = np.arange(-60.0, 60.5, 1.0)
    for pose in POSES:
        r = skyline_match(dem, CELL, observe(dem, pose, rel), rel, origin_xy=ORIGIN)
        if r.confidence >= 0.5 and "AMBIGUOUS" not in r.flags:
            assert np.hypot(r.x - pose[0], r.y - pose[1]) <= 3 * CELL, (terrain_args, pose, r.flags)
            assert abs(angle_err(r.heading_deg, pose[2])) <= 2.0, (terrain_args, pose, r.flags)


def test_f43_flat_dem_reports_no_confidence():
    flat = np.zeros((100, 100))
    rel = np.arange(360.0)
    r = skyline_match(flat, CELL, np.zeros(360), rel, origin_xy=(0.0, 99 * CELL))
    assert r.confidence == 0.0 and "FLAT_HORIZON" in r.flags and "LOW_CONFIDENCE" in r.flags
    # a shaped observation cannot be explained by a flat DEM either: still no false certainty
    shaped = 5.0 * np.abs(np.sin(np.radians(3.0 * rel)))
    r2 = skyline_match(flat, CELL, shaped, rel, origin_xy=(0.0, 99 * CELL))
    assert r2.confidence == 0.0 and "FLAT_HORIZON" in r2.flags


def test_f43_featureless_observation_reports_no_confidence():
    dem = terrain(3, 1.5e-5, 60, 200.0)
    rel = np.arange(360.0)
    r = skyline_match(dem, CELL, np.full(360, 5.0), rel, origin_xy=ORIGIN)
    assert r.confidence == 0.0 and "FLAT_HORIZON" in r.flags


def test_f43_candidate_list_and_outputs():
    dem = terrain(3, 1.5e-5, 60, 200.0)
    pose = POSES[0]
    rel = np.arange(360.0)
    obs = observe(dem, pose, rel)
    cands = np.array([[pose[0] + 60.0, pose[1] - 50.0], [800.0, 800.0], [3200.0, 3000.0], [1000.0, 3300.0]])
    r = skyline_match(dem, CELL, obs, rel, candidates_xy=cands, origin_xy=ORIGIN, coarse_step_m=100.0)
    assert np.hypot(r.x - pose[0], r.y - pose[1]) <= 2 * CELL  # refined from a seed 78 m away
    assert r.grid_shape is None and r.scores.shape == (4,) and r.candidates_xy.shape == (4, 2)
    assert r.likelihood.sum() == pytest.approx(1.0) and np.argmax(r.likelihood) == 0
    assert r.cov_xy.shape == (2, 2) and r.cov_xy[0, 0] > 0 and r.sigma_heading_deg > 0


def test_f43_grid_outputs_reshape():
    dem = terrain(3, 1.5e-5, 60, 200.0)
    rel = np.arange(360.0)
    r = skyline_match(dem, CELL, observe(dem, POSES[0], rel), rel, origin_xy=ORIGIN, refine=False)
    assert r.grid_shape is not None
    ny, nx = r.grid_shape
    assert r.scores.size == ny * nx and r.scores.reshape(ny, nx).shape == (ny, nx)
    assert np.all(np.abs(r.scores) <= 1.0)


def test_f43_masked_fft_correlation_matches_direct_computation():
    rng = np.random.default_rng(1)
    n = 90
    s = rng.normal(size=n)
    m = np.zeros(n)
    m[10:50] = 1.0
    shift = 17
    o = np.where(m > 0, np.roll(s, -shift), 0.0)  # observed bin j sees synthetic bin j + shift
    ncc = _masked_ncc(s, o, m)
    assert int(np.argmax(ncc)) == shift and ncc[shift] == pytest.approx(1.0, abs=1e-9)
    direct = np.array([np.corrcoef(np.roll(s, -k)[m > 0], o[m > 0])[0, 1] for k in range(n)])
    assert np.allclose(ncc, direct, atol=1e-9)
