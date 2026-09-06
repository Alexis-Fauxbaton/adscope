"""Une valeur hors gabarit ne fait pas tomber ses voisines.

Reproduit sur la base de développement avant correction : un lot de cent
observations dont une portait un nom de boutique de 200 caractères recevait 422
pour le lot entier — aucune des cent n'entrait en base. Les champs plus larges
que leur colonne mais sans borne dans le schéma faisaient pire, un 500 à
l'insertion. Rien n'est rejoué côté extension : la page entière était perdue.
"""

from adscope_api.models import Listing
from conftest import auth


def observation(**kw):
    base = dict(site="lc", site_id="1", price=9900, brand="PEUGEOT", model="308",
                version="1.2", year=2018, mileage=62686, published_days_ago=60)
    base.update(kw)
    return base


def post(client, key, items):
    return client.post("/v1/observations", json={"items": items}, headers=auth(key))


def hundred(**kw):
    items = [observation(site_id=str(i)) for i in range(100)]
    items[42].update(seller_type="pro", seller_id="77", **kw)
    return items


def test_one_oversized_name_does_not_sink_the_batch(client, key, session):
    r = post(client, key, hundred(seller_name="X" * 200))
    assert r.status_code == 200
    assert r.json() == {"accepted": 100, "refused": 0}
    assert session.query(Listing).count() == 100


# La raison commerciale est de la prose, affichée telle quelle : tronquée au
# gabarit de la colonne, elle reste lisible et l'annonce entre.
def test_an_oversized_name_is_truncated(client, key, session):
    post(client, key, hundred(seller_name="X" * 200))
    assert session.get(Listing, 43).seller_name == "X" * 128


# Un identifiant tronqué en désignerait un autre : deux marchands se
# retrouveraient dans le même stock. Le champ est ignoré, jamais raboté.
def test_an_oversized_seller_id_is_ignored_not_truncated(client, key, session):
    post(client, key, [observation(seller_type="pro", seller_id="7" * 40,
                                   seller_name="GARAGE")])
    listing = session.query(Listing).one()
    assert (listing.seller_id, listing.seller_name) == (None, None)


# Ces champs-là n'avaient aucune borne dans le schéma et une colonne plus
# étroite qu'eux : le lot repartait en 500.
def test_a_field_wider_than_its_column_no_longer_breaks_the_insert(client, key, session):
    r = post(client, key, [observation(model="M" * 200), observation(site_id="2")])
    assert r.status_code == 200
    assert session.get(Listing, 1).model == "M" * 128
    assert session.query(Listing).count() == 2


def test_a_postal_code_out_of_gauge_is_ignored(client, key, session):
    post(client, key, [observation(postal_code="75015 Paris 15e")])
    assert session.query(Listing).one().postal_code is None


def test_absurd_numbers_are_ignored_field_by_field(client, key, session):
    r = post(client, key, [observation(year=10 ** 12, mileage=-3, price=-1)])
    assert r.status_code == 200
    listing = session.query(Listing).one()
    assert (listing.year, listing.mileage, listing.prices) == (None, None, [])


def test_an_unknown_seller_type_is_ignored(client, key, session):
    r = post(client, key, [observation(seller_type="marchand")])
    assert r.status_code == 200
    assert session.query(Listing).one().seller_type is None


def test_an_unparsable_date_is_ignored(client, key, session):
    r = post(client, key, [observation(published_at="hier")])
    assert r.status_code == 200
    assert session.query(Listing).one().published_at is None


# L'identité de l'annonce ne se rattrape pas : tronquée, l'observation
# s'attacherait à une autre annonce. Celle-là seule est refusée, et le compte
# le dit — un refus muet serait la perte silencieuse qu'on cherche à fermer.
def test_a_listing_without_usable_identity_is_refused_alone(client, key, session):
    r = post(client, key, [observation(site_id="9" * 40), observation(site_id="2")])
    assert r.status_code == 200
    assert r.json() == {"accepted": 1, "refused": 1}
    assert [l.site_id for l in session.query(Listing)] == ["2"]


def test_a_payload_with_nothing_recordable_is_rejected(client, key):
    assert post(client, key, [observation(site_id="")]).status_code == 422
