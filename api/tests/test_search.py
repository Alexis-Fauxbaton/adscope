"""`?q=` et les filtres de famille, sur la couche canonique.

Le constat mesuré le 2026-09-18 : `brand=ferrari` rendait 0 et `brand=Ferrari`
390. Ces tests tiennent le contrat qui le corrige — casse, accents, mots dans
le désordre, et la famille comparée à la clé canonique — pliée des deux côtés,
donc insensible à une correction d'orthographe.

Pas d'horloge réelle : `NOW` est posé à la main, comme dans `test_market.py`.
"""

from datetime import datetime, timezone

from adscope_api import spelling
from adscope_api.auth import resolve
from adscope_api.market_items import item_of
from adscope_api.market_query import market_page
from adscope_api.models import Listing, PricePoint
from adscope_api.taxonomy import derive

from conftest import auth

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)


def car(session, site_id, *, brand="Renault", model="Clio", version=None,
        seller_type=None, published=None, prices=()):
    row = Listing(site="lbc", site_id=site_id, first_seen=NOW, last_seen=NOW,
                  observations=1, brand=brand, model=model, version=version,
                  seller_type=seller_type, published_at=published)
    row.prices = [
        PricePoint(observed_at=at, price=price, source="user", confirmation=False)
        for at, price in prices
    ]
    # Ce que `observations.record` fait à l'écriture.
    derive(row)
    session.add(row)
    session.commit()
    return row


def found(session, key, **kw):
    total, rows = market_page(session, resolve(session, key), NOW, **kw)
    return total, sorted(item_of(r)["site_id"] for r in rows)


def a_ferrari(session, site_id="f1"):
    return car(session, site_id, brand="Ferrari", model="Autres", version="458 Italia")


# Fait rougir `fold(q)` dans `search.text` : c'est le bug mesuré le 2026-09-18,
# `brand=ferrari` rendait 0 et `brand=Ferrari` 390 sur la base réelle.
def test_the_three_writings_of_a_word_find_the_same_thing(session, key):
    a_ferrari(session)
    counts = {found(session, key, q=q)[0] for q in ("ferrari", "FERRARI", "Ferrari")}
    assert counts == {1}


# Fait rougir `for word in fold(q).split()` : la saisie est découpée, et chaque
# mot doit se retrouver — l'ordre est libre.
def test_the_words_may_come_in_any_order(session, key):
    car(session, "lr", brand="Land Rover", model="Discovery")
    assert found(session, key, q="land rover")[1] == ["lr"]
    assert found(session, key, q="rover land")[1] == ["lr"]


# Fait rougir la même ligne : un mot de trop et rien ne sort. Sans le `for`,
# un `LIKE` sur la phrase entière laisserait passer « land discovery ».
def test_a_word_that_is_nowhere_finds_nothing(session, key):
    car(session, "lr", brand="Land Rover", model="Discovery")
    assert found(session, key, q="land ferrari") == (0, [])


# Fait rougir `fold` dans `search_text` *et* dans `search.text` : les deux
# côtés doivent plier de la même façon, sinon l'accent ne se rejoint jamais.
def test_an_accent_typed_or_not_finds_the_same_thing(session, key):
    car(session, "c3", brand="Citroen", model="C3")
    assert found(session, key, q="citroën c3") == found(session, key, q="citroen c3")
    assert found(session, key, q="citroën c3")[1] == ["c3"]


# Fait rougir la boucle sur les formes *observées* de `search_text` : la même
# voiture existe sous « Chevrolet / Corvette » et sous « Corvette / Autres »,
# et une recherche doit rendre les deux classements.
def test_a_search_finds_both_classifications_of_the_same_car(session, key):
    car(session, "chev", brand="Chevrolet", model="Corvette")
    car(session, "corv", brand="Corvette", model="Autres")
    car(session, "clio", brand="Renault", model="Clio")
    assert found(session, key, q="corvette") == (2, ["chev", "corv"])


# Fait rougir `if brand:` / `if model:` dans `search.family` : `q` se combine,
# il ne remplace rien.
def test_the_search_combines_with_the_other_filters(session, key):
    old = NOW.replace(year=2025)
    car(session, "old-pro", brand="Ferrari", model="Autres", version="458",
        seller_type="pro", published=old)
    car(session, "old-priv", brand="Ferrari", model="Autres", version="458",
        seller_type="private", published=old)
    car(session, "young", brand="Ferrari", model="Autres", version="458",
        seller_type="pro", published=NOW)
    assert found(session, key, q="ferrari", min_age_days=90)[1] == ["old-priv", "old-pro"]
    assert found(session, key, q="ferrari", seller_type="pro")[1] == ["old-pro", "young"]
    assert found(
        session, key, q="ferrari", min_age_days=90, seller_type="pro"
    )[1] == ["old-pro"]


def test_the_search_combines_with_dropped(session, key):
    later = NOW.replace(day=19)
    car(session, "down", brand="Ferrari", model="Autres", version="458",
        prices=((NOW, 200000), (later, 190000)))
    car(session, "up", brand="Ferrari", model="Autres", version="458",
        prices=((NOW, 200000), (later, 210000)))
    assert found(session, key, q="ferrari", dropped=True)[1] == ["down"]


# Fait rougir `_escaped` dans `search.py` : sans échappement, `?q=%` rendrait
# la base entière et `?q=_` n'importe quelle annonce d'une lettre.
def test_the_like_jokers_are_typed_text_not_jokers(session, key):
    a_ferrari(session)
    assert found(session, key, q="%") == (0, [])
    assert found(session, key, q="_") == (0, [])


def test_a_joker_typed_alongside_a_real_word_still_filters(session, key):
    a_ferrari(session)
    assert found(session, key, q="ferrari%") == (0, [])


# Fait rougir `fold(q).split()` sur l'entrée vide : pas de mot, pas de `where`.
def test_an_empty_search_filters_nothing(session, key):
    a_ferrari(session)
    car(session, "clio")
    assert found(session, key, q="")[0] == found(session, key, q=None)[0] == 2
    assert found(session, key, q="   ")[0] == 2


# Fait rougir `brand_column == brand_key` dans `search.family` : le filtre reste
# exact, mais sur la clé canonique — les 8 « RENAULT » de la base tombent dans
# le même seau que les 10 601 « Renault ».
def test_the_family_filter_is_exact_on_the_canonical_form(session, key):
    car(session, "a", brand="Renault", model="Clio")
    car(session, "b", brand="RENAULT", model="CLIO")
    car(session, "c", brand="Peugeot", model="208")
    assert found(session, key, brand="renault") == (2, ["a", "b"])
    assert found(session, key, brand="Renault", model="clio") == (2, ["a", "b"])


# Fait rougir `key(brand, model)` dans `search.family`, qui traverse l'alias :
# les deux classements de la Corvette rentrent dans la même famille.
def test_the_two_classifications_answer_one_family_filter(session, key):
    car(session, "chev", brand="Chevrolet", model="Corvette")
    car(session, "corv", brand="Corvette", model="Autres")
    car(session, "aveo", brand="Chevrolet", model="Aveo")
    assert found(session, key, brand="Chevrolet", model="Corvette") == (
        2, ["chev", "corv"]
    )


# Fait rougir `if model:` dans `search.family` : `canonical` pose « Corvette »
# en modèle quand on lui donne la marque « Corvette », mais un client qui n'a
# demandé qu'une marque doit avoir toute la marque.
def test_a_brand_alone_never_adds_the_model_the_alias_implies(session, key):
    car(session, "corv", brand="Corvette", model="Autres")
    car(session, "aveo", brand="Chevrolet", model="Aveo")
    assert found(session, key, brand="Corvette") == (2, ["aveo", "corv"])


# Fait rougir `conditional = rule.get("vers_modele_sous_reserve_de_version")`
# dans `taxonomy.canonical`, traversé par `key` puis `search.family` : les deux
# Camaro du seau « Corvette / Autres » (leur version ne dit pas « Corvette »)
# n'entrent plus dans le modèle canonique « Corvette » — la base réelle en
# rendait 57, elle en rend 55.
def test_a_camaro_in_the_corvette_bucket_leaves_the_corvette_family(session, key):
    car(session, "corv", brand="Corvette", model="Autres", version="Corvette C6 6.0 V8")
    car(session, "chev", brand="Chevrolet", model="Corvette")
    car(session, "cam1", brand="Corvette", model="Autres",
        version="Base_Camaro Coupé 6.2 V8 453ch 8AT")
    car(session, "cam2", brand="Corvette", model="Autres", version="1969 Camaro Camaro SS")
    assert found(session, key, brand="Chevrolet", model="Corvette") == (
        2, ["chev", "corv"]
    )


# Fait rougir `key(brand, model)` dans `search.family` : la clé est pliée des
# deux côtés, donc un modèle qui ne figure dans aucune table se filtre quand
# même. Sur la forme d'affichage, `model=captur` rendait 0 des 72 « Captur ».
def test_a_model_no_table_knows_filters_all_the_same(session, key):
    car(session, "capt", brand="Renault", model="Captur")
    car(session, "clio", brand="Renault", model="Clio")
    assert found(session, key, brand="renault", model="captur") == (1, ["capt"])
    assert found(session, key, brand="Renault", model="CAPTUR") == (1, ["capt"])


# Fait rougir `fold(v)` dans `taxonomy.key`, et c'est **la** règle du lot :
# l'orthographe affichée ne change aucun résultat. On remet ici « Citroen » à la
# place de « Citroën » dans la table, après que l'annonce a été écrite : sur la
# forme d'affichage, la clé en base serait « Citroën » et le filtre chercherait
# « Citroen » — zéro annonce sur les 7 184 de la marque.
def test_changing_a_display_spelling_moves_no_listing(session, key, monkeypatch):
    car(session, "c3", brand="Citroen", model="C3")
    monkeypatch.setitem(spelling._BRANDS, "citroen", "Citroen")
    assert found(session, key, brand="Citroën", model="C3") == (1, ["c3"])
    assert found(session, key, brand="Citroen", model="C3") == (1, ["c3"])
    assert found(session, key, q="citroen c3") == (1, ["c3"])


# Fait rougir la même ligne pour le périmètre du marchand : `tracked_families`
# porte la marque telle que le site l'écrivait quand il l'a enregistrée
# (« Citroen »), et le site rappelle ce texte en filtre. Il doit servir les
# annonces que le marché affiche désormais « Citroën C3 ».
def test_a_family_registered_before_the_spelling_change_still_serves(session, key):
    row = car(session, "c3", brand="Citroen", model="C3")
    assert item_of_row(session, key, "c3")["label"] == "Citroën C3"
    assert (row.canon_brand, row.canon_model) == ("citroen", "c3")
    assert found(session, key, brand="Citroen", model="C3") == (1, ["c3"])


def item_of_row(session, key_, site_id):
    total, rows = market_page(session, resolve(session, key_), NOW)
    return next(item_of(r) for r in rows if r.site_id == site_id)


# Fait rougir le montage de `q` dans `market.get_market` : le nom du paramètre
# et son passage jusqu'à `market_page`.
def test_the_route_carries_the_search_parameter(client, key, session):
    a_ferrari(session)
    car(session, "clio")
    body = client.get("/v1/market", params={"q": "FERRARI"}, headers=auth(key)).json()
    assert body["total"] == 1
    assert body["items"][0]["label"] == "Ferrari 458 Italia"
