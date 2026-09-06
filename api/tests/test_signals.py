from datetime import datetime, timedelta, timezone

from adscope_api.observations import record
from adscope_api.intake import ObservationIn
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
    out = signals_for(listing, now=NOW)
    assert out["real_age_days"] == 60
    assert out["republished"] is False
    assert out["tracked_days"] == 0


def test_stable_price_reports_days_since_last_change(session):
    listing = record(session, obs(), source="user", now=NOW)
    record(session, obs(), source="user", now=NOW + timedelta(days=12))
    session.commit()
    out = signals_for(listing, now=NOW + timedelta(days=12))
    assert out["price"] == 9900
    assert out["stable_days"] == 12
    assert out["price_delta_since_first"] is None


def test_price_drop_is_reported_with_its_window(session):
    listing = record(session, obs(price=10900), source="user", now=NOW)
    record(session, obs(price=9900), source="user", now=NOW + timedelta(days=12))
    session.commit()
    out = signals_for(listing, now=NOW + timedelta(days=12))
    assert out["price"] == 9900
    assert out["price_delta_since_first"] == -1000
    assert out["price_delta_days_since_first"] == 12
    assert [p["price"] for p in out["price_history"]] == [10900, 9900]


def test_republication_detected_beyond_the_threshold(session):
    listing = record(session, obs(published_days_ago=60), source="crawler", now=NOW)
    later = NOW + timedelta(days=14)
    record(session, obs(published_days_ago=2), source="crawler", now=later)
    session.commit()
    out = signals_for(listing, now=later)
    assert out["republished"] is True
    assert out["republished_at"] == (later - timedelta(days=2)).date()
    assert out["real_age_days"] == 74


def test_rounding_drift_of_one_day_is_not_a_republication(session):
    listing = record(session, obs(published_days_ago=60), source="crawler", now=NOW)
    later = NOW + timedelta(days=2)
    record(session, obs(published_days_ago=61), source="crawler", now=later)
    session.commit()
    out = signals_for(listing, now=later)
    assert out["republished"] is False


def test_listing_without_price_or_age_yields_empty_signals(session):
    listing = record(session, ObservationIn(site="lc", site_id="2"), source="user", now=NOW)
    session.commit()
    out = signals_for(listing, now=NOW)
    assert out["price"] is None
    assert out["real_age_days"] is None
    assert out["price_history"] == []


def test_exactly_seven_days_apart_is_not_a_republication(session):
    record(session, obs(published_days_ago=60), source="crawler", now=NOW)
    listing = record(session, obs(published_days_ago=53), source="crawler", now=NOW)
    session.commit()
    out = signals_for(listing, now=NOW)
    assert out["republished"] is False


def test_eight_days_apart_is_a_republication(session):
    record(session, obs(published_days_ago=60), source="crawler", now=NOW)
    listing = record(session, obs(published_days_ago=52), source="crawler", now=NOW)
    session.commit()
    out = signals_for(listing, now=NOW)
    assert out["republished"] is True


def test_coarse_label_observed_daily_never_triggers_republication(session):
    listing = None
    for day in range(30):
        listing = record(session, obs(published_days_ago=60, published_precision="month"),
                         source="user", now=NOW + timedelta(days=day))
    session.commit()
    out = signals_for(listing, now=NOW + timedelta(days=29))
    assert out["republished"] is False


def test_day_precision_still_detects_republication_after_coarse_ones(session):
    for day in range(30):
        record(session, obs(published_days_ago=60, published_precision="month"),
               source="user", now=NOW + timedelta(days=day))
    later = NOW + timedelta(days=30)
    listing = record(session, obs(published_days_ago=1), source="user", now=later)
    session.commit()
    out = signals_for(listing, now=later)
    assert out["republished"] is True
    assert out["republished_at"] == (later - timedelta(days=1)).date()


def test_price_delta_is_measured_since_the_first_point(session):
    record(session, obs(price=10900), source="user", now=NOW)
    record(session, obs(price=9900), source="user", now=NOW + timedelta(days=5))
    listing = record(session, obs(price=10400), source="user", now=NOW + timedelta(days=10))
    session.commit()
    out = signals_for(listing, now=NOW + timedelta(days=10))
    assert [p["price"] for p in out["price_history"]] == [10900, 9900, 10400]
    assert out["price_delta_since_first"] == -500
    assert out["price_delta_days_since_first"] == 10
    assert out["stable_days"] == 0


def exact(**kw):
    base = dict(site="lbc", site_id="9", price=29990, brand="Hyundai", model="Ioniq",
                version="Executive", year=2022, mileage=73000, seller_type="pro")
    base.update(kw)
    return ObservationIn(**base)


PUB = datetime(2026, 8, 21, 18, 7, 27, tzinfo=timezone.utc)
BUMP = datetime(2026, 9, 3, 13, 24, 42, tzinfo=timezone.utc)
LATER = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def test_exact_timestamps_take_precedence(session):
    listing = record(session, exact(published_at=PUB, bumped_at=BUMP), source="user", now=LATER)
    session.commit()
    out = signals_for(listing, now=LATER)
    assert out["age_source"] == "exact"
    assert out["real_age_days"] == 14
    assert out["republished"] is True
    assert out["republished_at"] == BUMP.date()


def test_exact_republication_needs_no_threshold(session):
    """La borne des 7 jours ne s'applique qu'aux libellés arrondis."""
    bump = PUB + timedelta(days=2)
    listing = record(session, exact(published_at=PUB, bumped_at=bump), source="user", now=LATER)
    session.commit()
    assert signals_for(listing, now=LATER)["republished"] is True


def test_reindexing_within_a_day_is_not_a_republication(session):
    bump = PUB + timedelta(hours=6)
    listing = record(session, exact(published_at=PUB, bumped_at=bump), source="user", now=LATER)
    session.commit()
    assert signals_for(listing, now=LATER)["republished"] is False


def test_published_at_never_moves_forward(session):
    record(session, exact(published_at=BUMP), source="user", now=LATER)
    listing = record(session, exact(published_at=PUB), source="crawler", now=LATER)
    session.commit()
    assert listing.published_at == PUB


def test_relative_label_still_reports_inferred(session):
    listing = record(session, obs(published_days_ago=60), source="user", now=NOW)
    session.commit()
    out = signals_for(listing, now=NOW)
    assert out["age_source"] == "inferred"
    assert out["real_age_days"] == 60


def test_seller_type_is_stored(session):
    listing = record(session, exact(seller_type="private"), source="user", now=LATER)
    session.commit()
    assert listing.seller_type == "private"
    assert signals_for(listing, now=LATER)["seller_type"] == "private"


# Un type de vendeur qu'on ne connaît pas n'apprend rien : il est ignoré, et
# `record` laisse en place ce qu'on savait. Le refuser emportait le lot entier.
def test_unknown_seller_type_is_ignored(session):
    assert ObservationIn(site="lbc", site_id="1", seller_type="marchand").seller_type is None


def test_bump_boundary_exactly_one_day_is_a_republication(session):
    listing = record(session, exact(published_at=PUB, bumped_at=PUB + timedelta(days=1)),
                     source="user", now=LATER)
    session.commit()
    assert signals_for(listing, now=LATER)["republished"] is True


def test_bump_boundary_just_under_one_day_is_not(session):
    listing = record(session, exact(published_at=PUB, bumped_at=PUB + timedelta(hours=23, minutes=59)),
                     source="user", now=LATER)
    session.commit()
    assert signals_for(listing, now=LATER)["republished"] is False


# Ce que la confirmation hebdomadaire change pour la lecture : « stable depuis »
# reste la durée depuis le dernier *changement*, et deux nombres disent si cette
# stabilité a été vérifiée ou seulement supposée.


def weekly(session, days_, price=9900):
    listing = None
    for day in days_:
        listing = record(session, obs(price=price), source="user",
                         now=NOW + timedelta(days=day))
    session.commit()
    return listing


def test_stable_days_counts_from_the_change_not_from_the_confirmation(session):
    listing = weekly(session, range(0, 57, 7))
    out = signals_for(listing, now=NOW + timedelta(days=56))
    assert out["stable_days"] == 56
    assert out["price_checks"] == 8
    assert out["price_gap_days"] == 7
    assert out["price_delta_since_first"] is None


def test_a_price_stable_but_never_rechecked_says_so(session):
    listing = weekly(session, [0])
    out = signals_for(listing, now=NOW + timedelta(days=56))
    assert out["stable_days"] == 56
    assert out["price_checks"] == 0
    assert out["price_gap_days"] == 56


# Le trou du milieu : huit semaines sans regarder, puis une confirmation. Le
# prix a pu descendre et remonter sans témoin, et l'écart le dit.
def test_the_longest_unobserved_interval_is_reported(session):
    listing = weekly(session, [0, 7, 50])
    out = signals_for(listing, now=NOW + timedelta(days=50))
    assert out["stable_days"] == 50
    assert out["price_checks"] == 2
    assert out["price_gap_days"] == 43


def test_a_confirmation_is_not_a_change_in_the_history(session):
    listing = weekly(session, [0, 7])
    out = signals_for(listing, now=NOW + timedelta(days=7))
    assert [p["confirmation"] for p in out["price_history"]] == [False, True]
    assert [p["price"] for p in out["price_history"]] == [9900, 9900]


def test_the_delta_since_first_ignores_the_confirmations(session):
    record(session, obs(price=10900), source="user", now=NOW)
    record(session, obs(price=10900), source="user", now=NOW + timedelta(days=7))
    listing = record(session, obs(price=9900), source="user", now=NOW + timedelta(days=10))
    session.commit()
    out = signals_for(listing, now=NOW + timedelta(days=10))
    assert out["price_delta_since_first"] == -1000
    assert out["price_delta_days_since_first"] == 10
    assert out["stable_days"] == 0
    assert out["price_checks"] == 0
