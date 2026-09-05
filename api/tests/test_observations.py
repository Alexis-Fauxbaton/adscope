from datetime import datetime, timedelta, timezone

from adscope_api.models import Listing
from adscope_api.observations import record
from adscope_api.schemas import ObservationIn

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def obs(**kw):
    base = dict(site="lc", site_id="87103336930", price=9900, brand="PEUGEOT",
                model="308 II phase 2", version="1.2 PURETECH 110 STYLE",
                year=2018, mileage=62686, postal_code="75015")
    base.update(kw)
    return ObservationIn(**base)


def test_first_observation_creates_listing_and_one_price_point(session):
    listing = record(session, obs(), source="user", now=NOW)
    session.commit()
    assert listing.observations == 1
    assert listing.fingerprint == "54b22edbd39c"
    assert [p.price for p in listing.prices] == [9900]


def test_same_price_twice_does_not_add_a_point(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, obs(), source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert listing.observations == 2
    assert [p.price for p in listing.prices] == [9900]


def test_changed_price_adds_a_point(session):
    record(session, obs(price=10900), source="user", now=NOW)
    listing = record(session, obs(price=9900), source="user", now=NOW + timedelta(days=12))
    session.commit()
    assert [p.price for p in listing.prices] == [10900, 9900]


def test_published_days_ago_sets_both_bounds(session):
    listing = record(session, obs(published_days_ago=60), source="user", now=NOW)
    session.commit()
    assert listing.site_published_first == (NOW - timedelta(days=60)).date()
    assert listing.site_published_last == listing.site_published_first


def test_published_first_never_moves_forward(session):
    record(session, obs(published_days_ago=60), source="user", now=NOW)
    listing = record(session, obs(published_days_ago=2), source="user",
                     now=NOW + timedelta(days=1))
    session.commit()
    assert listing.site_published_first == (NOW - timedelta(days=60)).date()
    assert listing.site_published_last == (NOW + timedelta(days=1) - timedelta(days=2)).date()


def test_missing_fields_do_not_erase_known_values(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, ObservationIn(site="lc", site_id="87103336930", price=9900),
                     source="crawler", now=NOW + timedelta(days=1))
    session.commit()
    assert listing.brand == "PEUGEOT"
    assert listing.mileage == 62686


def test_observation_clears_disappearance(session):
    listing = record(session, obs(), source="crawler", now=NOW)
    listing.disappeared_at = NOW
    session.commit()
    record(session, obs(), source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert session.query(Listing).one().disappeared_at is None


def test_observation_without_vehicle_details_leaves_fingerprint_unset(session):
    listing = record(session, ObservationIn(site="lc", site_id="1", price=9900),
                     source="user", now=NOW)
    session.commit()
    assert listing.fingerprint is None


def test_vehicle_details_seen_later_set_the_fingerprint(session):
    record(session, ObservationIn(site="lc", site_id="1"), source="user", now=NOW)
    listing = record(session, obs(), source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert listing.fingerprint == "54b22edbd39c"
