"""Le vocabulaire des modèles connus : comment il se bâtit, et son cache.

Pas d'horloge réelle : le cache reçoit l'instant en argument, et les tests le
font avancer à la main.
"""

from datetime import timedelta

from adscope_api.inference import infer_model
from adscope_api.model_vocabulary import Cache, load, vocabulary
from adscope_api.models import Listing

from conftest import NOW


def rows(*triples):
    return list(triples)


# Fait rougir `kept = {pair for pair, n in counted.items() if n >= min_listings}` :
# l'effectif minimal. À une annonce, « Golf Plus » entre dans le vocabulaire et
# rafle 17 déductions à « Golf » — mesuré sur la base réelle.
def test_a_model_seen_once_does_not_enter_the_vocabulary():
    known = vocabulary(rows(("volkswagen", "golf plus", "Golf Plus 1.6 TDI")),
                       min_listings=3)
    assert known.of("volkswagen") == frozenset()


def test_a_model_seen_enough_times_enters_it():
    known = vocabulary(
        rows(*[("volkswagen", "golf", "Golf 1.6 TDI")] * 3), min_listings=3
    )
    assert known.of("volkswagen") == frozenset({"golf"})


# Fait rougir `by_brand[brand].add(model)` : le vocabulaire est rangé par
# marque, et `of` d'une marque inconnue rend un ensemble vide plutôt qu'une
# erreur — `derive` passe sur des annonces sans marque.
def test_an_unknown_brand_has_an_empty_vocabulary():
    known = vocabulary(rows(*[("renault", "clio", "Clio IV 1.5")] * 3))
    assert known.of("ferrari") == frozenset()
    assert known.of(None) == frozenset()


# Fait rougir `if len(pairs) >= min_qualifier_models` : un mot qui ne suit
# qu'un seul modèle est un nom de modèle composé, pas une carrosserie. Sans ce
# seuil, « sport » passait et 69 Range Rover Sport devenaient des Range Rover.
def test_a_word_attached_to_a_single_model_is_not_a_qualifier():
    known = vocabulary(
        rows(*[("land rover", "range rover", "Range Rover Sport 3.0 TDV6")] * 3),
        min_listings=3, min_qualifier_models=4,
    )
    assert "sport" not in known.qualifiers


# Fait rougir `followers[words[start + length]].add((brand, model))` : c'est le
# nombre de **couples** (marque, modèle) qui compte, pas le nombre d'annonces.
# « Break » suit 23 modèles différents sur la base réelle ; c'est ce qui en
# fait une carrosserie et non un nom.
def test_a_word_shared_by_enough_models_becomes_a_qualifier():
    known = vocabulary(
        rows(("mercedes", "classe c", "Classe C Break 220 CDI"),
             ("mercedes", "classe e", "Classe E Break 270 CDI"),
             ("peugeot", "308", "308 Break 1.6 HDi"),
             ("renault", "megane", "Megane Break 1.5 dCi")),
        min_listings=1, min_qualifier_models=4,
    )
    assert "break" in known.qualifiers


# Fait rougir `if (brand, model) not in kept: continue` : un modèle écarté par
# l'effectif ne vote pas non plus sur le vocabulaire des qualificatifs.
def test_a_model_below_the_threshold_does_not_vote_on_qualifiers():
    known = vocabulary(
        rows(("mercedes", "classe c", "Classe C Break 220"),
             ("mercedes", "classe e", "Classe E Break 270"),
             ("peugeot", "308", "308 Break 1.6"),
             ("renault", "megane", "Megane Break 1.5")),
        min_listings=2, min_qualifier_models=4,
    )
    assert "break" not in known.qualifiers


# Fait rougir `if length and start + length < len(words)` : le mot suivant
# n'existe que s'il y en a un. Une version réduite au modèle n'ajoute rien au
# vocabulaire — et surtout ne fait pas planter la construction.
def test_a_version_reduced_to_the_model_adds_no_qualifier():
    known = vocabulary(rows(*[("fiat", "punto", "Punto")] * 3), min_listings=3)
    assert known.qualifiers == frozenset()


def listing(session, site_id, brand, model, version, canon_model=None):
    row = Listing(
        site="lbc", site_id=site_id, first_seen=NOW, last_seen=NOW, observations=1,
        brand=brand, model=model, version=version,
        canon_brand=None if brand is None else brand.lower(),
        canon_model=canon_model if canon_model is not None
        else (None if model is None else model.lower()),
    )
    session.add(row)
    return row


# Fait rougir `if fold(model) == unknown: continue` dans `load` : le seau
# « Autres » n'est pas un modèle, et il ne doit jamais entrer dans le
# vocabulaire — sinon une « Autres » en autoriserait une autre. L'assertion
# porte sur une absence et non sur un ensemble vide : depuis le lot 3b, `load`
# verse aussi les modèles créés du fichier partagé (`model_catalog`), et
# Renault en a cinq.
def test_the_unknown_bucket_is_not_a_known_model(session):
    for n in range(3):
        listing(session, f"a{n}", "Renault", "Autres", "Grand Scenic 1.9 dCi")
    session.commit()
    assert "autres" not in load(session).of("renault")


# Fait rougir `select(Listing.brand, Listing.model, ...)` — les colonnes
# **observées**. C'est là qu'est le garde-fou contre l'auto-renforcement : une
# annonce dont le modèle a été **déduit** porte « Autres » en `model` et sa clé
# en `canon_model`. Si `load` lisait la couche canonique, nos propres
# déductions élargiraient le vocabulaire et une erreur en engendrerait d'autres.
def test_a_deduced_model_never_feeds_the_vocabulary_back(session):
    for n in range(3):
        listing(session, f"b{n}", "Renault", "Autres",
                "Grand Scenic 1.9 dCi 130ch", canon_model="grand scenic")
    session.commit()
    assert "grand scenic" not in load(session).of("renault")


# Fait rougir `if brand_key and model_key` dans `load` : une annonce sans
# modèle du tout n'apprend rien. Sans ce garde-fou, trois annonces de la même
# marque font entrer `None` dans le vocabulaire de Renault — et `infer_model`
# appellerait `None.replace`.
def test_a_listing_without_a_model_teaches_nothing(session):
    for n in range(3):
        listing(session, f"c{n}", "Renault", None, "Clio IV 1.5 dCi")
    session.commit()
    assert None not in load(session).of("renault")
    assert "clio" not in load(session).of("renault")


def filled(session, count=3):
    for n in range(count):
        listing(session, f"d{n}", "Citroen", "Xsara", "Xsara 2.0 HDi90 Exclusive")
    session.commit()


# Fait rougir `with_catalog(...)` dans `load` : sans lui, les 82 modèles que
# `shared/vehicle-aliases.json` crée n'atteignent jamais la production, et tout
# le lot 3b reste sur l'étagère. Aucune Mercedes dans cette base, et « GLE » y
# est quand même déductible.
def test_the_shared_file_reaches_the_vocabulary_through_load(session):
    filled(session)
    known = load(session)
    assert "gle" in known.of("mercedes")
    assert infer_model("mercedes", "GLE Coupé 350 e 211+136ch", known) == "gle"


# Fait rougir `if self._known is None or ...` : le premier appel lit la base.
def test_the_cache_loads_on_the_first_call(session):
    filled(session)
    assert "xsara" in Cache().get(session, NOW).of("citroen")


# Fait rougir `self._known = load(session)` gardé par le `if` : entre deux
# lectures le cache sert ce qu'il a, sans requête. Sept mille observations par
# jour ne rejouent pas sept mille agrégats sur 53 000 lignes.
def test_within_the_ttl_the_cache_does_not_read_the_base_again(session):
    filled(session)
    cache = Cache(ttl=timedelta(minutes=10))
    cache.get(session, NOW)
    for n in range(3):
        listing(session, f"e{n}", "Citroen", "Saxo", "Saxo 1.0 5p")
    session.commit()
    assert "saxo" not in cache.get(session, NOW + timedelta(minutes=9)).of("citroen")


# Fait rougir `now - self._loaded_at >= self._ttl` : passé le délai, le
# vocabulaire se relit — un modèle neuf entre dans les dix minutes.
def test_past_the_ttl_the_cache_reads_the_base_again(session):
    filled(session)
    cache = Cache(ttl=timedelta(minutes=10))
    cache.get(session, NOW)
    for n in range(3):
        listing(session, f"f{n}", "Citroen", "Saxo", "Saxo 1.0 5p")
    session.commit()
    assert "saxo" in cache.get(session, NOW + timedelta(minutes=10)).of("citroen")


# Fait rougir `self._loaded_at = now` : sans lui, le second rechargement se
# compare à l'instant du premier et le cache relirait la base à chaque appel.
def test_a_reload_resets_the_clock_it_compares_against(session):
    filled(session)
    cache = Cache(ttl=timedelta(minutes=10))
    cache.get(session, NOW)
    cache.get(session, NOW + timedelta(minutes=10))
    for n in range(3):
        listing(session, f"g{n}", "Citroen", "Saxo", "Saxo 1.0 5p")
    session.commit()
    assert "saxo" not in cache.get(session, NOW + timedelta(minutes=15)).of("citroen")


# Le vocabulaire lu en base sert bien la déduction, bout en bout : quatre
# modèles suivis de « 2.0 » en font une motorisation, et la Xsara se déduit.
def test_what_the_base_teaches_is_what_the_deduction_uses(session):
    filled(session)
    for n, (brand, model) in enumerate(
        [("Peugeot", "307"), ("Renault", "Laguna"), ("Opel", "Astra")] * 3
    ):
        listing(session, f"h{n}", brand, model, f"{model} 2.0 HDi 110ch")
    session.commit()
    known = load(session)
    assert "2.0" in known.qualifiers
    assert infer_model("citroen", "Xsara 2.0 HDi90 Exclusive 5p", known) == "xsara"
