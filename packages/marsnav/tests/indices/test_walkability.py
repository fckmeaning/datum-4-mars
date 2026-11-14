"""F54 walkability index: monotone sub-scores, flat ground, hard constraints, class edges, weights."""

import numpy as np
import pytest

from marsnav.config import param
from marsnav.indices import (
    certainty_score,
    classify,
    combine_walkability,
    obstacle_cells,
    obstacle_score,
    roughness_score,
    slope_score,
    thresholds,
    walkability_index,
    weights,
)

CELL = 20.0


def plane(n=60, slope_deg=0.0, cell=CELL):
    cols = np.arange(n) * cell
    z = np.tile(np.tan(np.radians(slope_deg)) * cols, (n, 1))
    return z - 4000.0


def test_weights_are_normalised_and_positive():
    w = weights()
    assert sum(w.values()) == pytest.approx(1.0)
    assert all(v > 0 for v in w.values())
    assert set(w) == {"slope", "roughness", "obstacle_density", "data_uncertainty"}


def test_thresholds_come_from_config():
    assert thresholds() == (70.0, 40.0)


def test_class_edges_at_70_and_40():
    got = classify(np.array([100.0, 70.0, 69.999, 40.0, 39.999, 0.0, np.nan]))
    assert got.tolist() == [2, 2, 1, 1, 0, 0, -1]


@pytest.mark.parametrize("which", [0, 1, 2, 3])
def test_combined_index_is_monotone_in_each_input(which):
    base = [0.5, 0.5, 0.5, 0.5]
    prev = -1.0
    for v in np.linspace(0.0, 1.0, 11):
        args = list(base)
        args[which] = v
        w = float(combine_walkability(*args))
        assert w > prev
        prev = w


def test_combine_extremes():
    assert float(combine_walkability(1, 1, 1, 1)) == pytest.approx(100.0)
    assert float(combine_walkability(0, 0, 0, 0)) == pytest.approx(0.0)


def test_slope_score_is_one_on_flat_decreasing_and_half_at_the_knee():
    s = slope_score(np.array([0.0, 5.0, 10.0, 15.0, 20.0, 30.0]))
    assert s[0] == pytest.approx(1.0) and np.all(np.diff(s) < 0) and 0 <= s.min()
    assert slope_score(float(param("hazard.theta0_deg"))) == pytest.approx(0.5, abs=0.01)


def test_roughness_score_decreases_with_roughness():
    r = roughness_score(np.array([0.0, 0.1, 1.0, 10.0]), CELL)
    assert r[0] == pytest.approx(1.0) and np.all(np.diff(r) < 0)


def test_flat_clean_terrain_is_100_minus_the_uncertainty_term():
    z = plane(60, 0.0)
    res = walkability_index(z, CELL)
    w = res.weights
    u = float(certainty_score(z, CELL)[30, 30])
    expected = 100.0 * (1.0 - w["data_uncertainty"] * (1.0 - u))
    assert np.allclose(res.W, expected, atol=1e-6)
    assert np.all(res.classes == 2) and not res.blocked.any()
    assert np.allclose(res.S, 1.0) and np.allclose(res.D, 1.0)


def test_a_steep_wall_is_red_and_blocked():
    res = walkability_index(plane(60, 32.0), CELL)
    inner = (slice(None), slice(2, -2))  # the Horn operator (F05) pads the grid border with edge values, which halves the border slope
    assert res.blocked[inner].all() and np.all(res.W[inner] == 0.0) and np.all(res.classes[inner] == 0)


def test_a_moderate_slope_is_yellow_not_green():
    res = walkability_index(plane(60, 20.0), CELL)
    inner = (slice(None), slice(2, -2))
    assert not res.blocked.any()
    assert np.all(res.classes[inner] == 1)


def test_steep_smooth_wall_would_score_well_without_the_hard_constraint():
    """Documents why the hard limit exists: the weighted sum alone puts a smooth 32 degree wall above the red threshold."""
    z = plane(60, 32.0)
    res = walkability_index(z, CELL)
    soft = combine_walkability(res.S, res.R, res.D, res.U, res.weights)
    inner = (slice(None), slice(2, -2))
    assert float(np.median(soft[inner])) >= thresholds()[1]
    assert float(np.median(res.W[inner])) == 0.0


def test_step_limit_from_a_finer_dem_blocks_cells():
    z = plane(40, 0.0)
    step = np.zeros_like(z)
    step[10:20, 10:20] = float(param("astronaut.step_max")) * 3.0
    res = walkability_index(z, CELL, step_max_m=step)
    assert res.blocked[12, 12] and res.W[12, 12] == 0.0 and res.classes[12, 12] == 0
    assert not res.blocked[30, 30]


def test_obstacle_density_decreases_with_more_bumps():
    rng = np.random.default_rng(3)
    scores = []
    for n_bumps in (0, 20, 80, 240):
        z = plane(60, 0.0)
        idx = rng.choice(z.size, n_bumps, replace=False)
        z.flat[idx] += 40.0  # 40 m bumps on 20 m cells
        scores.append(float(obstacle_score(z, CELL).mean()))
    assert scores[0] == pytest.approx(1.0)
    assert all(a > b for a, b in zip(scores, scores[1:], strict=False))


def test_a_plane_has_no_obstacle_cells_at_any_slope():
    assert not obstacle_cells(plane(40, 25.0), CELL)[2:-2, 2:-2].any()


def test_certainty_falls_with_coarser_cells_voids_and_simulation():
    z = plane(40, 0.0)
    fine, coarse = certainty_score(z, 10.0).mean(), certainty_score(z, 200.0).mean()
    assert fine > coarse
    sim = certainty_score(z, 20.0, simulated=True).mean()
    assert sim < certainty_score(z, 20.0).mean()
    zv = z.copy()
    zv[15:25, 15:25] = np.nan
    assert certainty_score(zv, 20.0)[20, 20] < certainty_score(z, 20.0)[20, 20]


def test_nan_cells_are_nodata_and_uint8_encoding():
    z = plane(40, 0.0)
    z[5:8, 5:8] = np.nan
    res = walkability_index(z, CELL)
    assert np.isnan(res.W[6, 6]) and res.classes[6, 6] == -1
    u8 = res.to_uint8()
    assert u8[6, 6] == 255 and u8.dtype == np.uint8 and u8[30, 30] <= 100


def test_rough_terrain_scores_lower_than_smooth():
    rng = np.random.default_rng(1)
    smooth = plane(60, 3.0)
    rough = smooth + rng.normal(0, 4.0, smooth.shape)
    assert float(np.median(walkability_index(rough, CELL).W)) < float(np.median(walkability_index(smooth, CELL).W))


def test_no_valid_cells_is_an_error():
    with pytest.raises(ValueError):
        walkability_index(np.full((10, 10), np.nan), CELL)
