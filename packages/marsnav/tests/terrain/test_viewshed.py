"""F10 viewshed tests: analytic cases (flat plane, pillar wedge, thin ridge, re-emergence) and consistency with F07."""

import numpy as np
import pytest
from scipy import ndimage

from marsnav.terrain import horizon_profile, viewshed, viewshed_multires, xy_to_rowcol

CELL = 10.0


def at(v, row, col):
    return bool(v.visible[row, col])


def test_flat_plane_is_visible_up_to_the_curvature_horizon():
    cell, n = 20.0, 401
    c = n // 2
    v = viewshed(np.zeros((n, n)), cell, c, c, observer_height=2.0, max_radius_m=4000.0)
    rr, cc = np.mgrid[0:n, 0:n]
    d = np.hypot(rr - c, cc - c) * cell
    horizon = float(np.sqrt(2 * 3396190.0 * 2.0))  # ≈ 3686 m for an eye 2 m above ground
    assert v.visible[d < horizon - 150].all()
    assert not v.visible[(d > horizon + 150) & (d <= 4000)].any()
    assert v.shadow[(d > horizon + 150) & (d <= 4000)].all()
    assert not v.no_data.any() and v.visible[c, c]


def test_target_height_extends_the_flat_plane_range():
    cell, n = 40.0, 601
    c = n // 2
    v = viewshed(np.zeros((n, n)), cell, c, c, observer_height=2.0, target_height=6.0, max_radius_m=11900.0)
    rr, cc = np.mgrid[0:n, 0:n]
    d = np.hypot(rr - c, cc - c) * cell
    limit = float(np.sqrt(2 * 3396190.0 * 2.0) + np.sqrt(2 * 3396190.0 * 6.0))  # eye horizon + mast horizon ≈ 10 070 m
    assert v.visible[v.in_range & (d < limit - 200)].all()
    assert not v.visible[(d > limit + 200) & v.in_range].any()
    assert ((d > limit + 200) & v.in_range).sum() > 1000


def test_pillar_shadow_wedge_has_the_analytic_length():
    # pillar (1 m) 100 m east of an observer whose eye is 2 m above flat ground: the ground is hidden from
    # d1 to d1·h0/(h0 − H) = 200 m along the axis
    n, c = 101, 50
    dem = np.zeros((n, n))
    dem[c, c + 10] = 1.0
    v = viewshed(dem, CELL, c, c, observer_height=2.0, max_radius_m=450.0)
    axis = v.visible[c, c + 11:c + 40]
    assert not axis[:8].any()  # 110..180 m: in the shadow
    assert axis[10:].all()  # >= 210 m: visible again
    # the wedge is narrow: three rows away at the pillar's range the ground is visible
    assert at(v, c + 3, c + 12) and at(v, c - 3, c + 12)
    assert v.shadow[c, c + 12]


def test_tall_pillar_hides_everything_behind_it_within_its_angular_width():
    n, c = 101, 50
    dem = np.zeros((n, n))
    dem[c, c + 10] = 30.0
    v = viewshed(dem, CELL, c, c, observer_height=2.0, max_radius_m=450.0)
    assert not v.visible[c, c + 11:c + 45].any()
    assert at(v, c + 5, c + 30) and at(v, c - 5, c + 30)


def test_thin_one_cell_ridge_is_detected_in_every_direction():
    n, c = 121, 60
    h0 = 2.0
    for axis_rot in range(4):
        dem = np.zeros((n, n))
        dem[:, c + 12] = 3.5  # N-S ridge, one cell wide, 120 m east, 1.5 m above the eye
        dem = np.rot90(dem, axis_rot).copy()
        v = viewshed(dem, CELL, c, c, observer_height=h0, max_radius_m=500.0)
        # look along the rotated axis: the ridge sits at (c + 12) in the rotated frame
        probes = {0: (c, c + 20), 1: (c - 20, c), 2: (c, c - 20), 3: (c + 20, c)}  # beyond the ridge
        r, k = probes[axis_rot]
        assert not v.visible[r, k], f"ridge missed for rotation {axis_rot}"
    # a diagonal ridge line (one cell thick) is also opaque
    dem = np.zeros((n, n))
    for i in range(n):
        j = c + 15 - (i - c)  # anti-diagonal passing 15 cells east of the observer row
        if 0 <= j < n:
            dem[i, j] = 3.5
    v = viewshed(dem, CELL, c, c, observer_height=h0, max_radius_m=500.0)
    assert not v.visible[c, c + 25]


def test_visibility_returns_behind_a_shadow_without_being_swallowed():
    n, c = 61, 30
    dem = np.zeros((n, n))
    dem[c, c + 10] = 50.0  # spike
    dem[c, c + 12] = 200.0  # hill that re-emerges above the line of sight
    v = viewshed(dem, CELL, c, c, observer_height=2.0, max_radius_m=290.0)
    assert not at(v, c, c + 11)  # between them: shadow
    assert at(v, c, c + 12)  # hill top: visible (the audited code would have glued 11 and 13 around it)
    assert not at(v, c, c + 13)  # behind the hill: shadow again
    assert v.shadow[c, c + 11] and v.shadow[c, c + 13]


def test_modes_are_ordered_and_every_in_range_cell_is_sampled():
    rng = np.random.default_rng(3)
    dem = ndimage.gaussian_filter(rng.normal(size=(201, 201)), 4.0) * 60.0
    cons = viewshed(dem, CELL, 100, 100, 2.0, 0.0, 900.0, "conservative")
    cent = viewshed(dem, CELL, 100, 100, 2.0, 0.0, 900.0)
    opti = viewshed(dem, CELL, 100, 100, 2.0, 0.0, 900.0, "optimistic")
    assert cent.mode == "center"
    assert (cons.visible & ~cent.visible).sum() == 0 and (cent.visible & ~opti.visible).sum() == 0
    assert cons.visible.sum() < opti.visible.sum()
    for v in (cons, cent, opti):
        assert v.no_data.sum() == 0  # ray density leaves no unsampled cell
        assert v.in_range.sum() == (v.visible | v.shadow).sum()
        assert v.visible[100, 100] and not v.shadow[100, 100]  # the observer is never in shadow


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_consistent_with_the_f07_horizon_profile_at_the_observer(seed):
    # F07 gives the horizon angle h(φ) = max over the whole ray. Two implications must hold for F10:
    #  (a) a cell whose elevation angle exceeds h(φ) is visible;  (b) a hidden cell has an angle <= h(φ).
    rng = np.random.default_rng(seed)
    n = 241
    dem = ndimage.gaussian_filter(rng.normal(size=(n, n)), 8.0) * 400.0
    r0, c0 = 120.0, 120.0
    h_obs, radius = 1.7, 1100.0
    v = viewshed(dem, CELL, r0, c0, observer_height=h_obs, max_radius_m=radius)
    n_az = 720
    hor = horizon_profile(dem, CELL, r0, c0, n_az=n_az, r_max=radius, observer_height=h_obs)
    rr, cc = np.mgrid[0:n, 0:n]
    dy, dx = (r0 - rr) * CELL, (cc - c0) * CELL  # north, east
    dist = np.hypot(dx, dy)
    ok = v.in_range & (dist > 3 * CELL)
    z0 = float(ndimage.map_coordinates(dem, [[r0], [c0]], order=1)[0]) + h_obs
    ang = np.arctan2(dem - z0 - dist**2 / (2 * 3396190.0), dist)
    az = np.degrees(np.arctan2(dx, dy)) % 360.0
    h_cell = hor[np.round(az * n_az / 360.0).astype(int) % n_az]
    tol = 0.01  # rad: azimuth quantisation of the 720-bin profile on a smooth field
    violate_a = ok & (ang > h_cell + tol) & ~v.visible
    violate_b = ok & v.shadow & (ang > h_cell + tol)
    assert violate_a.sum() == 0 and violate_b.sum() == 0
    assert 0.05 < v.visible_fraction < 0.999  # the test field really has both visible and hidden cells


def test_nan_cells_are_no_data_not_shadow():
    dem = np.zeros((81, 81))
    dem[40, 50:53] = np.nan
    v = viewshed(dem, CELL, 40, 40, 2.0, 0.0, 380.0)
    assert v.no_data[40, 51]
    assert not v.shadow[40, 51] and not v.visible[40, 51]


def test_observer_outside_or_on_nodata_is_rejected():
    dem = np.zeros((20, 20))
    with pytest.raises(ValueError):
        viewshed(dem, CELL, 25, 5)
    dem[5, 5] = np.nan
    with pytest.raises(ValueError):
        viewshed(dem, CELL, 5, 5)
    with pytest.raises(ValueError):
        viewshed(np.zeros((20, 20)), CELL, 5, 5, mode="bogus")


def test_xy_to_rowcol_roundtrip_on_the_grid_convention():
    shape = (40, 50)
    row, col = xy_to_rowcol(120.0, 30.0, shape, CELL)
    assert (row, col) == (39 - 3.0, 12.0)


def test_multires_agrees_with_full_resolution_and_never_leaks_through_a_far_ridge():
    rng = np.random.default_rng(11)
    n = 401
    dem = ndimage.gaussian_filter(rng.normal(size=(n, n)), 10.0) * 300.0
    c = n // 2
    fine = viewshed(dem, CELL, c, c, 2.0, 0.0, 1800.0)
    multi = viewshed_multires(dem, CELL, c, c, 2.0, 0.0, max_radius_m=1800.0, near_radius_m=500.0, factor=4)
    known = fine.in_range
    assert (fine.visible == multi.visible)[known].mean() > 0.9
    # conservative far field: a one-cell wall far away still blocks what is behind it
    wall = np.zeros((n, n))
    wall[:, c + 120] = 40.0  # 1200 m east, 38 m above the eye
    m = viewshed_multires(wall, CELL, c, c, 2.0, 0.0, max_radius_m=1800.0, near_radius_m=500.0, factor=4)
    assert not m.visible[c, c + 140:c + 175].any()
    assert m.visible[c, c + 60]
