from datetime import datetime, timedelta, timezone

from adscope_api.auth import hash_key, new_key
from adscope_api.corpus_models import Recheck
from adscope_api.disappearance import observe
from adscope_api.intake import ObservationIn
from adscope_api.models import License, Listing, PricePoint
from adscope_api import recheck

NOW = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)


def merchant(session):
    raw = new_key()
    key_hash = hash_key(raw)
    session.add(License(key_hash=key_hash, label="marchand"))
    session.commit()
    return session.get(License, key_hash)


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


def claims(session, listing_id):
    return session.query(Recheck).filter_by(listing_id=listing_id).all()


def fields(session, listing_id):
    return {claim.field for claim in claims(session, listing_id)}


# Fait rougir `listing.observations == 0` — critère (a).
def test_a_listing_a_merchant_has_just_created_is_marked(session):
    listing = listed(session, observations=0)
    recheck.mark(session, listing, obs(price=9900), merchant(session), NOW)
    session.commit()
    assert "unknown_listing" in fields(session, listing.id)


# Fait rougir `latest.price != observation.price` — critère (b).
def test_a_price_change_by_a_merchant_is_marked(session):
    listing = listed(session)
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=1),
                           price=10900, source="crawler"))
    session.commit()
    recheck.mark(session, listing, obs(price=9900), merchant(session), NOW)
    session.commit()
    claim = claims(session, listing.id)[0]
    assert claim.field == "price"
    assert claim.merchant_value == "9900"


# Fait rougir la même ligne, sens inverse.
def test_a_price_unchanged_marks_nothing(session):
    listing = listed(session)
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=1),
                           price=9900, source="crawler"))
    session.commit()
    recheck.mark(session, listing, obs(price=9900), merchant(session), NOW)
    session.commit()
    assert claims(session, listing.id) == []


# Fait rougir `observation.published_at.date() != listing.published_at.date()`
# — critère (c).
def test_a_different_publication_date_is_marked(session):
    listing = listed(session, published_at=NOW - timedelta(days=10))
    recheck.mark(session, listing, obs(published_at=NOW - timedelta(days=2)),
                merchant(session), NOW)
    session.commit()
    assert "published" in fields(session, listing.id)


# Fait rougir `listing.bumped_at is None or observation.bumped_at >
# listing.bumped_at` — critère (e).
def test_a_bump_the_base_did_not_have_is_marked(session):
    listing = listed(session)
    recheck.mark(session, listing, obs(bumped_at=NOW), merchant(session), NOW)
    session.commit()
    assert "bump" in fields(session, listing.id)


# Fait rougir l'appel `recheck.mark_absence` dans `disappearance.observe` —
# critère (d).
def test_a_declared_absence_is_marked(session):
    listing = listed(session)
    lic = merchant(session)
    observe(session, listing.site, listing.site_id, "absent", NOW, license_=lic)
    session.commit()
    assert "absence" in fields(session, listing.id)


# Fait rougir la garde « au moins une ligne posée » de (f) : le véhicule seul
# n'écrit rien.
def test_the_vehicle_claim_never_stands_alone(session):
    listing = listed(session, brand="Peugeot", model="208", year=2013, mileage=120000)
    recheck.mark(session, listing, obs(brand="Peugeot", model="208", year=2013,
                                       mileage=120000), merchant(session), NOW)
    session.commit()
    assert claims(session, listing.id) == []


def test_a_vehicle_claim_accompanies_a_price_change(session):
    listing = listed(session, brand="Peugeot", model="208", year=2013, mileage=120000)
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=1),
                           price=10900, source="crawler"))
    session.commit()
    recheck.mark(session, listing, obs(price=9900, brand="Peugeot", model="208",
                                       year=2013, mileage=125000), merchant(session), NOW)
    session.commit()
    assert "vehicle" in fields(session, listing.id)


# Fait rougir `observation.site in ADDRESS` (via `revisit.ADDRESS`) : un
# marqueur sur La Centrale ne serait jamais levé, la file ne la sert jamais.
def test_a_lacentrale_observation_is_never_marked(session):
    listing = listed(session, site="lc", site_id="W103538172", observations=0)
    recheck.mark(session, listing, obs(site="lc", site_id="W103538172", price=9900),
                merchant(session), NOW)
    session.commit()
    assert claims(session, listing.id) == []


# Fait rougir la clé primaire à trois colonnes : deux marchands qui
# réclament le même champ sont tous deux jugés — pas d'écrasement.
def test_two_merchants_on_the_same_field_both_hold_a_claim(session):
    listing = listed(session)
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=1),
                           price=10900, source="crawler"))
    session.commit()
    recheck.mark(session, listing, obs(price=9900), merchant(session), NOW)
    recheck.mark(session, listing, obs(price=8900), merchant(session), NOW)
    session.commit()
    assert len(claims(session, listing.id)) == 2


# Fait rougir `recheck.clear` : le marqueur se lève en entier, tous champs
# confondus.
def test_clear_lifts_every_claim_of_the_listing(session):
    listing = listed(session)
    recheck.mark(session, listing, obs(bumped_at=NOW), merchant(session), NOW)
    session.commit()
    assert claims(session, listing.id) != []
    recheck.clear(session, listing.id)
    session.commit()
    assert claims(session, listing.id) == []
