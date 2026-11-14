from datetime import UTC, datetime

import numpy as np
import pytest

from marsnav.sun import incidence, irradiance, mars24, shadowed, solar_time, sun_position, tt_minus_utc


def test_tt_minus_utc_table():
    assert tt_minus_utc(datetime(2000, 1, 6, tzinfo=UTC)) == pytest.approx(64.184)
    assert tt_minus_utc(datetime(2026, 11, 14, tzinfo=UTC)) == pytest.approx(69.184)


def test_f11_mars24_reference_epoch():
    """Mars24 worked example, 2000-01-06 00:00:00 UTC (golden values to be re-confirmed by W1 T-102)."""
    mt = mars24("2000-01-06T00:00:00Z")
    assert mt.ls_deg == pytest.approx(277.18758, abs=0.05)
    assert mt.mst_h == pytest.approx(23.99425, abs=0.01)
    assert 1.38 < mt.sun_distance_au < 1.67


@pytest.mark.parametrize("utc", ["2012-08-06T05:17:57Z", "2021-02-18T20:55:00Z", "2026-11-14T12:00:00Z"])
def test_f11_ranges(utc):
    mt = mars24(utc)
    assert 0 <= mt.ls_deg < 360
    assert abs(mt.declination_deg) <= 25.6
    assert abs(mt.eot_deg) < 14.0
    assert 1.38 < mt.sun_distance_au < 1.67


def test_f12_solar_time_shifts_with_longitude():
    mt = mars24("2026-11-14T12:00:00Z")
    l0, t0 = solar_time(0.0, mt)
    l90, t90 = solar_time(90.0, mt)
    assert (l90 - l0) % 24 == pytest.approx(6.0)
    assert (t0 - l0) % 24 == pytest.approx((mt.eot_deg / 15.0) % 24)


def test_f13_noon_sun_is_highest_and_due_north_or_south():
    # scan one sol at a point; at maximum elevation the azimuth must be ~0 or ~180
    t0 = datetime(2026, 11, 14, tzinfo=UTC).timestamp()

    def at(ts: float):
        return sun_position(-4.7, 137.4, datetime.fromtimestamp(ts, UTC))

    coarse = max(range(0, 24 * 62 * 60, 600), key=lambda s: at(t0 + s).elevation_deg)
    fine = max(range(coarse - 600, coarse + 600, 5), key=lambda s: at(t0 + s).elevation_deg)
    best = at(t0 + fine)
    assert best.ltst_h == pytest.approx(12.0, abs=0.2)
    assert min(abs(best.azimuth_deg - 0), abs(best.azimuth_deg - 180), abs(best.azimuth_deg - 360)) < 3.0
    # noon elevation = 90 − |lat − declination|
    assert best.elevation_deg == pytest.approx(90 - abs(-4.7 - best.declination_deg), abs=0.5)


def test_f13_morning_sun_is_in_the_east():
    for minutes in range(0, 24 * 62, 10):
        utc = datetime.fromtimestamp(datetime(2026, 11, 14, tzinfo=UTC).timestamp() + minutes * 60, UTC)
        s = sun_position(-4.7, 137.4, utc)
        if 8.5 < s.ltst_h < 9.5:
            assert 0 < s.azimuth_deg < 180 and s.elevation_deg > 0
            return
    pytest.fail("no morning sample found")


def test_f14_slope_facing_sun():
    th, e = np.radians(20.0), 35.0
    assert incidence(th, np.radians(100.0), e, 100.0) == pytest.approx(np.sin(np.radians(e + 20.0)))
    assert incidence(0.0, 0.0, e, 77.0) == pytest.approx(np.sin(np.radians(e)))


def test_f15_shadow():
    assert bool(shadowed(np.radians(10.0), 5.0)) is True
    assert bool(shadowed(np.radians(10.0), 15.0)) is False
    assert bool(shadowed(0.0, -1.0)) is True


def test_f16_irradiance_reference():
    from marsnav.config import param

    assert irradiance(1.0, 90.0, 0.0, 1.0) == pytest.approx(param("constants.S0_1au"))
    assert irradiance(1.0, -5.0, 0.5, 1.5) == pytest.approx(0.0)
