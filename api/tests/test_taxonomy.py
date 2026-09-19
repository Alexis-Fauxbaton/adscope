"""La couche canonique : une écriture d'affichage, une clé, des mots à chercher.

Les cas sont tirés de la base réelle (52 956 annonces, mesurée le 2026-09-19,
voir `.superpowers/recherche-lot1.md`) : « Chevrolet / Corvette » face à
« Corvette / Autres », les 4 762 annonces sans modèle, les dix marques écrites
de deux façons, et le « Mercedes-Benz » que La Centrale écrit seule.
"""

from adscope_api import spelling
from adscope_api.taxonomy import canonical, derive, key, search_text


class Row:
    """Ce que `derive` connaît d'une annonce : cinq attributs, pas un ORM."""

    def __init__(self, brand=None, model=None, version=None):
        self.brand, self.model, self.version = brand, model, version
        self.canon_brand = self.canon_model = self.search_text = None


# Fait rougir `canon_brand, canon_model = spelled_brand(brand), spelled_model(model)`
# dans `canonical` : l'écriture d'affichage vient de `spelling`, pas du corpus.
def test_the_canonical_form_is_the_official_spelling():
    assert canonical("Bmw", "Serie 1") == ("BMW", "Série 1")


# Fait rougir `table.get` de `spelling` traversé par `canonical` : la base porte
# « Renault » 10 601 fois et « RENAULT » 8 fois, un seul seau.
def test_the_two_writings_of_a_brand_reach_the_same_canonical_form():
    assert canonical("RENAULT", "CLIO") == canonical("Renault", "Clio") == (
        "Renault", "Clio"
    )


# Fait rougir `canon_brand = rule["vers_marque"]` dans `canonical` : leboncoin
# classe la même voiture sous « Chevrolet / Corvette » (34) et sous
# « Corvette / Autres » (23).
def test_the_brand_that_is_a_model_of_another_brand_is_aliased():
    assert canonical("Corvette", "Autres") == ("Chevrolet", "Corvette")


# Fait rougir la même ligne sur l'alias neuf : La Centrale écrit
# « Mercedes-Benz » (1), leboncoin « Mercedes » (1 974). Une seule marque.
def test_the_two_names_of_mercedes_reach_the_same_brand():
    assert canonical("Mercedes-Benz", "Classe A") == ("Mercedes", "Classe A")


# Fait rougir `if rule["vers_modele"] and canon_model in (None, UNKNOWN)` : un
# alias comble un modèle absent, il n'en écrase jamais un que le site a donné.
def test_an_alias_never_overwrites_a_model_the_site_gave():
    assert canonical("Corvette", "Stingray") == ("Chevrolet", "Stingray")


# Fait rougir `canonical` sur l'alias sans modèle : « Buic » (2) et « Buick »
# (1) sont la même marque saisie deux fois, et le modèle n'a pas à bouger.
def test_an_alias_without_a_model_leaves_the_model_alone():
    assert canonical("Buic", "Autres") == ("Buick", "Autres")


# Fait rougir `fold(v)` dans `key` : c'est la clé qui va en base et que les
# filtres comparent, et elle est pliée des deux côtés.
def test_the_key_is_the_canonical_form_folded():
    assert key("Citroën", "C3") == key("CITROEN", "c3") == ("citroen", "c3")


# Fait rougir la même ligne, et c'est la règle du lot : **corriger une
# orthographe ne déplace aucune annonce.** On remet ici « Citroen » à la place
# de « Citroën » dans la table ; l'affichage change, la clé non.
def test_changing_a_display_spelling_never_changes_a_key(monkeypatch):
    before = key("Citroen", "C3")
    monkeypatch.setitem(spelling._BRANDS, "citroen", "Citroen")
    assert canonical("Citroen", "C3") == ("Citroen", "C3")
    assert key("Citroen", "C3") == before == ("citroen", "c3")


# Fait rougir `None if v is None else fold(v)` : une annonce sans modèle garde
# une clé de modèle nulle, elle ne tombe pas dans le seau de la chaîne vide.
def test_a_missing_model_keeps_an_empty_key():
    assert key("Ferrari", None) == ("ferrari", None)


# Fait rougir la boucle `for value in (brand, model, version, canon_brand,
# canon_model)` de `search_text` : sans les formes *observées*, `q=corvette` ne
# trouverait plus les 23 annonces que l'alias a versées chez Chevrolet.
def test_search_text_keeps_the_observed_form_as_well_as_the_canonical_one():
    assert set(search_text("Corvette", "Autres", None).split()) == {
        "corvette", "autres", "chevrolet",
    }


# Fait rougir la même boucle du côté canonique : le modèle observé « Ds3 » et le
# modèle canonique « DS 3 » ne se découpent pas en les mêmes mots, et les deux
# saisies doivent trouver.
def test_search_text_carries_the_model_written_with_and_without_its_space():
    words = set(search_text("Ds", "Ds3", None).split())
    assert {"ds3", "ds", "3"} <= words


# Fait rougir `words[word] = None` : un dictionnaire, donc dédoublonné et dans
# l'ordre — « Clio Clio 1.5 dCi » n'écrit pas « clio » deux fois.
def test_search_text_says_each_word_once_in_the_order_seen():
    assert search_text("Renault", "Clio", "Clio 1.5 dCi") == "renault clio 1.5 dci"


# Fait rougir `fold(value)` dans `search_text` : ce qui entre en base est déjà
# plié, Postgres n'a ni `unaccent` ni `pg_trgm` à faire.
def test_search_text_is_already_folded():
    assert search_text("Citroën", "C3", None) == "citroen c3"


# Fait rougir `.replace("_", " ")` dans `search_text` : le souligné de leboncoin
# est un séparateur de mots, comme pour `naming._WORDS`. Sans lui, 3 350
# annonces porteraient « exclusive_c4 » pour un mot, et `?q=_` en rendrait
# 3 350 au lieu de rien.
def test_the_underscore_leboncoin_glues_with_is_a_word_boundary_here_too():
    assert search_text("Citroen", "C4 Picasso", "Exclusive_C4 Picasso BlueHDi") == (
        "citroen c4 picasso exclusive bluehdi"
    )


# Fait rougir `brand, model = key(listing.brand, listing.model)` dans `derive` :
# ce sont les clés qui vont en base, jamais l'orthographe affichée — sans quoi
# corriger le fichier déplacerait 7 184 Citroën.
def test_derive_lays_the_folded_key_on_a_listing():
    row = Row("CITROEN", "Ds3", "DS 3 1.6 BlueHDi")
    assert derive(row) is True
    assert (row.canon_brand, row.canon_model) == ("citroen", "ds 3")
    assert row.search_text == "citroen ds3 ds 3 1.6 bluehdi"


# Fait rougir `return before != (brand, model, text)` : `recanonize.py` compte
# ce qu'il a changé, et rejoué sur une base à jour il ne change rien.
def test_derive_says_when_it_changed_nothing():
    row = Row("Renault", "Clio", None)
    assert derive(row) is True
    assert derive(row) is False
