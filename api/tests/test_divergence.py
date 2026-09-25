from datetime import date, datetime, timedelta, timezone

from adscope_api.auth import hash_key, new_key
from adscope_api.corpus_models import Divergence, Recheck
from adscope_api.disappearance import observe
from adscope_api.intake import ObservationIn
from adscope_api.models import License, Listing, PricePoint
from adscope_api import divergence, recheck
from adscope_api.revisit import CONFIRM_DELAY

NOW = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)


def a_license(session, automated=False):
    raw = new_key()
    key_hash = hash_key(raw)
    session.add(License(key_hash=key_hash, label="crawler" if automated else "marchand",
                        automated=automated))
    session.commit()
    return session.get(License, key_hash)


def robot(session):
    return a_license(session, automated=True)


def merchant(session):
    return a_license(session, automated=False)


def listed(session, site="lbc", site_id="3263259495", observations=1, **kw):
    listing = Listing(site=site, site_id=site_id, first_seen=NOW, last_seen=NOW,
                      observations=observations, **kw)
    session.add(listing)
    session.commit()
    return listing


def obs(**kw):
    base = {"site": "lbc", "site_id": "3263259495"}
    base.update(kw)
    return ObservationIn(**base)


def claim(session, listing, field, merchant_value, license_key_hash, observed_at=NOW):
    row = Recheck(listing_id=listing.id, field=field, license_key_hash=license_key_hash,
                 merchant_value=merchant_value, observed_at=observed_at)
    session.add(row)
    session.commit()
    return row


def lines(session, listing_id):
    return session.query(Divergence).filter_by(listing_id=listing_id).all()


def pending(session, listing_id):
    return session.query(Recheck).filter_by(listing_id=listing_id).count()


# Fait rougir `abs(delta) > NOTABLE_PCT`.
def test_a_price_more_than_five_percent_apart_is_journaled(session):
    listing = listed(session)
    claim(session, listing, "price", "10000", merchant(session).key_hash)
    divergence.on_observation(session, listing, obs(price=12000), robot(session),
                              NOW + timedelta(hours=2))
    rows = lines(session, listing.id)
    assert len(rows) == 1
    assert rows[0].delta_pct == 20.0


# Fait rougir la même ligne, sens inverse.
def test_a_price_four_percent_apart_is_not(session):
    listing = listed(session)
    claim(session, listing, "price", "10000", merchant(session).key_hash)
    divergence.on_observation(session, listing, obs(price=10400), robot(session),
                              NOW + timedelta(hours=2))
    assert lines(session, listing.id) == []


# Fait rougir la requête `_explained`.
def test_an_intermediate_price_point_explains_the_price(session):
    listing = listed(session)
    lic = merchant(session)
    claim(session, listing, "price", "10000", lic.key_hash)
    other = merchant(session)
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW + timedelta(hours=1),
                           price=11000, source="user", license_key_hash=other.key_hash))
    session.commit()
    divergence.on_observation(session, listing, obs(price=12000), robot(session),
                              NOW + timedelta(hours=2))
    assert lines(session, listing.id) == []


# Fait rougir `is_distinct_from(claim.license_key_hash)` : le même marchand ne
# s'absout pas lui-même.
def test_a_merchant_cannot_explain_itself(session):
    listing = listed(session)
    lic = merchant(session)
    claim(session, listing, "price", "10000", lic.key_hash)
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW + timedelta(hours=1),
                           price=11000, source="user", license_key_hash=lic.key_hash))
    session.commit()
    divergence.on_observation(session, listing, obs(price=12000), robot(session),
                              NOW + timedelta(hours=2))
    assert len(lines(session, listing.id)) == 1


# Fait rougir `PricePoint.confirmation.is_(False)` : un point « inchangé »
# n'explique rien, il répète.
def test_a_confirmation_explains_nothing(session):
    listing = listed(session)
    claim(session, listing, "price", "10000", merchant(session).key_hash)
    other = merchant(session)
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW + timedelta(hours=1),
                           price=10000, source="user", license_key_hash=other.key_hash,
                           confirmation=True))
    session.commit()
    divergence.on_observation(session, listing, obs(price=12000), robot(session),
                              NOW + timedelta(hours=2))
    assert len(lines(session, listing.id)) == 1


# Fait rougir la comparaison `.date()` de `_published`.
def test_a_publication_date_one_day_apart_is_journaled(session):
    listing = listed(session)
    claim(session, listing, "published", date(2026, 9, 1).isoformat(),
         merchant(session).key_hash)
    divergence.on_observation(
        session, listing,
        obs(published_at=datetime(2026, 9, 2, 8, tzinfo=timezone.utc)),
        robot(session), NOW + timedelta(hours=3),
    )
    rows = lines(session, listing.id)
    assert len(rows) == 1
    assert rows[0].field == "published"


# Fait rougir `abs(diff) > MILEAGE_TOLERANCE`.
def test_a_mileage_more_than_a_thousand_apart_is_journaled(session):
    listing = listed(session, mileage=120000)
    claim(session, listing, "vehicle", "Peugeot 208 · 120000 km", merchant(session).key_hash)
    divergence.on_observation(session, listing, obs(mileage=122000), robot(session),
                              NOW + timedelta(hours=2))
    rows = lines(session, listing.id)
    assert len(rows) == 1
    assert rows[0].field == "vehicle"


# Fait rougir la comparaison marque/modèle (`fold`).
def test_a_brand_rewritten_by_the_merchant_is_journaled(session):
    listing = listed(session, brand="Citroen", model="208")
    claim(session, listing, "vehicle", "Citroen 208", merchant(session).key_hash)
    divergence.on_observation(session, listing, obs(brand="Peugeot", model="208"),
                              robot(session), NOW + timedelta(hours=2))
    assert len(lines(session, listing.id)) == 1


# Fait rougir la branche `bump` de `_verify`.
def test_a_bump_the_robot_does_not_see_is_journaled(session):
    listing = listed(session)
    claim(session, listing, "bump", NOW.isoformat(), merchant(session).key_hash)
    divergence.on_observation(session, listing, obs(price=9900), robot(session),
                              NOW + timedelta(hours=2))
    rows = lines(session, listing.id)
    assert len(rows) == 1
    assert rows[0].field == "bump"
    assert rows[0].robot_value == "aucune"


# Fait rougir `divergence.on_absence`, verdict `recorded`.
def test_a_listing_the_robot_never_finds_is_journaled(session):
    listing = listed(session, observations=0)
    lic = merchant(session)
    recheck.mark(session, listing, obs(price=9900), lic, NOW)
    session.commit()
    bot = robot(session)
    observe(session, listing.site, listing.site_id, "absent", NOW + timedelta(hours=1),
           license_=bot)
    observe(session, listing.site, listing.site_id, "absent",
           NOW + timedelta(hours=1) + CONFIRM_DELAY, license_=bot)
    session.commit()
    rows = lines(session, listing.id)
    assert len(rows) == 1
    assert rows[0].field == "unknown_listing"


# Fait rougir `divergence.on_absence`, la branche `revived` : un marchand
# disait l'annonce revenue, le robot la retrouve absente — la résurrection
# était donc fausse, ou trop tôt.
def test_a_resurrection_the_robot_contradicts_is_journalled(session):
    listing = listed(session)
    claim(session, listing, "revived", "revenue", merchant(session).key_hash)
    bot = robot(session)
    observe(session, listing.site, listing.site_id, "absent", NOW + timedelta(hours=1),
           license_=bot)
    observe(session, listing.site, listing.site_id, "absent",
           NOW + timedelta(hours=1) + CONFIRM_DELAY, license_=bot)
    session.commit()
    rows = lines(session, listing.id)
    assert len(rows) == 1
    assert (rows[0].field, rows[0].robot_value) == ("revived", "absente")


# Fait rougir la branche `absence` de `on_absence` : le marchand disait vrai,
# rien ne s'écrit.
def test_a_merchant_right_about_the_absence_is_not_journaled(session):
    listing = listed(session)
    lic = merchant(session)
    claim(session, listing, "absence", "absent", lic.key_hash)
    bot = robot(session)
    observe(session, listing.site, listing.site_id, "absent", NOW + timedelta(hours=1),
           license_=bot)
    observe(session, listing.site, listing.site_id, "absent",
           NOW + timedelta(hours=1) + CONFIRM_DELAY, license_=bot)
    session.commit()
    assert lines(session, listing.id) == []


# Fait rougir l'aiguillage `license_.automated` : deux relevés automated ne
# doivent ni marquer ni journaliser quoi que ce soit.
def test_two_automated_observations_never_produce_a_line(session):
    listing = listed(session)
    divergence.on_observation(session, listing, obs(price=9900), robot(session), NOW)
    divergence.on_observation(session, listing, obs(price=15000), robot(session),
                              NOW + timedelta(hours=1))
    assert lines(session, listing.id) == []
    assert pending(session, listing.id) == 0


# Fait rougir `delay_seconds = int((now - claim.observed_at).total_seconds())`.
def test_the_line_carries_the_delay_not_the_clock(session):
    listing = listed(session)
    claim(session, listing, "price", "10000", merchant(session).key_hash, observed_at=NOW)
    divergence.on_observation(session, listing, obs(price=20000), robot(session),
                              NOW + timedelta(hours=5))
    row = lines(session, listing.id)[0]
    assert row.delay_seconds == 5 * 3600


# Fait rougir `recheck.clear(listing_id)` dans `_verify`.
def test_the_marker_is_lifted_even_when_nothing_is_journaled(session):
    listing = listed(session)
    claim(session, listing, "price", "10000", merchant(session).key_hash)
    divergence.on_observation(session, listing, obs(price=10100), robot(session),
                              NOW + timedelta(hours=1))
    assert lines(session, listing.id) == []
    assert pending(session, listing.id) == 0
