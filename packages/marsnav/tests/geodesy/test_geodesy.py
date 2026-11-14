import numpy as np
import pytest

from marsnav.config import param, projection
from marsnav.geodesy import aoi_to_geo, bearing_xy, curvature_drop, geo_to_aoi, haversine, initial_bearing

R = param("constants.R_sphere")


def test_f01_quarter_meridian():
    assert haversine(0, 0, 90, 0) == pytest.approx(np.pi * R / 2, rel=1e-12)


def test_f01_symmetry_and_zero():
    assert haversine(-4.6, 137.4, -4.7, 137.5) == pytest.approx(haversine(-4.7, 137.5, -4.6, 137.4))
    assert haversine(10, 20, 10, 20) == pytest.approx(0.0, abs=1e-9)


@pytest.mark.parametrize("lat2,lon2,expected", [(0, 1, 90.0), (1, 0, 0.0), (0, -1, 270.0), (-1, 0, 180.0)])
def test_f02_cardinal_bearings(lat2, lon2, expected):
    assert initial_bearing(0, 0, lat2, lon2) == pytest.approx(expected, abs=1e-9)


def test_f03_center_maps_to_origin_and_roundtrip():
    c = projection()["aoi"]["center"]
    x, y = geo_to_aoi(c["lat"], c["lon"])
    assert abs(float(x)) < 1e-6 and abs(float(y)) < 1e-6
    lats = np.array([-4.89, -4.72, -4.55])
    lons = np.array([137.27, 137.40, 137.53])
    x, y = geo_to_aoi(lats, lons)
    lat2, lon2 = aoi_to_geo(x, y)
    assert np.allclose(lat2, lats, atol=1e-9) and np.allclose(lon2, lons, atol=1e-9)


def test_f03_axes_point_east_and_north():
    c = projection()["aoi"]["center"]
    x_e, y_e = geo_to_aoi(c["lat"], c["lon"] + 0.01)
    x_n, y_n = geo_to_aoi(c["lat"] + 0.01, c["lon"])
    assert float(x_e) > 0 and abs(float(y_e)) < 1.0
    assert float(y_n) > 0 and abs(float(x_n)) < 1.0
    # 0.01 deg of latitude on the sphere
    assert float(y_n) == pytest.approx(np.radians(0.01) * R, rel=1e-4)


def test_f04_curvature_drop():
    assert curvature_drop(10_000.0) == pytest.approx(1e8 / (2 * R))
    assert curvature_drop(10_000.0) == pytest.approx(14.72, abs=0.01)


def test_bearing_xy():
    assert bearing_xy(0, 0, 1, 0) == pytest.approx(90.0)
    assert bearing_xy(0, 0, 0, -1) == pytest.approx(180.0)
