"""La couche canonique : une écriture, un nom propre, des mots à chercher.

Les cas sont tirés de la base réelle (52 925 annonces, mesurée le 2026-09-19,
voir `.superpowers/recherche-lot1.md`) : « Chevrolet / Corvette » face à
« Corvette / Autres », les 15 523 versions qui répètent le modèle, les 4 753
annonces sans modèle, et les dix marques écrites de deux façons.
"""

from adscope_api.taxonomy import canonical, derive, fold, label, search_text


class Row:
    """Ce que `derive` connaît d'une annonce : cinq attributs, pas un ORM."""

    def __init__(self, brand=None, model=None, version=None):
        self.brand, self.model, self.version = brand, model, version
        self.canon_brand = self.canon_model = self.search_text = None


# Fait rougir `_SPACES.sub(" ", without_marks.lower()).strip()` dans `fold`.
def test_fold_drops_case_accents_and_doubled_spaces():
    assert fold("  Citroën   C3  ") == "citroen c3"


# Fait rougir `table.get(fold(value), ...)` dans `_spelled` : la base porte
# « Renault » 10 590 fois et « RENAULT » 8 fois, un seul seau.
def test_the_two_writings_of_a_brand_reach_the_same_canonical_form():
    assert canonical("RENAULT", "CLIO") == canonical("Renault", "Clio") == (
        "Renault", "Clio"
    )


# Fait rougir le défaut de `_spelled` : un pli que le fichier ne connaît pas se
# rend tel qu'observé, sans typographie inventée — d'où « Citroen Ds3 ».
def test_a_spelling_the_file_does_not_know_is_kept_as_observed():
    assert canonical("Citroen", "Ds3") == ("Citroen", "Ds3")


# Fait rougir `canon_brand = rule["vers_marque"]` dans `canonical` : leboncoin
# classe la même voiture sous « Chevrolet / Corvette » (34) et sous
# « Corvette / Autres » (23).
def test_the_brand_that_is_a_model_of_another_brand_is_aliased():
    assert canonical("Corvette", "Autres") == ("Chevrolet", "Corvette")


# Fait rougir `if rule["vers_modele"] and canon_model in (None, UNKNOWN)` : un
# alias comble un modèle absent, il n'en écrase jamais un que le site a donné.
def test_an_alias_never_overwrites_a_model_the_site_gave():
    assert canonical("Corvette", "Stingray") == ("Chevrolet", "Stingray")


# Fait rougir `canonical` sur l'alias sans modèle : « Buic » (2) et « Buick »
# (1) sont la même marque saisie deux fois, et le modèle n'a pas à bouger.
def test_an_alias_without_a_model_leaves_the_model_alone():
    assert canonical("Buic", "Autres") == ("Buick", "Autres")


# Fait rougir `head = [p for p in (...) if p and p != UNKNOWN]` dans `label` :
# 4 753 annonces portent « Autres » pour modèle, il ne s'affiche jamais.
def test_the_unknown_bucket_never_shows_in_a_label():
    assert label("Ferrari", "Autres", None) == "Ferrari"


# Fait rougir `or NO_VEHICLE` dans `label` : 277 annonces n'ont ni marque ni
# modèle, et un item du marché doit tout de même porter un nom.
def test_a_vehicle_with_nothing_known_still_has_a_name():
    assert label("Autres", "Autres", None) == "Véhicule non précisé"


# Fait rougir `_trimmed` : 15 523 versions sur 17 451 répètent le modèle.
def test_the_version_loses_the_model_it_repeats():
    assert label("Chevrolet", "Corvette", "Corvette 6.2 V8 659ch 3LZ Z06 AT8") == (
        "Chevrolet Corvette 6.2 V8 659ch 3LZ Z06 AT8"
    )


# Fait rougir la boucle `while i < len(words)` de `_trimmed` : elle reprend
# après chaque retrait, donc « Corvette Corvette » part en entier — et le
# millésime qui la précède reste.
def test_the_version_loses_every_repetition_not_only_the_first():
    assert label("Chevrolet", "Corvette", "1967 Corvette Corvette 300 ch") == (
        "Chevrolet Corvette 1967 300 ch"
    )


# Fait rougir `if len(head) == 2 and fold(head[0]) == fold(head[1])` : Mini est
# une marque dont le modèle s'appelle Mini, 390 annonces.
def test_a_brand_equal_to_its_model_is_not_said_twice():
    assert label("Mini", "Mini", "Mini Cooper S 192ch Exquisite BVA7") == (
        "Mini Cooper S 192ch Exquisite BVA7"
    )


# Fait rougir `plies = {tuple(fold(v).split()) ...}` dans `_phrases` : les mots
# partent par suite entière, jamais un à un. Sinon « Land Rover » mangerait le
# « Rover » de « Range Rover Evoque » — 90 annonces de la base réelle, sans
# modèle et dont la version commence par « Range Rover ».
def test_a_two_word_brand_does_not_eat_a_word_of_another_name():
    assert label("Land Rover", "Autres", "Range Rover Evoque 2.0 TD4 150 SE BVA") == (
        "Land Rover Range Rover Evoque 2.0 TD4 150 SE BVA"
    )


# Fait rougir `tuple(plies[i:i + len(p)]) == p` dans `_trimmed` : la suite entière
# se compare, donc un modèle de deux mots se retire en entier.
def test_a_two_word_model_the_version_repeats_goes_whole():
    assert label("Land Rover", "Range Rover", "Range Rover Sport 3.0 SDV6") == (
        "Land Rover Range Rover Sport 3.0 SDV6"
    )


# Fait rougir `fold(v) != fold(UNKNOWN)` dans `_phrases` : « Autres » n'est pas
# un nom, il n'a rien à retirer d'une version qui le contient.
def test_the_unknown_bucket_removes_nothing_from_a_version():
    assert label("Autres", "Autres", "Autres 1.6 HDi") == "Autres 1.6 HDi"


# Fait rougir `_WORDS.split(version or "")` dans `_trimmed` : 3 350 versions
# collent la finition au modèle par un souligné, et « C4 Picasso » ne se
# reconnaît pas tant que ce souligné n'est pas un séparateur de mots.
def test_the_underscore_leboncoin_glues_with_is_a_word_boundary():
    assert label("Citroen", "C4 Picasso", "Exclusive_C4 Picasso BlueHDi 150ch") == (
        "Citroen C4 Picasso Exclusive BlueHDi 150ch"
    )


# Fait rougir `" ".join(kept)` dans `_trimmed` : la version d'où tout est parti
# ne doit pas laisser d'espace en trop.
def test_a_version_emptied_of_its_repetitions_leaves_no_gap():
    assert label("Hyundai", "Ioniq", "  Ioniq   Ioniq ") == "Hyundai Ioniq"


def test_a_version_that_repeats_nothing_is_kept_whole():
    assert label("Hyundai", "Ioniq", "Ioniq Electric 136ch Executive 2cv") == (
        "Hyundai Ioniq Electric 136ch Executive 2cv"
    )


# Fait rougir la boucle `for value in (brand, model, version, canon_brand,
# canon_model)` de `search_text` : sans les formes *observées*, `q=corvette` ne
# trouverait plus les 23 annonces que l'alias a versées chez Chevrolet.
def test_search_text_keeps_the_observed_form_as_well_as_the_canonical_one():
    assert set(search_text("Corvette", "Autres", None).split()) == {
        "corvette", "autres", "chevrolet",
    }


# Fait rougir `words[word] = None` : un dictionnaire, donc dédoublonné et dans
# l'ordre — « Clio Clio 1.5 dCi » n'écrit pas « clio » deux fois.
def test_search_text_says_each_word_once_in_the_order_seen():
    assert search_text("Renault", "Clio", "Clio 1.5 dCi") == "renault clio 1.5 dci"


# Fait rougir `fold(value)` dans `search_text` : ce qui entre en base est déjà
# plié, Postgres n'a ni `unaccent` ni `pg_trgm` à faire.
def test_search_text_is_already_folded():
    assert search_text("Citroën", "C3", None) == "citroen c3"


# Fait rougir les trois affectations de `derive` : c'est le seul endroit qui
# écrit les colonnes dérivées, pour l'écriture comme pour le rattrapage.
def test_derive_lays_the_three_columns_on_a_listing():
    row = Row("RENAULT", "CLIO", "Clio IV 1.5 dCi")
    assert derive(row) is True
    assert (row.canon_brand, row.canon_model) == ("Renault", "Clio")
    assert row.search_text == "renault clio iv 1.5 dci"


# Fait rougir `return before != (brand, model, text)` : `recanonize.py` compte
# ce qu'il a changé, et rejoué sur une base à jour il ne change rien.
def test_derive_says_when_it_changed_nothing():
    row = Row("Renault", "Clio", None)
    assert derive(row) is True
    assert derive(row) is False
