from datetime import datetime, timezone

from adscope_api.market_params import MarketParams
from adscope_api.models import Listing
from adscope_api.sweep_url import translate
from adscope_api.taxonomy import derive

NOW = datetime(2026, 9, 18, tzinfo=timezone.utc)


def listing(session, site_id, *, brand, model, site="lbc"):
    row = Listing(site=site, site_id=site_id, first_seen=NOW, last_seen=NOW,
                  observations=1, brand=brand, model=model)
    derive(row)
    session.add(row)
    session.commit()
    return row


def params(**kw):
    return MarketParams(**kw)


# L'écriture relevée par Alexis sur une URL du site (2026-09-22) :
# `u_car_brand=Tesla,TESLA&u_car_model=TESLA_Model%20Y`. Fait rougir
# `f"{brand},{brand.upper()}"`, `f"{brand.upper()}_{model}"` et le
# `quote_via=quote` (un `+` à la place de `%20` rend zéro résultat).
def test_brand_and_model_are_written_as_the_site_writes_them(session):
    listing(session, "1", brand="Tesla", model="Model Y")
    url, unmapped, skip, missing = translate(session, params(brand="Tesla", model="Model Y"))
    assert "u_car_brand=Tesla,TESLA" in url and "u_car_model=TESLA_Model%20Y" in url
    assert "+" not in url
    assert (unmapped, skip, missing) == ([], None, [])


# Fait rougir l'usage de `listings.brand` (au lieu de `canon_brand`) pour le
# paramètre émis : le filtre est canonique, l'URL doit porter l'écriture du
# site.
def test_the_url_carries_the_site_spelling_not_the_canonical_filter(session):
    listing(session, "1", brand="Renault", model="Clio")
    url, *_ = translate(session, params(brand="renault", model="clio"))
    assert "u_car_brand=Renault,RENAULT" in url


# Fait rougir `order_by(func.count().desc())` : la majorité des lignes
# tranche l'écriture, pas la première rencontrée.
def test_the_majority_spelling_wins_over_a_minority_variant(session):
    for i in range(10):
        listing(session, f"r{i}", brand="Renault", model="Clio")
    for i in range(2):
        listing(session, f"R{i}", brand="RENAULT", model="Clio")
    url, *_ = translate(session, params(brand="renault", model="clio"))
    assert "u_car_brand=Renault,RENAULT" in url


# Fait rougir le garde `if not params.brand or not params.model` sur la
# marque : sans marque, la recherche est trop large pour être traduite.
def test_no_brand_is_too_wide(session):
    url, unmapped, skip, missing = translate(session, params(model="Clio"))
    assert (url, skip, missing) == (None, "trop_large", ["brand"])


# Même garde côté modèle.
def test_no_model_is_too_wide(session):
    url, unmapped, skip, missing = translate(session, params(brand="Renault"))
    assert (url, skip, missing) == (None, "trop_large", ["model"])


# Fait rougir le garde `if params.q`.
def test_free_text_search_is_refused(session):
    url, unmapped, skip, missing = translate(session, params(q="break"))
    assert (url, skip) == (None, "texte_libre")


# Fait rougir la table inverse `FUEL_CODES` + le tri : deux carburants
# connus rendent leurs codes triés et joints par une virgule.
def test_known_fuels_become_sorted_codes(session):
    listing(session, "1", brand="Peugeot", model="208")
    url, unmapped, skip, missing = translate(
        session, params(brand="Peugeot", model="208", fuel=["essence", "diesel"])
    )
    assert "fuel=1,2" in url and unmapped == []


# Fait rougir la branche « un code manquant retire le paramètre entier » :
# l'éthanol n'a pas de code leboncoin, le paramètre `fuel` disparaît plutôt
# que de filtrer plus étroit que la recherche.
def test_an_untranslatable_fuel_drops_the_whole_parameter(session):
    listing(session, "1", brand="Peugeot", model="208")
    url, unmapped, skip, missing = translate(
        session, params(brand="Peugeot", model="208", fuel=["ethanol"])
    )
    assert "fuel=" not in url and unmapped == ["fuel"]


# Fait rougir la ligne `owner_type`.
def test_seller_type_becomes_owner_type(session):
    listing(session, "1", brand="Peugeot", model="208")
    url, *_ = translate(session, params(brand="Peugeot", model="208", seller_type="pro"))
    assert "owner_type=pro" in url


# Fait rougir le `or "max"` de la borne haute absente.
def test_a_missing_price_max_becomes_the_max_keyword(session):
    listing(session, "1", brand="Peugeot", model="208")
    url, *_ = translate(session, params(brand="Peugeot", model="208", price_min=5000))
    assert "price=5000-max" in url


# Fait rougir `params.year_min if ... is not None else 1900` : une borne à
# zéro (`year_min=0`, acceptée par `MarketParams`, `ge=0`) ne doit pas se lire
# comme absente et retomber sur 1900.
def test_a_year_min_of_zero_is_not_silently_dropped(session):
    listing(session, "1", brand="Peugeot", model="208")
    url, *_ = translate(session, params(brand="Peugeot", model="208", year_min=0, year_max=2020))
    assert "regdate=0-2020" in url


# Fait rougir l'appel à `market_filters.combined` : sans lui, une région
# seule (sans département explicite) ne rendrait aucun `locations`.
def test_department_and_region_combine_into_locations(session):
    listing(session, "1", brand="Peugeot", model="208")
    url, *_ = translate(session, params(brand="Peugeot", model="208", region=["bretagne"]))
    assert "locations=d_22,d_29,d_35,d_56" in url


# Fait rougir les quatre littéraux fixes du gabarit.
def test_the_url_carries_the_fixed_literals(session):
    listing(session, "1", brand="Peugeot", model="208")
    url, *_ = translate(session, params(brand="Peugeot", model="208"))
    assert "category=2" in url and "sort=price" in url and "order=asc" in url and "page=1" in url
