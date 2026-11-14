"""F55 geo-biological interest index: formula, renormalisation over missing inputs, coverage, classes."""

import numpy as np
import pytest

from marsnav.indices import bio_potential_index, bio_weights


def field(v, shape=(5, 5)):
    return np.full(shape, v, dtype=float)


def test_weights_normalised():
    w = bio_weights()
    assert sum(w.values()) == pytest.approx(1.0) and set(w) == {"water", "minerals", "geology", "sediment"}


def test_all_inputs_equal_the_formula():
    w = bio_weights()
    a, b, c, d = 0.9, 0.5, 0.2, 0.7
    r = bio_potential_index(field(a), field(b), field(c), field(d))
    expected = 100.0 * (w["water"] * a + w["minerals"] * b + w["geology"] * c + w["sediment"] * d)
    assert np.allclose(r.B, expected) and np.allclose(r.coverage, 1.0)
    assert not r.partial and r.inputs_used == ["water", "minerals", "geology", "sediment"]


def test_one_missing_input_is_renormalised_not_invented():
    w = bio_weights()
    r = bio_potential_index(field(0.8), field(0.4), None, field(0.6))
    expected = 100.0 * (w["water"] * 0.8 + w["minerals"] * 0.4 + w["sediment"] * 0.6) / (w["water"] + w["minerals"] + w["sediment"])
    assert np.allclose(r.B, expected)
    assert np.allclose(r.coverage, 1.0 - w["geology"]) and r.partial and "geology" not in r.inputs_used


def test_constant_inputs_give_the_same_value_whatever_is_missing():
    full = bio_potential_index(field(0.6), field(0.6), field(0.6), field(0.6))
    partial = bio_potential_index(field(0.6), None, field(0.6), None)
    assert np.allclose(full.B, 60.0) and np.allclose(partial.B, 60.0)


def test_no_data_at_all_is_nan_with_zero_coverage():
    nan = field(np.nan)
    r = bio_potential_index(nan, nan, nan, nan)
    assert np.isnan(r.B).all() and np.all(r.coverage == 0.0) and r.inputs_used == [] and np.all(r.classes == -1)


def test_per_cell_masks_and_nan_drop_inputs_cell_by_cell():
    water = field(1.0)
    minerals = field(0.0)
    mask = np.ones((5, 5), dtype=bool)
    mask[0, :] = False  # first row: minerals unavailable
    r = bio_potential_index(water, minerals, None, None, masks={"minerals": mask})
    w = bio_weights()
    assert np.allclose(r.B[0], 100.0)  # only water left
    assert np.allclose(r.B[1], 100.0 * w["water"] / (w["water"] + w["minerals"]))
    assert r.coverage[0, 0] == pytest.approx(w["water"]) and r.coverage[1, 0] == pytest.approx(w["water"] + w["minerals"])


def test_classes_follow_70_and_40_and_need_enough_coverage():
    r = bio_potential_index(np.array([[1.0, 0.5, 0.1, 1.0]]), np.array([[1.0, 0.5, 0.1, np.nan]]),
                            np.array([[1.0, 0.5, 0.1, np.nan]]), np.array([[1.0, 0.5, 0.1, np.nan]]))
    assert r.classes[0, :3].tolist() == [2, 1, 0]
    assert r.classes[0, 3] == -1  # only water (coverage 0.35 < 0.5): not classified


def test_inputs_are_clipped_to_unit_range_and_shape_is_checked():
    r = bio_potential_index(field(7.0), field(-3.0), None, None)
    w = bio_weights()
    assert np.allclose(r.B, 100.0 * w["water"] / (w["water"] + w["minerals"]))
    with pytest.raises(ValueError):
        bio_potential_index(field(1.0), field(1.0, (3, 3)), None, None)
    with pytest.raises(ValueError):
        bio_potential_index(None, None, None, None)


def test_disclaimer_says_proxy_not_evidence_of_life():
    assert "not evidence of life" in bio_potential_index(field(0.5), None, None, None).disclaimer
