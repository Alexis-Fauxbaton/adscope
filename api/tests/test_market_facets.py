"""`/v1/market/facets` : la cascade du site, chaque facette comptée sans son
propre filtre (`market_query.core`, `exclude`). Un test par facette prouve la
règle : filtrer dessus ne vide pas sa propre liste, `total` seul applique
tout — voir `market_facets.py` et `facet_query.py`."""

from datetime import datetime, timedelta, timezone

from adscope_api.models import Listing, PricePoint
from adscope_api.taxonomy import derive

from conftest import auth

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)


def car(session, site_id, *, brand="Renault", model="Clio", year=2015, mileage=None,
        published=None, seller_type=None, fuel=None, gearbox=None, department=None,
        disappeared_at=None, prices=()):
    row = Listing(site="lbc", site_id=site_id, first_seen=NOW, last_seen=NOW, observations=1,
                  brand=brand, model=model, year=year, mileage=mileage, published_at=published,
                  seller_type=seller_type, fuel=fuel, gearbox=gearbox, department=department,
                  disappeared_at=disappeared_at)
    row.prices = [
        PricePoint(observed_at=NOW, price=price, source="user", confirmation=False)
        for price in prices
    ]
    derive(row)
    session.add(row)
    session.commit()
    return row


def facets(client, key, **params):
    return client.get("/v1/market/facets", params=params, headers=auth(key)).json()


def by_key(items):
    return {item["key"]: item["count"] for item in items}


def test_the_facets_route_needs_a_license(client, session):
    assert client.get("/v1/market/facets").status_code == 401


# Fait rougir le montage de la route et son gabarit de sortie : le contrat
# figé dans `docs/roadmap.md`, lot 4.
def test_the_facets_route_serves_the_contract_shape(client, key, session):
    car(session, "1")
    body = facets(client, key)
    assert set(body.keys()) == {
        "total", "brands", "models", "fuel", "fuel_unknown", "gearbox", "gearbox_unknown",
        "regions", "departments", "location_unknown", "seller_type", "ranges",
    }
    assert set(body["ranges"].keys()) == {"price", "year", "mileage"}
    assert set(body["ranges"]["price"].keys()) == {"min", "max"}


# Fait rougir `Listing.disappeared_at.is_(None)` dans `market_query.core` :
# une annonce disparue ne compte nulle part, comme sur `/v1/market`.
def test_disappeared_listings_are_excluded_from_every_facet(client, key, session):
    car(session, "gone", disappeared_at=NOW)
    car(session, "here")
    body = facets(client, key)
    assert body["total"] == 1
    assert by_key(body["brands"]) == {"renault": 1}


# --- brands ---------------------------------------------------------------

def test_brands_lists_every_brand_sorted_by_count_desc(client, key, session):
    car(session, "1", brand="Renault")
    car(session, "2", brand="Renault")
    car(session, "3", brand="Peugeot")
    body = facets(client, key)
    assert body["brands"] == [
        {"key": "renault", "label": "Renault", "count": 2},
        {"key": "peugeot", "label": "Peugeot", "count": 1},
    ]


# Fait rougir `excluding("brand")` dans `market_facets.get_facets` : filtrer
# sur `brand=Renault` ne doit pas faire disparaître Peugeot de sa facette.
def test_brands_facet_excludes_its_own_filter(client, key, session):
    car(session, "1", brand="Renault")
    car(session, "2", brand="Peugeot")
    body = facets(client, key, brand="Renault")
    assert body["total"] == 1
    assert by_key(body["brands"]) == {"renault": 1, "peugeot": 1}


# Fait rougir le `"model"` de `excluding("brand", "model")` dans
# `market_facets.get_facets` (une facette en cascade ignore aussi ses
# descendants — sans lui, un modèle choisi enfermait dans sa marque, cul-de-sac
# constaté par le lot `web`, `.superpowers/recherche-lot4-web.md`).
def test_brands_facet_also_ignores_the_chosen_model(client, key, session):
    car(session, "1", brand="Renault", model="Clio")
    car(session, "2", brand="Peugeot", model="208")
    body = facets(client, key, brand="Renault", model="Clio")
    assert body["total"] == 1
    assert by_key(body["brands"]) == {"renault": 1, "peugeot": 1}


# --- models -----------------------------------------------------------------

def test_models_is_empty_without_a_brand_chosen(client, key, session):
    car(session, "1", brand="Renault", model="Clio")
    body = facets(client, key)
    assert body["models"] == []


def test_models_lists_models_of_the_chosen_brand(client, key, session):
    car(session, "1", brand="Renault", model="Clio")
    car(session, "2", brand="Renault", model="Clio")
    car(session, "3", brand="Renault", model="208")
    car(session, "4", brand="Peugeot", model="208")
    body = facets(client, key, brand="Renault")
    assert body["models"] == [
        {"key": "clio", "label": "Clio", "count": 2},
        {"key": "208", "label": "208", "count": 1},
    ]


# Fait rougir `named.append(...)` dans `facet_query.models` : le seau
# « Modèle non précisé » vient toujours en dernier, même avec le plus grand
# compte — jamais mêlé au tri par compte décroissant des modèles nommés.
def test_models_puts_unknown_last_regardless_of_its_count(client, key, session):
    car(session, "1", brand="Renault", model="Clio")
    car(session, "2", brand="Renault", model="Autres")
    car(session, "3", brand="Renault", model="Autres")
    car(session, "4", brand="Renault", model="Autres")
    body = facets(client, key, brand="Renault")
    assert [item["key"] for item in body["models"]] == ["clio", "autres"]
    assert body["models"][-1] == {"key": "autres", "label": "Modèle non précisé", "count": 3}


# Fait rougir `k != fold(UNKNOWN)` dans `facet_query.models` : un modèle nul
# (jamais donné) rejoint le même seau qu'un modèle « Autres » déclaré.
def test_models_unknown_bucket_merges_null_and_declared_autres(client, key, session):
    car(session, "1", brand="Renault", model=None)
    car(session, "2", brand="Renault", model="Autres")
    body = facets(client, key, brand="Renault")
    assert body["models"] == [{"key": "autres", "label": "Modèle non précisé", "count": 2}]


# Fait rougir `excluding("model")` : filtrer sur `model=Clio` garde la marque
# choisie mais ne vide pas la liste des autres modèles de cette marque.
def test_models_facet_excludes_its_own_filter(client, key, session):
    car(session, "1", brand="Renault", model="Clio")
    car(session, "2", brand="Renault", model="208")
    body = facets(client, key, brand="Renault", model="Clio")
    assert body["total"] == 1
    assert by_key(body["models"]) == {"clio": 1, "208": 1}


# --- fuel / gearbox -----------------------------------------------------

def test_fuel_lists_known_values_and_counts_unknown_separately(client, key, session):
    car(session, "1", fuel="diesel")
    car(session, "2", fuel="essence")
    car(session, "3", fuel=None)
    body = facets(client, key)
    assert body["fuel"] == [
        {"key": "diesel", "label": "Diesel", "count": 1},
        {"key": "essence", "label": "Essence", "count": 1},
    ]
    assert body["fuel_unknown"] == 1


# Fait rougir `excluding("fuel")` : choisir « diesel » ne vide pas la liste
# des carburants — on doit pouvoir passer à « essence ».
def test_fuel_facet_excludes_its_own_filter(client, key, session):
    car(session, "1", fuel="diesel")
    car(session, "2", fuel="essence")
    body = facets(client, key, fuel="diesel")
    assert body["total"] == 1
    assert by_key(body["fuel"]) == {"diesel": 1, "essence": 1}


def test_gearbox_lists_known_values_and_counts_unknown_separately(client, key, session):
    car(session, "1", gearbox="automatique")
    car(session, "2", gearbox=None)
    body = facets(client, key)
    assert body["gearbox"] == [{"key": "automatique", "label": "Automatique", "count": 1}]
    assert body["gearbox_unknown"] == 1


def test_gearbox_facet_excludes_its_own_filter(client, key, session):
    car(session, "1", gearbox="automatique")
    car(session, "2", gearbox="manuelle")
    body = facets(client, key, gearbox="automatique")
    assert body["total"] == 1
    assert by_key(body["gearbox"]) == {"automatique": 1, "manuelle": 1}


# --- localisation (régions, départements) --------------------------------

def test_regions_and_departments_derive_from_department(client, key, session):
    car(session, "1", department="75")  # Île-de-France
    car(session, "2", department="92")  # Île-de-France
    car(session, "3", department="13")  # PACA
    body = facets(client, key)
    assert body["regions"] == [
        {"key": "ile-de-france", "label": "Île-de-France", "count": 2},
        {"key": "paca", "label": "Provence-Alpes-Côte d'Azur", "count": 1},
    ]
    assert by_key(body["departments"]) == {"75": 1, "92": 1, "13": 1}


# Fait rougir `department_label(k)` dans `facet_query.locations` (mis à la
# place d'un simple `k` sans label) : chaque département porte son nom
# officiel, pas seulement son code.
def test_departments_carry_their_official_name(client, key, session):
    car(session, "1", department="92")
    car(session, "2", department="2A")
    body = facets(client, key)
    assert {"key": "92", "label": "Hauts-de-Seine", "count": 1} in body["departments"]
    assert {"key": "2A", "label": "Corse-du-Sud", "count": 1} in body["departments"]


def test_location_unknown_counts_listings_without_a_department(client, key, session):
    car(session, "1", department="75")
    car(session, "2", department=None)
    body = facets(client, key)
    assert body["location_unknown"] == 1


# Fait rougir `excluding("location")` : filtrer sur une région ne vide pas la
# liste des autres régions.
def test_regions_facet_excludes_its_own_filter(client, key, session):
    car(session, "1", department="75")  # Île-de-France
    car(session, "2", department="13")  # PACA
    body = facets(client, key, region="ile-de-france")
    assert body["total"] == 1
    assert by_key(body["regions"]) == {"ile-de-france": 1, "paca": 1}


# Fait rougir le `"location"` de `regions, departments, location_unknown =
# fq.locations(session, excluding("location"))` (une facette en cascade
# ignore aussi ses descendants) : région *et* département choisis ensemble ne
# doivent pas faire disparaître la Bretagne de la facette des régions.
def test_regions_facet_ignores_both_region_and_department(client, key, session):
    car(session, "1", department="92")  # Île-de-France
    car(session, "2", department="35")  # Bretagne
    body = facets(client, key, region="ile-de-france", department="92")
    assert body["total"] == 1
    assert by_key(body["regions"]) == {"ile-de-france": 1, "bretagne": 1}


def test_departments_facet_excludes_its_own_filter(client, key, session):
    car(session, "1", department="75")
    car(session, "2", department="92")
    body = facets(client, key, department="75")
    assert body["total"] == 1
    assert by_key(body["departments"]) == {"75": 1, "92": 1}


# Fait rougir `excluding(department=location_region_only)` dans
# `market_facets.get_facets` (symétrique de `models` qui garde `brand`) :
# poser une région restreint la liste des départements à ceux de cette
# région, sans que `regions` en soit affectée.
def test_departments_facet_is_restricted_by_region(client, key, session):
    car(session, "1", department="35")  # Bretagne
    car(session, "2", department="75")  # Île-de-France
    body = facets(client, key, region="bretagne")
    assert body["total"] == 1
    assert by_key(body["departments"]) == {"35": 1}
    assert by_key(body["regions"]) == {"bretagne": 1, "ile-de-france": 1}


# --- seller_type ----------------------------------------------------------

def test_seller_type_lists_counts(client, key, session):
    car(session, "1", seller_type="pro")
    car(session, "2", seller_type="private")
    car(session, "3", seller_type="private")
    body = facets(client, key)
    assert by_key(body["seller_type"]) == {"pro": 1, "private": 2}


def test_seller_type_facet_excludes_its_own_filter(client, key, session):
    car(session, "1", seller_type="pro")
    car(session, "2", seller_type="private")
    body = facets(client, key, seller_type="pro")
    assert body["total"] == 1
    assert by_key(body["seller_type"]) == {"pro": 1, "private": 1}


# --- ranges -----------------------------------------------------------------

def test_ranges_report_the_min_and_max_of_the_filtered_set(client, key, session):
    car(session, "1", year=2010, mileage=10000, prices=[8000])
    car(session, "2", year=2020, mileage=90000, prices=[20000])
    body = facets(client, key)
    assert body["ranges"] == {
        "price": {"min": 8000, "max": 20000},
        "year": {"min": 2010, "max": 2020},
        "mileage": {"min": 10000, "max": 90000},
    }


# Fait rougir `excluding("price")` : une fois `price_min` posé, la fourchette
# rendue doit garder le vrai minimum du marché, pas celui déjà filtré.
def test_price_range_excludes_its_own_filter(client, key, session):
    car(session, "1", prices=[8000])
    car(session, "2", prices=[20000])
    body = facets(client, key, price_min=15000)
    assert body["total"] == 1
    assert body["ranges"]["price"] == {"min": 8000, "max": 20000}


def test_year_range_excludes_its_own_filter(client, key, session):
    car(session, "1", year=2010)
    car(session, "2", year=2020)
    body = facets(client, key, year_min=2015)
    assert body["total"] == 1
    assert body["ranges"]["year"] == {"min": 2010, "max": 2020}


def test_mileage_range_excludes_its_own_filter(client, key, session):
    car(session, "1", mileage=10000)
    car(session, "2", mileage=90000)
    body = facets(client, key, mileage_min=50000)
    assert body["total"] == 1
    assert body["ranges"]["mileage"] == {"min": 10000, "max": 90000}


# --- total, et les filtres qu'aucune facette n'exclut ---------------------

# Fait rougir `excluding()` (sans nom) : `total` applique tout, à la
# différence de chaque facette qui s'exclut elle-même.
def test_total_applies_every_filter_including_the_ones_facets_exclude(client, key, session):
    car(session, "1", brand="Renault", fuel="diesel")
    car(session, "2", brand="Renault", fuel="essence")
    car(session, "3", brand="Peugeot", fuel="diesel")
    body = facets(client, key, brand="Renault", fuel="diesel")
    assert body["total"] == 1


# `min_age_days` n'a pas de facette dédiée : il reste appliqué à toutes,
# jamais exclu par aucune.
def test_min_age_days_applies_to_every_facet(client, key, session):
    car(session, "old", brand="Peugeot", published=NOW - timedelta(days=100))
    car(session, "young", brand="Citroen", published=NOW - timedelta(days=1))
    body = facets(client, key, min_age_days=90)
    assert body["total"] == 1
    assert by_key(body["brands"]) == {"peugeot": 1}


# Fait rougir `market_ranges.parse` : la même 422 que `/v1/market`, la route
# des facettes partage le même parseur de bornes.
def test_price_min_greater_than_price_max_is_a_422(client, key):
    response = client.get(
        "/v1/market/facets", params={"price_min": 20000, "price_max": 10000}, headers=auth(key),
    )
    assert response.status_code == 422
