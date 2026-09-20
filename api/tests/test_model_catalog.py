"""Ce que `shared/vehicle-aliases.json` ajoute au vocabulaire des sites.

Deux moitiés : la mécanique de `with_catalog`, sur un catalogue écrit ici, et
quelques faits du **vrai** fichier — ceux qui portent le lot 3b et qu'une
relecture distraite pourrait effacer. Aucune horloge, aucune base.
"""

from adscope_api.inference import KnownModels, infer_model
from adscope_api.model_catalog import (
    CREATED, MODEL_ALIASES, WORDS, with_catalog, written_heads,
)

EMPTY = KnownModels(by_brand={}, qualifiers=frozenset())


def sites(**by_brand):
    return KnownModels(by_brand={b: frozenset(m) for b, m in by_brand.items()},
                       qualifiers=frozenset({"1.6"}))


# Fait rougir `by_brand[brand].add(head)` : c'est tout l'apport du lot 3b. Sans
# elle, 840 annonces dont la version nomme un modèle réel restent « Autres »
# parce qu'aucun des deux sites n'a ce modèle dans sa colonne.
def test_a_created_model_joins_the_vocabulary_of_its_brand():
    table = with_catalog(EMPTY, created={("mercedes", "gle"): ("gle", None)},
                         words=frozenset())
    assert "gle" in table.of("mercedes")


# Fait rougir `by_brand[brand] |= set(models)` : le fichier **ajoute**, il ne
# remplace pas. Les 546 modèles que les sites déclarent restent.
def test_what_the_sites_declare_survives_the_catalogue():
    table = with_catalog(sites(citroen=["xsara"]),
                         created={("citroen", "c3 pluriel"): ("c3 pluriel", None)},
                         words=frozenset())
    assert table.of("citroen") == frozenset({"xsara", "c3 pluriel"})


# Fait rougir `renames[(brand, head)] = model` : la tête « Picasso » nomme un
# Xsara Picasso, et c'est ce nom-là qu'il faut poser.
def test_a_head_written_otherwise_becomes_a_rename():
    table = with_catalog(EMPTY,
                         created={("citroen", "picasso"): ("xsara picasso", None)},
                         words=frozenset())
    assert table.renames[("citroen", "picasso")] == "xsara picasso"


# Fait rougir `if model != head` : une tête qui s'écrit comme son modèle n'a
# rien à renommer, et une table de renommages pleine d'identités coûterait une
# recherche pour rien à chaque déduction.
def test_a_head_written_like_its_model_adds_no_rename():
    table = with_catalog(EMPTY, created={("mercedes", "gle"): ("gle", None)},
                         words=frozenset())
    assert table.renames == {}


# Fait rougir `year_max[(brand, head)] = limit` : la condition d'année vit dans
# le fichier, et elle doit arriver jusqu'à `resolved`.
def test_a_year_limit_is_carried_over():
    table = with_catalog(EMPTY,
                         created={("citroen", "picasso"): ("xsara picasso", 2010)},
                         words=frozenset())
    assert table.year_max[("citroen", "picasso")] == 2010
    assert infer_model("citroen", "Picasso 1.6 HDi110", table, 2013) is None


# Fait rougir `qualifiers=known.qualifiers | words` : les mots de carrosserie
# du fichier rejoignent ceux que la mesure a trouvés. Sans eux, « 488 Spider »
# ne serait pas une 488 — la mesure ne peut pas les voir, « Spider » ne suit
# qu'un seul modèle.
def test_the_body_words_of_the_file_join_the_measured_qualifiers():
    table = with_catalog(sites(ferrari=["488"]), created={},
                         words=frozenset({"spider"}))
    assert table.qualifiers == frozenset({"1.6", "spider"})
    assert infer_model("ferrari", "488 Spider V8 3.9 T 670ch", table) == "488"


# Fait rougir la lecture des sections `carrosseries` et `finitions` de
# `_words` : le fichier, lui, les porte bien — et « GLE Coupé » est une GLE,
# « F8 Tributo Base » une F8 Tributo.
def test_the_real_file_folds_a_body_word_and_a_finish_word():
    table = with_catalog(EMPTY)
    assert infer_model("mercedes", "GLE Coupé 350 de 194+136ch", table) == "gle"
    assert infer_model("ferrari", "F8 Tributo Base", table) == "f8 tributo"


# Fait rougir `HEADS.get(model_key, frozenset())` et la construction de
# `_heads` : `naming.label` s'en sert pour ne pas écrire « Citroën Xsara
# Picasso … Picasso 2.0 HDi90 ».
def test_the_other_spelling_of_a_model_is_given_back():
    assert written_heads("xsara picasso") == frozenset({"picasso"})
    assert written_heads("fortwo") == frozenset({"smart"})
    assert written_heads("gle") == frozenset()


# Fait rougir `_model_aliases` : l'alias entre sites vit dans le fichier, et
# c'est `taxonomy.canonical` qui s'en sert. Deux lignes de menu pour une seule
# Ferrari, sinon.
def test_the_file_carries_the_alias_between_the_two_sites():
    assert MODEL_ALIASES[("ferrari", "812 superfast")] == "812"


# Le fichier lui-même, relu : les trois cas qu'Alexis a tranchés le
# 2026-09-20. Un effacement distrait dans le JSON se voit ici.
def test_the_three_cases_the_file_settles():
    assert CREATED[("citroen", "picasso")] == ("xsara picasso", 2010)
    assert CREATED[("smart", "smart")] == ("fortwo", None)
    assert CREATED[("dodge", "challenger")] == ("challenger", None)
    assert "sport" not in WORDS and "tourer" not in WORDS
