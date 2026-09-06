from datetime import datetime, timedelta, timezone

from adscope_api.models import Listing
from adscope_api.observations import record
from adscope_api.intake import ObservationIn

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


# Le vendeur professionnel est de la donnée d'entreprise, le particulier non :
# la ligne se tient au stockage, et pas seulement à l'affichage. leboncoin
# expose `store_id` pour les deux — le tri se fait donc sur le type.
def test_a_professional_seller_is_kept(session):
    listing = record(session, obs(seller_type="pro", seller_id="76697703",
                                 seller_name="CVD AUTOMOBILES"), source="user", now=NOW)
    session.commit()
    assert listing.seller_id == "76697703"
    assert listing.seller_name == "CVD AUTOMOBILES"


def test_a_private_seller_leaves_the_field_empty(session):
    listing = record(session, obs(seller_type="private", seller_id="27784407",
                                 seller_name="Fra"), source="user", now=NOW)
    session.commit()
    assert listing.seller_id is None
    assert listing.seller_name is None


# Une annonce passée de pro à particulier — vendeur qui change de statut, ou
# première observation mal typée — ne doit pas garder l'identifiant.
def test_becoming_private_clears_the_seller(session):
    record(session, obs(seller_type="pro", seller_id="1", seller_name="X"),
           source="user", now=NOW)
    listing = record(session, obs(seller_type="private"), source="user",
                     now=NOW + timedelta(days=1))
    session.commit()
    assert listing.seller_id is None
    assert listing.seller_name is None


# Une observation sans vendeur — une charge partielle, un autre site — n'efface
# pas ce qu'on savait : elle n'apprend rien sur ce point.
def test_an_observation_without_seller_type_changes_nothing(session):
    record(session, obs(seller_type="pro", seller_id="1", seller_name="X"),
           source="user", now=NOW)
    listing = record(session, obs(), source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert listing.seller_id == "1"


# L'échantillonnage dans le temps. Un point n'était écrit qu'au changement de
# prix : entre deux points, l'intervalle restait un trou qu'aucune relecture ne
# peut combler. Un point par semaine au plus le referme, et seulement pour les
# annonces effectivement revues.


def test_an_unchanged_price_is_confirmed_after_a_week(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, obs(), source="user", now=NOW + timedelta(days=7))
    session.commit()
    assert [(p.price, p.confirmation) for p in listing.prices] == [
        (9900, False), (9900, True),
    ]


def test_an_unchanged_price_adds_nothing_within_the_week(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, obs(), source="user",
                     now=NOW + timedelta(days=6, hours=23))
    session.commit()
    assert len(listing.prices) == 1


def test_the_first_point_is_a_change_never_a_confirmation(session):
    listing = record(session, obs(), source="user", now=NOW)
    session.commit()
    assert [p.confirmation for p in listing.prices] == [False]


def test_a_change_is_written_at_once_even_within_the_week(session):
    record(session, obs(price=10900), source="user", now=NOW)
    listing = record(session, obs(price=9900), source="user", now=NOW + timedelta(hours=1))
    session.commit()
    assert [(p.price, p.confirmation) for p in listing.prices] == [
        (10900, False), (9900, False),
    ]


# Le volume : une annonce leboncoin vit soixante jours, vue tous les jours elle
# ne produit qu'un point par semaine.
def test_daily_observation_over_a_whole_life_stays_weekly(session):
    listing = None
    for day in range(60):
        listing = record(session, obs(), source="user", now=NOW + timedelta(days=day))
    session.commit()
    assert len(listing.prices) == 9
    assert [p.confirmation for p in listing.prices] == [False] + [True] * 8


def test_the_confirmation_resets_the_week_not_the_price(session):
    record(session, obs(price=9900), source="user", now=NOW)
    record(session, obs(price=9900), source="user", now=NOW + timedelta(days=7))
    listing = record(session, obs(price=9900), source="user", now=NOW + timedelta(days=13))
    session.commit()
    assert len(listing.prices) == 2
