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


def test_same_price_twice_the_same_day_does_not_add_a_point(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, obs(), source="user", now=NOW + timedelta(hours=6))
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
# peut combler. Un point par jour au plus le referme, et seulement pour les
# annonces effectivement revues. La lecture, elle, éclaircit — voir
# `signals.thinned`.


def test_an_unchanged_price_is_confirmed_the_next_day(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, obs(), source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert [(p.price, p.confirmation) for p in listing.prices] == [
        (9900, False), (9900, True),
    ]


def test_an_unchanged_price_adds_nothing_twice_in_the_same_day(session):
    record(session, obs(), source="user", now=NOW)
    record(session, obs(), source="user", now=NOW + timedelta(hours=4))
    listing = record(session, obs(), source="user", now=NOW + timedelta(hours=11))
    session.commit()
    assert len(listing.prices) == 1


# Le jour est celui d'UTC, jamais celui du fuseau local. Ces deux instants
# tombent le même jour à Paris et deux jours différents en UTC : lus à l'heure
# locale, le second ne serait pas confirmé. La relecture passe par la base,
# seule à rendre l'horodatage dans le fuseau de la connexion.
def test_the_day_that_counts_is_the_utc_one(session):
    evening = datetime(2026, 9, 5, 23, 30, tzinfo=timezone.utc)
    record(session, obs(), source="user", now=evening)
    session.commit()
    session.expire_all()
    listing = record(session, obs(), source="user", now=evening + timedelta(hours=1))
    session.commit()
    assert [p.confirmation for p in listing.prices] == [False, True]


def test_the_first_point_is_a_change_never_a_confirmation(session):
    listing = record(session, obs(), source="user", now=NOW)
    session.commit()
    assert [p.confirmation for p in listing.prices] == [False]


def test_a_change_is_written_at_once_even_within_the_day(session):
    record(session, obs(price=10900), source="user", now=NOW)
    listing = record(session, obs(price=9900), source="user", now=NOW + timedelta(hours=1))
    session.commit()
    assert [(p.price, p.confirmation) for p in listing.prices] == [
        (10900, False), (9900, False),
    ]


# Le volume au stockage : une annonce leboncoin vit soixante jours, vue tous
# les jours elle porte soixante points. Trente octets pièce, c'est le prix de
# la finesse — et ce n'est pas ce que l'API sert.
def test_daily_observation_over_a_whole_life_gives_a_point_a_day(session):
    listing = None
    for day in range(60):
        listing = record(session, obs(), source="user", now=NOW + timedelta(days=day))
    session.commit()
    assert len(listing.prices) == 60
    assert [p.confirmation for p in listing.prices] == [False] + [True] * 59


# Une annonce revue trois jours de suite puis oubliée une semaine ne porte que
# les jours où elle a été vue : la confirmation suit l'observation, elle ne
# comble pas les trous.
def test_a_confirmation_marks_the_day_seen_not_the_days_missed(session):
    listing = None
    for day in (0, 1, 2, 10):
        listing = record(session, obs(), source="user", now=NOW + timedelta(days=day))
    session.commit()
    assert [p.observed_at.date() for p in listing.prices] == [
        (NOW + timedelta(days=day)).date() for day in (0, 1, 2, 10)
    ]


# Fait rougir `derive(listing)` dans `record` : sans cette ligne les colonnes
# canoniques resteraient vides sur toute annonce arrivée après la migration,
# et le marché ne la trouverait plus ni par famille ni par `q`.
def test_an_observation_lays_the_canonical_columns(session):
    listing = record(session, obs(), source="user", now=NOW)
    session.commit()
    assert (listing.canon_brand, listing.canon_model) == ("peugeot", "308 ii phase 2")
    assert "peugeot" in listing.search_text.split()
    assert "puretech" in listing.search_text.split()


# Fait rougir la place de `derive(listing)`, *après* la boucle sur
# `VEHICLE_FIELDS` : posée avant, la couche canonique porterait toujours ce que
# l'annonce valait au tour précédent.
def test_the_canonical_layer_follows_what_the_observation_changes(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, obs(model="3008"), source="user", now=NOW)
    session.commit()
    assert listing.canon_model == "3008"


# Fait rougir `derive(listing)`, l'annonce et non l'observation : muette sur le
# modèle, une observation laisse en place celui qu'on savait — la forme
# canonique doit le suivre, pas retomber à vide.
def test_the_canonical_layer_survives_an_observation_that_says_nothing(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, obs(model=None, version=None), source="user", now=NOW)
    session.commit()
    assert listing.canon_model == "308 ii phase 2"
    assert "puretech" in listing.search_text.split()


# Fait rougir la règle cardinale : les champs observés ne bougent pas. Sans
# elle, `fingerprint` changerait de valeur et l'empreinte véhicule — parité
# JS/Python, `shared/fingerprint-vectors.json` — se romprait en silence.
def test_the_canonical_layer_leaves_the_observed_fields_alone(session):
    listing = record(session, obs(), source="user", now=NOW)
    session.commit()
    assert (listing.brand, listing.model) == ("PEUGEOT", "308 II phase 2")
    assert listing.fingerprint == "54b22edbd39c"


# Fait rougir `"postal_code", "seller_type", "fuel", "gearbox", "department"`
# dans `VEHICLE_FIELDS` : les trois champs du lot s'écrivent comme les autres
# détails véhicule.
def test_fuel_gearbox_and_department_are_recorded(session):
    listing = record(session, obs(fuel="diesel", gearbox="automatique", department="75"),
                     source="user", now=NOW)
    session.commit()
    assert (listing.fuel, listing.gearbox, listing.department) == ("diesel", "automatique", "75")


# Fait rougir la même ligne dans le sens qui protège : une observation muette
# sur ces champs n'efface rien de ce qu'on savait déjà.
def test_a_later_observation_without_these_fields_erases_nothing(session):
    record(session, obs(fuel="diesel", gearbox="automatique", department="75"),
           source="user", now=NOW)
    listing = record(session, obs(), source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert (listing.fuel, listing.gearbox, listing.department) == ("diesel", "automatique", "75")


# Fait rougir `setattr(listing, field, value)` : une valeur qui change (le
# vendeur corrige son annonce) remplace celle qu'on savait.
def test_a_changed_value_overwrites_the_previous_one(session):
    record(session, obs(fuel="essence"), source="user", now=NOW)
    listing = record(session, obs(fuel="electrique"), source="user",
                     now=NOW + timedelta(days=1))
    session.commit()
    assert listing.fuel == "electrique"


# Fait rougir `VEHICLE_FIELDS` : ces trois champs n'entrent pas dans
# `FINGERPRINT_FIELDS`, donc pas dans l'empreinte véhicule.
def test_fuel_gearbox_and_department_are_outside_the_fingerprint(session):
    without = record(session, obs(), source="user", now=NOW).fingerprint
    with_fields = record(
        session, obs(site_id="2", fuel="diesel", gearbox="automatique", department="75"),
        source="user", now=NOW,
    ).fingerprint
    assert without == with_fields == "54b22edbd39c"


# Fait rougir `"postal_code"` dans `VEHICLE_FIELDS` : seul membre du tuple que
# rien d'autre ne gardait — retiré, les 516 tests restaient verts. Même trio
# de preuves que fuel/gearbox/department : écrit, jamais effacé, corrigé.
def test_a_complete_postal_code_is_recorded(session):
    listing = record(session, obs(postal_code="75015"), source="user", now=NOW)
    session.commit()
    assert listing.postal_code == "75015"


def test_a_later_observation_without_a_postal_code_erases_nothing(session):
    record(session, obs(postal_code="75015"), source="user", now=NOW)
    listing = record(session, ObservationIn(site="lc", site_id="87103336930", price=9900),
                     source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert listing.postal_code == "75015"


def test_a_corrected_postal_code_overwrites_the_previous_one(session):
    record(session, obs(postal_code="75015"), source="user", now=NOW)
    listing = record(session, obs(postal_code="69003"), source="user",
                     now=NOW + timedelta(days=1))
    session.commit()
    assert listing.postal_code == "69003"
