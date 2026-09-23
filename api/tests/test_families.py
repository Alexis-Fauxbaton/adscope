from sqlalchemy import delete, select

from datetime import datetime, timezone

from adscope_api.auth import hash_key, new_key
from adscope_api.families import most_present
from adscope_api.follow_models import TrackedFamily
from adscope_api.models import License, Listing

from conftest import auth

CLIO = {"brand": "Renault", "model": "Clio"}
C3 = {"brand": "Citroen", "model": "C3"}
GOLF = {"brand": "Volkswagen", "model": "Golf"}


NOW = datetime(2026, 9, 12, 9, 0, tzinfo=timezone.utc)


def stock(session, counts):
    """`counts` : {(marque, modèle): combien d'annonces}."""
    site_id = 0
    for (brand, model), how_many in counts.items():
        for _ in range(how_many):
            site_id += 1
            session.add(Listing(site="lbc", site_id=str(site_id), first_seen=NOW,
                                last_seen=NOW, observations=1, brand=brand, model=model))
    session.commit()


def other_license(session):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="autre"))
    session.commit()
    return raw


def put(client, key, families):
    return client.put("/v1/families", json=families, headers=auth(key))


def test_the_perimeter_starts_empty(client, key):
    assert client.get("/v1/families", headers=auth(key)).json() == []


# L'ordre est celui de `families_of` — marque puis modèle — et non celui de
# l'envoi : le marchand relit une liste, pas un journal.
def test_the_perimeter_is_what_was_put(client, key):
    assert put(client, key, [CLIO, C3]).json() == [C3, CLIO]
    assert client.get("/v1/families", headers=auth(key)).json() == [C3, CLIO]


# Fait rougir le `delete(TrackedFamily)` de `families.replace_families` : sans
# lui, `PUT` accumulerait, et un marchand qui retire un modèle de son périmètre
# continuerait d'y dépenser des revisites.
def test_put_replaces_rather_than_adds(client, key):
    put(client, key, [CLIO, C3])
    assert put(client, key, [GOLF]).json() == [GOLF]


def test_an_empty_put_clears_the_perimeter(client, key):
    put(client, key, [CLIO])
    assert put(client, key, []).json() == []


# Fait rougir `dict.fromkeys` dans `replace_families` : deux fois la même
# famille dans un même envoi violerait la clé primaire, et le marchand ne
# verrait qu'un 500 pour une demande qui a pourtant un sens.
def test_a_family_sent_twice_is_kept_once(client, key):
    assert put(client, key, [CLIO, CLIO]).json() == [CLIO]


# Fait rougir `if len(payload) > MAX_FAMILIES` dans `put_families` (A7, audit
# d'abus) : sans lui, `PUT` écrivait n'importe quelle taille de lot.
def test_a_perimeter_over_the_cap_is_refused(client, key):
    from adscope_api.families import MAX_FAMILIES

    too_many = [{"brand": f"marque{i}", "model": "x"} for i in range(MAX_FAMILIES + 1)]
    response = put(client, key, too_many)
    assert response.status_code == 409
    assert client.get("/v1/families", headers=auth(key)).json() == []


# Fait rougir `TrackedFamily.license_key_hash == key_hash` dans `families_of` :
# le périmètre est celui du marchand qui le demande. Il pèse en revanche sur la
# file de revisite, qui sert tout le monde à la fois — voir `test_revisit`.
def test_the_perimeter_is_per_license(client, key, session):
    other = other_license(session)
    put(client, key, [CLIO])
    put(client, other, [GOLF])
    assert client.get("/v1/families", headers=auth(key)).json() == [CLIO]


# Fait rougir le même filtre dans `replace_families` : sans lui, un marchand
# qui pose son périmètre effacerait celui de tous les autres.
def test_putting_a_perimeter_leaves_the_others_alone(client, key, session):
    other = other_license(session)
    put(client, other, [GOLF])
    put(client, key, [CLIO])
    assert client.get("/v1/families", headers=auth(other)).json() == [GOLF]


def test_the_family_routes_need_a_license(client, session):
    assert client.get("/v1/families").status_code == 401
    assert client.put("/v1/families", json=[CLIO]).status_code == 401


# Fait rougir `ondelete="CASCADE"` sur `TrackedFamily.license_key_hash` : le
# périmètre n'existe que par la licence qui l'a posé.
def test_a_deleted_license_takes_its_perimeter_with_it(client, key, session):
    put(client, key, [CLIO])
    session.execute(delete(License).where(License.key_hash == hash_key(key)))
    session.commit()
    assert session.scalars(select(TrackedFamily)).all() == []


# Fait rougir `order_by(func.count().desc())` dans `families.most_present` : la
# semence doit être ce que la base connaît le mieux, faute de quoi elle sert un
# périmètre au hasard au marchand qui n'a pas encore dit le sien.
def test_the_seed_is_the_most_present_families(session):
    stock(session, {("Renault", "Clio"): 3, ("Citroen", "C3"): 5,
                    ("Peugeot", "206"): 1})
    assert [(f.brand, f.model) for f in most_present(session)] == [
        ("Citroen", "C3"), ("Renault", "Clio"), ("Peugeot", "206"),
    ]


# Fait rougir `Listing.brand.is_not(None), Listing.model.is_not(None)` : 2 % des
# annonces de la base n'ont ni l'une ni l'autre, et « la famille (rien, rien) »
# serait la deuxième plus présente.
def test_a_listing_without_a_family_is_not_one(session):
    stock(session, {("Renault", "Clio"): 1, (None, None): 5, ("Renault", None): 5})
    assert [(f.brand, f.model) for f in most_present(session)] == [("Renault", "Clio")]


# Fait rougir `.limit(count)` : dix familles est une semence, pas un périmètre
# — la file de revisite servirait en rang 0 la moitié de la base.
def test_the_seed_stops_where_it_is_asked_to(session):
    stock(session, {("Renault", "Clio"): 3, ("Citroen", "C3"): 5,
                    ("Peugeot", "206"): 1})
    assert len(most_present(session, 2)) == 2
