from datetime import datetime, timedelta, timezone

from adscope_api.observations import record
from adscope_api.schemas import ObservationIn
from adscope_api.signals import signals_for

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def obs(**kw):
    base = dict(site="lc", site_id="1", price=9900, brand="PEUGEOT", model="308",
                version="1.2", year=2018, mileage=62686)
    base.update(kw)
    return ObservationIn(**base)


def test_age_comes_from_the_site_on_first_sight(session):
    listing = record(session, obs(published_days_ago=60), source="user", now=NOW)
    session.commit()
    out = signals_for(session, listing, now=NOW)
    assert out["real_age_days"] == 60
    assert out["republished"] is False
    assert out["tracked_days"] == 0


def test_stable_price_reports_days_since_last_change(session):
    listing = record(session, obs(), source="user", now=NOW)
    record(session, obs(), source="user", now=NOW + timedelta(days=12))
    session.commit()
    out = signals_for(session, listing, now=NOW + timedelta(days=12))
    assert out["price"] == 9900
    assert out["stable_days"] == 12
    assert out["price_delta"] is None


def test_price_drop_is_reported_with_its_window(session):
    listing = record(session, obs(price=10900), source="user", now=NOW)
    record(session, obs(price=9900), source="user", now=NOW + timedelta(days=12))
    session.commit()
    out = signals_for(session, listing, now=NOW + timedelta(days=12))
    assert out["price"] == 9900
    assert out["price_delta"] == -1000
    assert out["price_delta_days"] == 12
    assert [p["price"] for p in out["price_history"]] == [10900, 9900]


def test_republication_detected_beyond_the_threshold(session):
    listing = record(session, obs(published_days_ago=60), source="crawler", now=NOW)
    later = NOW + timedelta(days=14)
    record(session, obs(published_days_ago=2), source="crawler", now=later)
    session.commit()
    out = signals_for(session, listing, now=later)
    assert out["republished"] is True
    assert out["republished_at"] == (later - timedelta(days=2)).date()
    assert out["real_age_days"] == 74


def test_rounding_drift_of_one_day_is_not_a_republication(session):
    listing = record(session, obs(published_days_ago=60), source="crawler", now=NOW)
    later = NOW + timedelta(days=2)
    record(session, obs(published_days_ago=61), source="crawler", now=later)
    session.commit()
    out = signals_for(session, listing, now=later)
    assert out["republished"] is False


def test_listing_without_price_or_age_yields_empty_signals(session):
    listing = record(session, ObservationIn(site="lc", site_id="2"), source="user", now=NOW)
    session.commit()
    out = signals_for(session, listing, now=NOW)
    assert out["price"] is None
    assert out["real_age_days"] is None
    assert out["price_history"] == []
