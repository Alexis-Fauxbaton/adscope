"""La couche canonique : une écriture d'affichage, une clé, des mots à chercher.

Les cas sont tirés de la base réelle (52 956 annonces, mesurée le 2026-09-19,
voir `.superpowers/recherche-lot1.md`) : « Chevrolet / Corvette » face à
« Corvette / Autres », les 4 762 annonces sans modèle, les dix marques écrites
de deux façons, et le « Mercedes-Benz » que La Centrale écrit seule.
"""

from adscope_api import spelling
from adscope_api.inference import KnownModels
from adscope_api.mentions import version_names_model
from adscope_api.taxonomy import (
    canonical, derive, inferred_model, key, search_text,
)


class Row:
    """Ce que `derive` connaît d'une annonce : sept attributs, pas un ORM.

    `year` est le septième, arrivé avec le lot 3b : une tête de version peut
    avoir besoin de l'âge du véhicule pour nommer un modèle (« Picasso »).
    """

    def __init__(self, brand=None, model=None, version=None, year=None):
        self.brand, self.model, self.version = brand, model, version
        self.year = year
        self.canon_brand = self.canon_model = self.search_text = None
        self.canon_model_source = None


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


# Fait rougir `if not conditional or version_confirms(version, posed_model)` :
# une version vide ne contredit personne, l'alias pose le modèle comme avant —
# c'est le cas de 21 des 23 « Corvette / Autres ».
def test_the_conditional_alias_poses_the_model_on_an_empty_version():
    assert canonical("Corvette", "Autres", "") == ("Chevrolet", "Corvette")
    assert canonical("Corvette", "Autres", None) == ("Chevrolet", "Corvette")


# Fait rougir `version_confirms` dans le sens qui confirme : une version qui
# nomme le modèle visé en mots entiers le pose, même détaillée.
def test_the_conditional_alias_poses_the_model_a_version_confirms():
    assert canonical("Corvette", "Autres", "Corvette C6 6.0 V8") == (
        "Chevrolet", "Corvette"
    )


# Fait rougir `conditional = rule.get("vers_modele_sous_reserve_de_version")` et
# `version_confirms` dans le sens qui contredit : leboncoin range aussi les
# Camaro dans le seau « Corvette / Autres » (zéro Chevrolet/Camaro en base). Un
# modèle faux (« Corvette ») est pire qu'un modèle absent — l'alias ne pose
# plus que la marque, le modèle reste « Autres ».
def test_the_conditional_alias_does_not_pose_a_model_the_version_contradicts():
    assert canonical("Corvette", "Autres", "Base_Camaro Coupé 6.2 V8 453ch 8AT") == (
        "Chevrolet", "Autres"
    )
    assert canonical("Corvette", "Autres", "1969 Camaro Camaro SS") == (
        "Chevrolet", "Autres"
    )


# Fait rougir `target = [fold(w) ...]` et l'égalité de `version_confirms` :
# mots entiers, jamais une sous-chaîne — « Corvette C6 » ne doit pas laisser
# croire qu'un modèle qui ne serait que « C6 » confirme « Corvette ».
def test_the_version_confirmation_matches_whole_words_only():
    assert canonical("Corvette", "Autres", "Corvettiste 6.0 V8") == (
        "Chevrolet", "Autres"
    )


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


# Fait rougir `return before != after` : `recanonize.py` compte
# ce qu'il a changé, et rejoué sur une base à jour il ne change rien.
def test_derive_says_when_it_changed_nothing():
    row = Row("Renault", "Clio", None)
    assert derive(row) is True
    assert derive(row) is False


# Fait rougir `return bool(_words(version)) and mentions(version, model)` sur
# la branche vide : au contraire de `version_confirms`, une version muette ne
# nomme rien — la ligne de santé des données ne doit pas compter un modèle
# absent comme un modèle contredit.
def test_an_empty_version_names_no_model():
    assert version_names_model("", "scenic") is False
    assert version_names_model(None, "scenic") is False


# Fait rougir `mentions(version, model)` dans le sens qui nomme : une version
# qui porte le modèle en mots entiers le nomme.
def test_a_version_that_spells_a_model_names_it():
    assert version_names_model("Grande Punto Evo 1.3 Multijet", "punto evo") is True


# Fait rougir la même ligne dans le sens qui ne nomme pas : un mot qui n'est
# qu'une sous-chaîne du modèle ne le nomme pas.
def test_a_version_that_only_shares_a_substring_does_not_name_the_model():
    assert version_names_model("Corvettiste 6.0 V8", "corvette") is False


def vocabulary(**by_brand):
    return KnownModels(
        by_brand={b: frozenset(m) for b, m in by_brand.items()},
        qualifiers=frozenset({"1.4", "2.0", "197", "break"}),
    )


# Fait rougir `source = None if model in (None, fold(UNKNOWN)) else FROM_SITE` :
# la colonne dit d'où vient le modèle canonique, et le cas ordinaire est « du
# site » — 48 000 annonces sur 53 000.
def test_a_model_given_by_the_site_is_marked_as_coming_from_the_site():
    row = Row("Citroen", "Xsara", "Xsara 2.0 HDi90")
    derive(row, vocabulary(citroen=["xsara"]))
    assert (row.canon_model, row.canon_model_source) == ("xsara", "site")


# Fait rougir `model, source = inferred, FROM_VERSION` : c'est tout le lot.
# Le seau « Autres » se comble par la version, et la colonne le dit.
def test_a_model_deduced_from_the_version_is_marked_as_such():
    row = Row("Citroen", "Autres", "Xsara 2.0 HDi90 Exclusive 5p")
    derive(row, vocabulary(citroen=["xsara"]))
    assert (row.canon_model, row.canon_model_source) == ("xsara", "version")


# Fait rougir `if source is None` : la déduction ne comble que le vide. Un
# modèle donné par le site n'est jamais remplacé — c'est la règle cardinale du
# lot, et l'erreur des deux Camaro affichées « Corvette ».
def test_the_deduction_never_replaces_a_model_the_site_gave():
    row = Row("Citroen", "C3 Picasso", "C3 1.6 HDi110 FAP Exclusive")
    derive(row, vocabulary(citroen=["c3", "c3 picasso"]))
    assert (row.canon_model, row.canon_model_source) == ("c3 picasso", "site")


# Fait rougir `if ... known is not None` : sans vocabulaire, rien ne se déduit.
# C'est ce qui permet à `taxonomy` de rester pur là où personne n'a de base
# sous la main.
def test_without_a_vocabulary_nothing_is_deduced():
    row = Row("Citroen", "Autres", "Xsara 2.0 HDi90 Exclusive 5p")
    derive(row)
    assert (row.canon_model, row.canon_model_source) == ("autres", None)


# Fait rougir la branche `if inferred is not None` : une version qui ne nomme
# aucun modèle connu laisse le seau « Autres » et une provenance nulle — c'est
# ainsi que `data_health` compte ce qui résiste.
def test_a_version_that_names_nothing_leaves_the_model_unset():
    row = Row("Citroen", "Autres", "Grand C4 SpaceTourer BlueHDi 130ch")
    derive(row, vocabulary(citroen=["c4"]))
    assert (row.canon_model, row.canon_model_source) == ("autres", None)


# Fait rougir l'ajout d'`inferred` à `search_text` : le modèle déduit peut
# s'écrire autrement que la version qui l'a livré — la version dit « Rav 4 »,
# le modèle est « RAV4 ». Sans lui, `?q=rav4` ne trouverait pas une annonce
# qu'on affiche pourtant « Toyota RAV4 ».
def test_the_deduced_model_joins_the_search_text():
    row = Row("Toyota", "Autres", "Rav 4 197 Hybride Collection AWD CVT")
    derive(row, vocabulary(toyota=["rav4"]))
    assert "rav4" in row.search_text.split()


# Fait rougir l'ajout de `source` au couple comparé dans `derive` : une annonce
# dont seule la provenance change a bien changé, et `recanonize.py` doit la
# compter.
def test_a_change_of_provenance_alone_counts_as_a_change():
    row = Row("Citroen", "Autres", "Xsara 2.0 HDi90 Exclusive 5p")
    row.canon_brand, row.canon_model = "citroen", "xsara"
    row.search_text = search_text("Citroen", "Autres", "Xsara 2.0 HDi90 Exclusive 5p",
                                  "xsara")
    assert derive(row, vocabulary(citroen=["xsara"])) is True


# La règle cardinale, tenue jusqu'ici : la déduction n'écrit que la couche
# canonique. Marque, modèle et version observés ne bougent pas d'un caractère,
# et l'empreinte véhicule n'est pas même effleurée.
def test_the_deduction_never_touches_the_observed_fields():
    row = Row("Land Rover", "Autres", "Range Rover 3.0 P550e")
    derive(row, vocabulary(**{"land rover": ["range rover"]}))
    assert (row.brand, row.model, row.version) == (
        "Land Rover", "Autres", "Range Rover 3.0 P550e"
    )


# Fait rougir `canon_model if canon_model_source == FROM_VERSION else None` :
# `market_items` et `feed_query` lisent cette fonction pour savoir quoi passer
# à `label`, et un modèle du site n'est pas une déduction. `label` se garde
# aussi de son côté — deux verrous pour un fait, et celui-ci se prouve ici.
def test_only_a_model_deduced_from_the_version_is_given_back_as_deduced():
    assert inferred_model("xsara", "version") == "xsara"
    assert inferred_model("xsara", "site") is None
    assert inferred_model("autres", None) is None


# ---------------------------------------------------------------- lot 3b ----

# Fait rougir `renamed = MODEL_ALIASES.get(...)` dans `canonical` : deux sites,
# deux noms pour la même voiture. leboncoin classe 24 annonces en « 812
# Superfast », La Centrale 3 en « 812 » — un seul seau, une seule ligne de
# menu, et `?model=812` les rend toutes.
def test_two_sites_two_names_for_one_model_make_one_bucket():
    assert canonical("Ferrari", "812 Superfast") == ("Ferrari", "812")
    assert key("Ferrari", "812 Superfast") == key("Ferrari", "812")


# Fait rougir `for value in (brand, model, version, ...)` de `search_text` :
# l'alias ne doit rien retirer à la recherche. Les mots observés restent, donc
# `?q=superfast` rend toujours ses 24 annonces.
def test_an_alias_never_takes_a_word_away_from_the_search():
    text = search_text("Ferrari", "812 Superfast", "812 V12 6.5 800ch")
    assert "superfast" in text.split() and "812" in text.split()


# Fait rougir `infer_model(brand, listing.version, known, listing.year)` : sans
# l'année, une tête sous condition ne se pose jamais — les 118 « Picasso »
# resteraient « Autres ».
def test_the_deduction_receives_the_year_of_the_vehicle():
    table = KnownModels(
        by_brand={"citroen": frozenset({"picasso"})},
        qualifiers=frozenset({"1.6"}),
        renames={("citroen", "picasso"): "xsara picasso"},
        year_max={("citroen", "picasso"): 2010},
    )
    row = Row("Citroen", "Autres", "Picasso 1.6 HDi110 Exclusive", year=2007)
    derive(row, table)
    assert (row.canon_model, row.canon_model_source) == ("xsara picasso", "version")
    late = Row("Citroen", "Autres", "Picasso 1.6 HDi110 Exclusive", year=2013)
    derive(late, table)
    assert (late.canon_model, late.canon_model_source) == ("autres", None)
