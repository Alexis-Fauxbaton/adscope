from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from adscope_api.models import License
from adscope_api.observations import record
from adscope_api.schemas import ObservationIn

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)

# Par licence et par jour : combien d'annonces distinctes et combien
# d'observations. C'est la seule mesure d'usage du produit, et elle se lit
# directement dans les points de prix — aucun agrégat à tenir à jour.
USAGE = """
SELECT p.license_key_hash,
       date_trunc('day', p.observed_at) AS day,
       count(DISTINCT p.listing_id) AS listings,
       count(*) AS observations
  FROM price_points p
 WHERE p.license_key_hash IS NOT NULL
 GROUP BY 1, 2
 ORDER BY 2, 1
"""


def license_(session, label, key_hash):
    lic = License(key_hash=key_hash, label=label)
    session.add(lic)
    session.flush()
    return lic


def obs(site_id, price):
    return ObservationIn(site="lc", site_id=site_id, price=price)


def test_a_price_point_carries_the_license_that_sent_it(session):
    lic = license_(session, "marchand", "a" * 64)
    listing = record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    session.commit()
    assert listing.prices[0].license_key_hash == "a" * 64


def test_a_crawler_observation_carries_no_license(session):
    listing = record(session, obs("1", 9900), source="crawler", now=NOW)
    session.commit()
    assert listing.prices[0].license_key_hash is None


def test_each_point_keeps_the_license_of_its_own_observation(session):
    first = license_(session, "premier", "a" * 64)
    second = license_(session, "second", "b" * 64)
    record(session, obs("1", 9900), source="user", license_=first, now=NOW)
    listing = record(session, obs("1", 9500), source="user", license_=second,
                     now=NOW + timedelta(days=1))
    session.commit()
    assert [p.license_key_hash for p in listing.prices] == ["a" * 64, "b" * 64]


def test_usage_counts_distinct_listings_and_observations_per_day(session):
    lic = license_(session, "marchand", "a" * 64)
    other = license_(session, "autre", "b" * 64)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    record(session, obs("2", 8000), source="user", license_=lic, now=NOW)
    # Même annonce le lendemain, prix différent : une seconde observation.
    record(session, obs("1", 9500), source="user", license_=lic,
           now=NOW + timedelta(days=1))
    record(session, obs("3", 7000), source="user", license_=other, now=NOW)
    record(session, obs("4", 6000), source="crawler", now=NOW)
    session.commit()

    rows = [tuple(r) for r in session.execute(text(USAGE))]
    day, tomorrow = NOW.date(), (NOW + timedelta(days=1)).date()
    assert [(r[0], r[1].date(), r[2], r[3]) for r in rows] == [
        ("a" * 64, day, 2, 2),
        ("b" * 64, day, 1, 1),
        ("a" * 64, tomorrow, 1, 1),
    ]
