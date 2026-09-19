from datetime import datetime, timedelta, timezone

from adscope_api.auth import hash_key, new_key, resolve
from adscope_api.follow_models import Follow
from adscope_api.market_items import item_of
from adscope_api.market_query import market_page
from adscope_api.taxonomy import derive
from adscope_api.models import License, Listing, PricePoint

from conftest import auth

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)


def car(session, site_id, *, brand="Renault", model="Clio", year=2015, version=None,
        site="lbc", seller_type=None, seller_name=None, published=None,
        disappeared_at=None, fuel=None, gearbox=None, department=None, prices=()):
    row = Listing(site=site, site_id=site_id, first_seen=NOW, last_seen=NOW,
                  observations=1, brand=brand, model=model, year=year, version=version,
                  seller_type=seller_type, seller_name=seller_name, published_at=published,
                  disappeared_at=disappeared_at, fuel=fuel, gearbox=gearbox,
                  department=department)
    row.prices = [
        PricePoint(observed_at=at, price=price, source="user", confirmation=confirmation)
        for at, price, confirmation in prices
    ]
    # Ce que `observations.record` fait à l'écriture : sans ça les colonnes
    # canoniques resteraient vides et aucun filtre du marché ne trouverait rien.
    derive(row)
    session.add(row)
    session.commit()
    return row


def page(session, key, **kw):
    total, rows = market_page(session, resolve(session, key), NOW, **kw)
    return total, [item_of(r) for r in rows]


# Fait rougir `Listing.brand == brand` dans `market_query._core`.
def test_filters_by_brand(session, key):
    car(session, "1", brand="Renault")
    car(session, "2", brand="Peugeot")
    total, items = page(session, key, brand="Peugeot")
    assert (total, [i["site_id"] for i in items]) == (1, ["2"])


# Fait rougir `Listing.model == model` dans `market_query._core`.
def test_filters_by_model(session, key):
    car(session, "1", model="Clio")
    car(session, "2", model="208")
    total, items = page(session, key, model="208")
    assert (total, [i["site_id"] for i in items]) == (1, ["2"])


# Fait rougir `Listing.seller_type == seller_type` dans `market_query._core`.
def test_filters_by_seller_type(session, key):
    car(session, "1", seller_type="pro")
    car(session, "2", seller_type="private")
    _, items = page(session, key, seller_type="pro")
    assert [i["site_id"] for i in items] == ["1"]


# Fait rougir `if fuel: query = query.where(Listing.fuel.in_(fuel))`.
def test_filters_by_fuel(session, key):
    car(session, "1", fuel="diesel")
    car(session, "2", fuel="essence")
    _, items = page(session, key, fuel=["diesel"])
    assert [i["site_id"] for i in items] == ["1"]


# Fait rougir `Listing.fuel.in_(fuel)` sur sa forme répétable : plusieurs
# valeurs se combinent en « ou », jamais en « et ».
def test_fuel_filter_accepts_several_values(session, key):
    car(session, "1", fuel="diesel")
    car(session, "2", fuel="essence")
    car(session, "3", fuel="hybride")
    _, items = page(session, key, fuel=["diesel", "essence"])
    assert {i["site_id"] for i in items} == {"1", "2"}


# Fait rougir `if gearbox: query = query.where(Listing.gearbox.in_(gearbox))`.
def test_filters_by_gearbox(session, key):
    car(session, "1", gearbox="automatique")
    car(session, "2", gearbox="manuelle")
    _, items = page(session, key, gearbox=["automatique"])
    assert [i["site_id"] for i in items] == ["1"]


# Fait rougir `if department: query = query.where(Listing.department.in_(department))`.
def test_filters_by_department(session, key):
    car(session, "1", department="75")
    car(session, "2", department="92")
    _, items = page(session, key, department=["75"])
    assert [i["site_id"] for i in items] == ["1"]


# Fait rougir `"fuel": row.fuel, "gearbox": row.gearbox, "department":
# row.department` dans `market_items.item_of`.
def test_the_item_carries_fuel_gearbox_and_department(session, key):
    car(session, "1", fuel="diesel", gearbox="automatique", department="75")
    _, items = page(session, key)
    assert (items[0]["fuel"], items[0]["gearbox"], items[0]["department"]) == (
        "diesel", "automatique", "75",
    )


# Fait rougir `age >= min_age_days` : une annonce exactement à la borne reste
# dedans, une de moins en sort.
def test_min_age_days_keeps_the_boundary_and_drops_what_is_younger(session, key):
    car(session, "young", published=NOW - timedelta(days=89))
    car(session, "exact", published=NOW - timedelta(days=90))
    total, items = page(session, key, min_age_days=90)
    assert (total, [i["site_id"] for i in items]) == (1, ["exact"])


# Fait rougir `change_count.c.n >= 2` dans `market_query._core` : un seul prix
# changé n'a rien à comparer, `price_delta_since_first` reste nul.
def test_price_delta_since_first_needs_two_changed_prices(session, key):
    car(session, "one", prices=[(NOW, 9000, False)])
    _, items = page(session, key)
    assert items[0]["price_delta_since_first"] is None


# Fait rougir `where=CHANGED` dans `_first_change`/`_last_change` : une
# confirmation (même prix, `confirmation=True`) ne compte pas comme un
# changement.
def test_confirmations_are_not_counted_as_changes(session, key):
    car(session, "flat", prices=[
        (NOW - timedelta(days=10), 9000, False),
        (NOW - timedelta(days=3), 9000, True),
    ])
    _, items = page(session, key)
    item = items[0]
    assert item["price_delta_since_first"] is None
    assert item["last_change_at"] == NOW - timedelta(days=10)


# Fait rougir `query.where(delta < 0 if dropped else ...)` : seule l'annonce
# dont le prix a baissé passe le filtre `dropped`.
def test_dropped_keeps_only_listings_whose_price_fell(session, key):
    car(session, "down", prices=[
        (NOW - timedelta(days=5), 12000, False), (NOW - timedelta(days=1), 11000, False),
    ])
    car(session, "up", prices=[
        (NOW - timedelta(days=5), 10000, False), (NOW - timedelta(days=1), 11000, False),
    ])
    car(session, "single", prices=[(NOW, 9000, False)])
    total, items = page(session, key, dropped=True)
    assert (total, [i["site_id"] for i in items]) == (1, ["down"])


# Fait rougir `age.desc().nulls_last()`, le tri par défaut.
def test_sort_age_desc_is_the_default_oldest_first(session, key):
    car(session, "young", published=NOW - timedelta(days=5))
    car(session, "old", published=NOW - timedelta(days=500))
    _, items = page(session, key)
    assert [i["site_id"] for i in items] == ["old", "young"]


# Fait rougir la branche `"recent"` de `market_query._order`.
def test_sort_recent_is_youngest_first(session, key):
    car(session, "young", published=NOW - timedelta(days=5))
    car(session, "old", published=NOW - timedelta(days=500))
    _, items = page(session, key, sort="recent")
    assert [i["site_id"] for i in items] == ["young", "old"]


# Fait rougir la branche `"drop_desc"` de `market_query._order`.
def test_sort_drop_desc_is_the_biggest_drop_first(session, key):
    car(session, "small_drop", prices=[
        (NOW - timedelta(days=5), 10000, False), (NOW, 9900, False),
    ])
    car(session, "big_drop", prices=[
        (NOW - timedelta(days=5), 10000, False), (NOW, 8000, False),
    ])
    _, items = page(session, key, sort="drop_desc")
    assert [i["site_id"] for i in items] == ["big_drop", "small_drop"]


# Fait rougir `select(func.count()).select_from(query.subquery())` : le total
# porte sur tout le filtre, pas sur la page rendue.
def test_total_counts_the_filtered_set_not_the_page(session, key):
    for i in range(5):
        car(session, f"c{i}")
    total, items = page(session, key, limit=2)
    assert (total, len(items)) == (5, 2)


# Fait rougir `.offset(offset)` : la deuxième page reprend où la première
# s'est arrêtée.
def test_offset_moves_through_the_page(session, key):
    car(session, "a")
    car(session, "b")
    _, first = page(session, key, limit=1, offset=0)
    _, second = page(session, key, limit=1, offset=1)
    assert (first[0]["site_id"], second[0]["site_id"]) == ("a", "b")


# Fait rougir `Listing.disappeared_at.is_(None)` dans `market_query._core`.
def test_disappeared_listings_are_excluded(session, key):
    car(session, "gone", disappeared_at=NOW - timedelta(days=1))
    car(session, "here")
    total, items = page(session, key)
    assert (total, items[0]["site_id"]) == (1, "here")


# Fait rougir la colonne `Listing.seller_name`, vide pour un particulier
# (posé par `observations.record`, jamais anonymisé ici).
def test_seller_name_is_null_for_a_private_seller(session, key):
    car(session, "priv", seller_type="private", seller_name=None)
    _, items = page(session, key)
    assert items[0]["seller_name"] is None


# Fait rougir le sous-select `exists()` de `followed` : suivi par une licence,
# pas par une autre.
def test_followed_is_true_only_for_the_calling_license(session, key):
    listing = car(session, "watched")
    other = new_key()
    session.add(License(key_hash=hash_key(other), label="autre"))
    session.add(Follow(license_key_hash=hash_key(key), listing_id=listing.id, followed_at=NOW))
    session.commit()
    _, mine = page(session, key)
    _, theirs = page(session, other)
    assert (mine[0]["followed"], theirs[0]["followed"]) == (True, False)


def test_the_market_route_needs_a_license(client, session):
    assert client.get("/v1/market").status_code == 401


# Fait rougir `Query(default=50, ge=1, le=100)` : la limite du contrat.
def test_limit_is_capped_at_100(client, key):
    assert client.get(
        "/v1/market", params={"limit": 101}, headers=auth(key)
    ).status_code == 422


# Fait rougir `fuel: list[Fuel] | None` : le typage fermé rejette une valeur
# hors vocabulaire avant même d'atteindre `market_page`. `gnv` est désormais
# une valeur connue (`test_gnv_is_a_recognized_filter_value` plus bas) : le
# kérosène n'entrera jamais dans ce vocabulaire, il sert d'exemple stable.
def test_an_unknown_fuel_filter_value_is_a_422(client, key):
    assert client.get(
        "/v1/market", params={"fuel": "kerosene"}, headers=auth(key)
    ).status_code == 422


# Fait rougir `Fuel` amputé de `"gnv"` : le filtre doit accepter la valeur,
# même si aucune annonce ne la porte encore (colonnes vides, `.superpowers/
# recherche-lot2-api.md`).
def test_gnv_is_a_recognized_filter_value(client, key, session):
    response = client.get("/v1/market", params={"fuel": "gnv"}, headers=auth(key))
    assert response.status_code == 200
    assert response.json()["items"] == []


# Fait rougir `if None in normalized: raise HTTPException(422, ...)` dans
# `market._departments` : un département qui ne ressemble à rien est rejeté,
# jamais un filtre muet qui ne rend jamais rien.
def test_an_unrecognizable_department_filter_value_is_a_422(client, key):
    assert client.get(
        "/v1/market", params={"department": "Île-de-France"}, headers=auth(key)
    ).status_code == 422


# Passe par le vrai routeur : un filtre valide traverse `_departments` puis
# `market_page` sans erreur et ne rend que ce qu'il filtre.
def test_the_department_filter_works_through_the_route(client, key, session):
    car(session, "1", department="75")
    car(session, "2", department="92")
    body = client.get(
        "/v1/market", params={"department": "75"}, headers=auth(key)
    ).json()
    assert [i["site_id"] for i in body["items"]] == ["1"]


# Passe par le vrai routeur, pas par `market_page` : prouve que le montage,
# le nom des paramètres et le gabarit de sortie tiennent ensemble.
def test_the_market_route_serves_the_contract_shape(client, key, session):
    car(session, "shape")
    body = client.get("/v1/market", headers=auth(key)).json()
    assert set(body.keys()) == {"total", "items"}
    assert set(body["items"][0].keys()) == {
        "site", "site_id", "url", "brand", "model", "version", "label",
        "year", "mileage",
        "price", "fuel", "gearbox", "department", "region",
        "seller_type", "seller_name", "published_at", "age_days",
        "price_delta_since_first", "last_change_at", "followed", "disappeared_at",
    }


# Fait rougir `"region": region_of_department(row.department)` dans
# `market_items.item_of` : chaque item porte le nom officiel de sa région,
# déduit du département, jamais stocké.
def test_the_item_carries_its_region_derived_from_department(session, key):
    car(session, "1", department="75")
    _, items = page(session, key)
    assert items[0]["region"] == "Île-de-France"


# Même ligne, dans le cas nul : une annonce sans département n'a pas de
# région, jamais une valeur devinée.
def test_an_item_without_department_has_no_region(session, key):
    car(session, "1")
    _, items = page(session, key)
    assert items[0]["region"] is None


# Fait rougir `_region_departments` puis `_combined_departments` dans
# `market.py` : une région filtre comme l'union des départements qu'elle
# recouvre.
def test_filters_by_region_through_the_route(client, key, session):
    car(session, "1", department="75")  # Île-de-France
    car(session, "2", department="13")  # PACA
    body = client.get(
        "/v1/market", params={"region": "ile-de-france"}, headers=auth(key)
    ).json()
    assert [i["site_id"] for i in body["items"]] == ["1"]


# Fait rougir `departments.update(found)` sur sa forme répétable : plusieurs
# régions se combinent en « ou », comme `fuel`/`department`.
def test_region_filter_accepts_several_values(client, key, session):
    car(session, "1", department="75")  # Île-de-France
    car(session, "2", department="13")  # PACA
    car(session, "3", department="69")  # Auvergne-Rhône-Alpes
    body = client.get(
        "/v1/market", params={"region": ["ile-de-france", "paca"]}, headers=auth(key)
    ).json()
    assert {i["site_id"] for i in body["items"]} == {"1", "2"}


# Fait rougir `sorted(set(dept) & set(reg))` dans `market._combined_departments` :
# région et département donnés ensemble filtrent en « et », pas en « ou ».
def test_region_and_department_filters_intersect(client, key, session):
    car(session, "1", department="75")  # Paris, Île-de-France
    car(session, "2", department="92")  # Hauts-de-Seine, Île-de-France
    body = client.get(
        "/v1/market", params={"region": "ile-de-france", "department": "75"},
        headers=auth(key),
    ).json()
    assert [i["site_id"] for i in body["items"]] == ["1"]


# Même ligne, sur l'intersection vide : aucun département demandé ne tombe
# dans la région demandée — zéro résultat, jamais le filtre ignoré.
def test_region_and_department_filters_with_no_overlap_yield_nothing(client, key, session):
    car(session, "1", department="75")  # Île-de-France, pas la Corse
    body = client.get(
        "/v1/market", params={"region": "corse", "department": "75"}, headers=auth(key),
    ).json()
    assert body["items"] == []


# Prouve la composition avec un filtre déjà existant : région et carburant se
# combinent en « et », comme tout le reste des filtres du marché.
def test_region_combined_with_fuel_filter(client, key, session):
    car(session, "1", department="75", fuel="diesel")
    car(session, "2", department="75", fuel="essence")
    car(session, "3", department="13", fuel="diesel")
    body = client.get(
        "/v1/market", params={"region": "ile-de-france", "fuel": "diesel"},
        headers=auth(key),
    ).json()
    assert [i["site_id"] for i in body["items"]] == ["1"]


# Fait rougir `if found is None: raise HTTPException(422, ...)` dans
# `market._region_departments` : un identifiant de région inconnu est rejeté,
# jamais un filtre muet qui ne rend jamais rien.
def test_an_unrecognizable_region_filter_value_is_a_422(client, key):
    assert client.get(
        "/v1/market", params={"region": "atlantide"}, headers=auth(key)
    ).status_code == 422
