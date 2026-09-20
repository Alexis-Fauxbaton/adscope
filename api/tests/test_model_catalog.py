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
                         words=frozenset(), alias_heads={})
    assert "gle" in table.of("mercedes")


# Fait rougir `by_brand[brand] |= set(models)` : le fichier **ajoute**, il ne
# remplace pas. Les 546 modèles que les sites déclarent restent.
def test_what_the_sites_declare_survives_the_catalogue():
    table = with_catalog(sites(citroen=["xsara"]),
                         created={("citroen", "c3 pluriel"): ("c3 pluriel", None)},
                         words=frozenset(), alias_heads={})
    assert table.of("citroen") == frozenset({"xsara", "c3 pluriel"})


# Fait rougir `renames[(brand, head)] = model` : la tête « Picasso » nomme un
# Xsara Picasso, et c'est ce nom-là qu'il faut poser.
def test_a_head_written_otherwise_becomes_a_rename():
    table = with_catalog(EMPTY,
                         created={("citroen", "picasso"): ("xsara picasso", None)},
                         words=frozenset(), alias_heads={})
    assert table.renames[("citroen", "picasso")] == "xsara picasso"


# Fait rougir `if model != head` : une tête qui s'écrit comme son modèle n'a
# rien à renommer, et une table de renommages pleine d'identités coûterait une
# recherche pour rien à chaque déduction.
def test_a_head_written_like_its_model_adds_no_rename():
    table = with_catalog(EMPTY, created={("mercedes", "gle"): ("gle", None)},
                         words=frozenset(), alias_heads={})
    assert table.renames == {}


# Fait rougir `year_max[(brand, head)] = limit` : la condition d'année vit dans
# le fichier, et elle doit arriver jusqu'à `resolved`.
def test_a_year_limit_is_carried_over():
    table = with_catalog(EMPTY,
                         created={("citroen", "picasso"): ("xsara picasso", 2010)},
                         words=frozenset(), alias_heads={})
    assert table.year_max[("citroen", "picasso")] == 2010
    assert infer_model("citroen", "Picasso 1.6 HDi110", table, 2013) is None


# Fait rougir `qualifiers=known.qualifiers | words` : les mots de carrosserie
# du fichier rejoignent ceux que la mesure a trouvés. Sans eux, « 488 Spider »
# ne serait pas une 488 — la mesure ne peut pas les voir, « Spider » ne suit
# qu'un seul modèle.
def test_the_body_words_of_the_file_join_the_measured_qualifiers():
    table = with_catalog(sites(ferrari=["488"]), created={},
                         words=frozenset({"spider"}), alias_heads={})
    assert table.qualifiers == frozenset({"1.6", "spider"})
    assert infer_model("ferrari", "488 Spider V8 3.9 T 670ch", table) == "488"


# Fait rougir la lecture des sections `carrosseries` et `finitions` de
# `_words` : le fichier, lui, les porte bien — et « GLE Coupé » est une GLE,
# « F8 Tributo Base » une F8 (« Tributo » est une finition depuis le
# 2026-09-20, F8 et F8 Tributo sont fusionnés).
def test_the_real_file_folds_a_body_word_and_a_finish_word():
    table = with_catalog(EMPTY)
    assert infer_model("mercedes", "GLE Coupé 350 de 194+136ch", table) == "gle"
    assert infer_model("ferrari", "F8 Tributo Base", table) == "f8"


# Fait rougir `HEADS.get(model_key, frozenset())` et la construction de
# `_heads` : `naming.label` s'en sert pour ne pas écrire « Citroën Xsara
# Picasso … Picasso 2.0 HDi90 ».
def test_the_other_spelling_of_a_model_is_given_back():
    assert written_heads("xsara picasso") == frozenset({"picasso"})
    assert written_heads("fortwo") == frozenset({"smart"})
    assert written_heads("gle") == frozenset()


# Fait rougir `_model_aliases` : l'alias entre sites vit dans le fichier, et
# c'est `taxonomy.canonical` qui s'en sert. Deux lignes de menu pour une seule
# Ferrari, sinon. La valeur est (écriture canonique, année maximale) — `None`
# pour un alias sans condition.
def test_the_file_carries_the_alias_between_the_two_sites():
    assert MODEL_ALIASES[("ferrari", "812 superfast")] == ("812", None)


# Fait rougir la condition d'année d'un alias de modèle **déclaré** : les 14
# Citroën « Picasso » de La Centrale ne deviennent des Xsara Picasso que
# jusqu'en 2010, comme la tête déduite du même nom.
def test_a_declared_model_alias_can_carry_a_year_condition():
    assert MODEL_ALIASES[("citroen", "picasso")] == ("Xsara Picasso", 2010)


# Le fichier lui-même, relu : les trois cas qu'Alexis a tranchés le
# 2026-09-20. Un effacement distrait dans le JSON se voit ici.
def test_the_three_cases_the_file_settles():
    assert CREATED[("citroen", "picasso")] == ("xsara picasso", 2010)
    assert CREATED[("smart", "smart")] == ("fortwo", None)
    assert CREATED[("dodge", "challenger")] == ("challenger", None)
    assert "sport" not in WORDS and "tourer" not in WORDS


# ------------------------------------------ décisions d'Alexis du 2026-09-20 ----

# Fait rougir `numeric_heads=known.numeric_heads | frozenset(created.keys())` :
# c'est tout l'apport de la décision 1, et seules les têtes du fichier y
# entrent.
def test_a_created_head_joins_numeric_heads():
    table = with_catalog(EMPTY, created={("bmw", "xm"): ("xm", None)},
                         words=frozenset(), alias_heads={})
    assert ("bmw", "xm") in table.numeric_heads
    assert infer_model("bmw", "XM 4.4 V8 748ch", table) == "xm"


# Fait rougir la même ligne dans son sens négatif : un modèle appris des sites
# ne rejoint jamais `numeric_heads`, même une fois passé par `with_catalog`.
def test_a_site_learned_model_never_joins_numeric_heads():
    table = with_catalog(sites(mercedes=["classe ml"]), created={},
                         words=frozenset(), alias_heads={})
    assert table.numeric_heads == frozenset()
    assert infer_model("mercedes", "Classe ML 320 Classic", table) is None


# Le fichier réel, relu : les deux têtes de tête de liste du §6.1 du lot 3b
# doivent se résoudre maintenant.
def test_the_real_file_lets_a_cylinder_or_a_power_figure_through():
    table = with_catalog(EMPTY)
    assert infer_model("bmw", "XM 4.4 V8 748ch (585+197) Label Red", table) == "xm"
    assert infer_model("ferrari", "Purosangue 6.5 V12 725ch", table) == "purosangue"


# Fait rougir la fusion Kia du fichier réel : « Cee'd », « Ceed » et
# « Pro Cee'd » nomment tous le même seau depuis le 2026-09-20 — Kia a renommé
# l'écriture officielle en 2018, la forme courante l'emporte. Les cylindrées
# (« 1.6 », « 1.4 », « 2.0 ») sont posées à la main : ce sont des qualificatifs
# *mesurés* en base réelle, hors de la portée de ce module sans base.
def test_the_real_file_merges_the_three_kia_writings():
    base = KnownModels(by_brand={}, qualifiers=frozenset({"1.6", "1.4", "2.0"}))
    table = with_catalog(base)
    assert infer_model("kia", "Cee'd 1.6 CRDi115 Active 5p", table) == "ceed"
    assert infer_model("kia", "Ceed 1.4 T-GDI 140ch GT Line DCT7", table) == "ceed"
    assert infer_model("kia", "Pro Cee'd 2.0 CRDi140 Sport 3p", table) == "ceed"
    # « XCeed » est un modèle différent (un crossover, pas un Ceed) : il ne
    # doit jamais être confondu, l'apostrophe seule sépare les deux plis.
    assert "xceed" not in table.of("kia")


# Fait rougir `for (brand, head), (model, limit) in {**alias_heads,
# **created}.items()` : sans `_alias_heads`, la tête à deux mots
# « grandland x » — reconnue par les 6 annonces déclarées avant l'alias —
# disparaît du vocabulaire dès que `model_vocabulary.load` la replie en
# « grandland » avant de la compter, et une annonce « Autres » régresse.
def test_an_alias_heads_multi_word_head_survives_its_own_alias():
    base = KnownModels(by_brand={}, qualifiers=frozenset({"1.2"}))
    table = with_catalog(base)
    assert "grandland x" in table.of("opel")
    assert infer_model("opel", "Grandland X 1.2 Turbo 130ch Edition BVA8", table, 2021) \
        == "grandland"


# Fait rougir `numeric_heads=known.numeric_heads | frozenset(created.keys())`
# côté négatif : une tête d'`alias_modeles` réinjectée par `_alias_heads` n'a
# pas le droit à l'exception numérique de la décision 1, réservée au fichier
# `modeles_crees`.
def test_an_alias_head_never_gets_the_numeric_word_exception():
    assert ("opel", "grandland x") not in with_catalog(EMPTY).numeric_heads
