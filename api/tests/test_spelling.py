"""L'orthographe d'affichage : la table des marques, la règle des modèles.

Les cas sont tirés de la base réelle (52 956 annonces, mesurée le 2026-09-19,
voir `.superpowers/recherche-lot1.md`) : leboncoin écrit « Bmw », « Citroen »,
« Ds », « Tt », « Serie 1 » — sa typographie, pas le nom des voitures.
"""

from adscope_api import spelling
from adscope_api.spelling import brand, fold, model


# Fait rougir `_SPACES.sub(" ", without_marks.lower()).strip()` dans `fold`.
def test_fold_drops_case_accents_and_doubled_spaces():
    assert fold("  Citroën   C3  ") == "citroen c3"


# Fait rougir `_BRANDS.get(fold(tidy), tidy)` : les 83 plis de marque sont une
# liste fermée, et c'est elle qui porte l'orthographe — pas le corpus.
def test_a_brand_takes_its_official_french_spelling():
    assert [brand(v) for v in ("Bmw", "BMW", "Citroen", "Ds", "Mclaren")] == [
        "BMW", "BMW", "Citroën", "DS", "McLaren",
    ]


# Fait rougir le défaut de `.get` : une marque encore jamais vue se rend telle
# qu'observée. `recanonize.py --all` la rattrape dès qu'on l'ajoute au fichier.
def test_a_brand_the_table_does_not_know_is_kept_as_observed():
    assert brand("Rimac") == "Rimac"


# Fait rougir `w.upper() if _DIGIT.search(w)` dans `model` : les modèles sont
# ouverts (709 et ce n'est pas fini), donc une règle et non une liste.
def test_a_model_word_that_carries_a_digit_goes_to_capitals():
    assert [model(v) for v in ("Xc90", "Sq5", "Mx-5", "2cv", "C3")] == [
        "XC90", "SQ5", "MX-5", "2CV", "C3",
    ]


# Fait rougir `" ".join(... for w in tidy.split(" "))` : la règle est mot à mot.
# Sur la chaîne entière, « Abarth 500 » deviendrait « ABARTH 500 » et
# « 812 Superfast » « 812 SUPERFAST ».
def test_a_word_without_a_digit_is_untouched_beside_one_that_has_one():
    assert model("Abarth 500") == "Abarth 500"
    assert model("812 Superfast") == "812 Superfast"


# Fait rougir `known = _MODELS.get(fold(tidy))` et son `return` : l'exception
# passe avant la règle. Sans elle, « Ds3 » donnerait « DS3 » (l'espace officiel
# manque), « I30 » donnerait « I30 » et « GTC4Lusso » « GTC4LUSSO ».
def test_an_exception_beats_the_digit_rule():
    assert [model(v) for v in ("Ds3", "I30", "GTC4Lusso", "Rav 4")] == [
        "DS 3", "i30", "GTC4Lusso", "RAV4",
    ]


# Fait rougir la même ligne pour les sigles et les accents, que la règle du
# chiffre n'atteint pas : « Tt » n'a pas de chiffre, « Megane » non plus.
def test_an_exception_carries_the_sigles_and_the_accents():
    assert [model(v) for v in ("Tt", "Ax", "Megane", "Serie 1", "Mito")] == [
        "TT", "AX", "Mégane", "Série 1", "MiTo",
    ]


# Fait rougir `_flattened` : le fichier range les exceptions par raison pour
# qu'on les relise, le code les aplatit en une table. Sans l'aplatissement,
# aucune exception ne se trouve.
def test_the_groups_of_the_file_are_only_there_to_be_read():
    assert spelling._MODELS["megane"] == "Mégane"
    assert not [ply for ply in spelling._MODELS if ply.startswith("_")]


# Fait rougir `_MODELS.get(fold(tidy))` puis la règle : un modèle qui n'est ni
# l'un ni l'autre se rend tel qu'observé. On ne devine pas une orthographe.
def test_a_model_that_is_neither_exception_nor_rule_is_kept_as_observed():
    assert model("Captur") == "Captur"
    assert model("XCeed") == "XCeed"


# Fait rougir `_tidy` : rien à écrire quand il n'y a rien, et les espaces en
# trop ne font pas un mot vide que la règle mettrait en capitales.
def test_nothing_written_stays_nothing():
    assert brand(None) is model(None) is None
    assert brand("   ") is model("  ") is None
    assert model("  Classe   A ") == "Classe A"
