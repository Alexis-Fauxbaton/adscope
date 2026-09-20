"""La déduction du modèle à partir de la version — la fonction pure.

Chaque cas est tiré de la base réelle : la mesure du lot 3a
(`.superpowers/recherche-lot3a.md`) a produit la liste complète des erreurs,
et chaque nature rencontrée a son test ici. Aucune horloge : la fonction n'en
lit pas.
"""

from adscope_api.inference import KnownModels, infer_model


def known(qualifiers=("break", "1.4", "1.6", "2.0"), renames=None, year_max=None,
          **by_brand):
    return KnownModels(
        by_brand={b: frozenset(m) for b, m in by_brand.items()},
        qualifiers=frozenset(qualifiers),
        renames=renames or {}, year_max=year_max or {},
    )


# Fait rougir `spans = {m: n for m in known if (n := span(...))}` : sans elle,
# rien ne se déduit jamais — 1 349 annonces « Autres » gardent leur version
# pour seul indice.
def test_a_version_that_leads_with_a_known_model_names_it():
    table = known(citroen=["xsara"])
    assert infer_model("citroen", "Xsara 2.0 HDi90 Exclusive 5p", table) == "xsara"


# Fait rougir `known = known_models.of(brand_key)` : le vocabulaire est celui
# de **la** marque. « Mustang » appartient à Ford, pas à Renault, et un
# vocabulaire commun à toutes les marques mélangerait 83 taxonomies.
def test_a_model_of_another_brand_is_not_a_candidate():
    table = known(qualifiers=["1.4"], ford=["mustang"], renault=["clio"])
    assert infer_model("renault", "Mustang 1.4 V8", table) is None
    assert infer_model("ford", "Mustang 1.4 V8", table) == "mustang"


# Fait rougir l'ancrage en tête — `span(words, start, ...)` à `start` et nulle
# part ailleurs. Cherché n'importe où, « Grand Scenic 1.9 dCi » devenait une
# « Scenic » (une cinq places au lieu d'une sept places) et « Mustang Fastback
# 5.0 V8 421ch GT BVA6 » une Ford « GT ».
def test_a_model_named_further_along_the_version_is_ignored():
    table = known(qualifiers=["1.9"], renault=["scenic"])
    assert infer_model("renault", "Grand Scenic 1.9 dCi 130ch", table) is None


# Fait rougir la branche `if not separator: return words, 0` de `head` : sans
# préfixe de finition, le modèle est au mot 0 — et il faut le chercher là.
def test_without_a_finish_prefix_the_model_starts_at_the_first_word():
    table = known(mercedes=["classe c"])
    version = "Classe C Break 220 CDI Elegance BA"
    assert infer_model("mercedes", version, table) == "classe c"


# Fait rougir `len([w for w in _WORDS.split(prefix) if w])` de `head` :
# leboncoin colle la finition devant la version par un souligné, et le modèle
# commence après — 3 350 versions sur 17 451 sont écrites ainsi.
def test_the_model_starts_after_the_finish_prefix_leboncoin_glues_on():
    table = known(mercedes=["classe c"])
    version = "Elegance_Classe C Break 220 CDI Elegance BA"
    assert infer_model("mercedes", version, table) == "classe c"


# Fait rougir `return count if run == ply else 0` dans `span` : l'égalité, pas
# le préfixe. Sinon « C3 » mordrait dans « C3500 » et une Silverado
# deviendrait une C3.
def test_a_model_does_not_bite_into_a_longer_word():
    table = known(qualifiers=["5.7"], chevrolet=["c3"])
    assert infer_model("chevrolet", "C3500 5.7 V8 Silverado", table) is None


# Fait rougir `run += word` dans `span` — l'accumulation, espaces ignorés : le
# modèle « Ds3 » doit reconnaître le « DS 3 » que la version écrit en deux
# mots.
def test_the_comparison_ignores_the_spaces_of_a_model_name():
    table = known(qualifiers=["1.6"], ds=["ds 3"])
    assert infer_model("ds", "DS3 1.6 BlueHDi 120ch", table) == "ds 3"


# Fait rougir `best = max(spans, key=lambda m: spans[m])` — le plus long
# gagne. « C3 Aircross » devant « C3 », sinon 20 Aircross deviendraient des
# C3.
def test_the_longest_matching_model_wins():
    table = known(qualifiers=["puretech"], citroen=["c3", "c3 aircross"])
    version = "C3 Aircross PureTech 110ch S&S Shine"
    assert infer_model("citroen", version, table) == "c3 aircross"


# Fait rougir `if after < len(words) and words[after] not in
# known_models.qualifiers` — la garde du mot suivant. Sans elle, 69 Range
# Rover **Sport** devenaient des Range Rover : la classe d'erreur que les deux
# Camaro affichées « Corvette » avaient déjà montrée à l'écran.
def test_a_word_that_names_another_model_forbids_the_deduction():
    table = known(**{"land rover": ["range rover"]})
    version = "Range Rover Sport 3.0 TDV6 180kw HSE Mark VI"
    assert infer_model("land rover", version, table) is None


# Fait rougir la même garde dans le sens qui laisse passer : une carrosserie
# ne change pas de modèle, et « Classe C Break » reste une Classe C.
def test_a_measured_body_style_lets_the_deduction_through():
    table = known(mercedes=["classe c"])
    assert infer_model("mercedes", "Classe C Break 220 CDI", table) == "classe c"


# Fait rougir `after < len(words)` : une version réduite au seul nom du modèle
# n'a pas de mot suivant, et ce n'est pas une raison de renoncer.
def test_a_version_that_is_only_the_model_still_counts():
    table = known(fiat=["punto"])
    assert infer_model("fiat", "Punto", table) == "punto"


# Fait rougir `if start >= len(words) ... return None` : une version vide, ou
# réduite à sa finition, ne nomme rien.
def test_an_empty_version_names_nothing():
    table = known(fiat=["punto"])
    assert infer_model("fiat", None, table) is None
    assert infer_model("fiat", "Dynamic_", table) is None


# Fait rougir l'ancrage en tête sur le piège que le brief annonçait : un
# modèle purement numérique. « Mercedes Classe C 200 CDI » ne doit jamais
# devenir une « 200 » — et c'est la tête, pas une règle à part, qui l'en
# empêche.
def test_a_purely_numeric_model_is_out_of_reach_elsewhere_than_at_the_head():
    table = known(qualifiers=["200"], mercedes=["200", "classe c"])
    version = "Classe C 200 CDI Classic BV6"
    assert infer_model("mercedes", version, table) == "classe c"


# Et le même modèle numérique en tête se déduit, lui : 1 007 Porsche 911 et
# 2 119 Peugeot 206 en dépendent.
def test_a_purely_numeric_model_at_the_head_is_a_model_like_any_other():
    table = known(qualifiers=["3.6"], porsche=["911"])
    assert infer_model("porsche", "911 3.6 Carrera 4S", table) == "911"


# Fait rougir `fold` dans `head` : la casse et les accents ne décident de
# rien, ni ici ni ailleurs dans le lot.
def test_the_case_and_the_accents_of_the_version_change_nothing():
    table = known(qualifiers=["1.9"], renault=["megane"])
    assert infer_model("renault", "MÉGANE 1.9 dCi 105ch", table) == "megane"


# Déterministe : deux appels, même résultat — c'est ce qui permet de rejouer
# `recanonize.py` sans que la base bouge.
def test_the_same_version_and_the_same_vocabulary_give_the_same_answer():
    table = known(citroen=["xsara"])
    version = "Xsara 2.0 HDi90 Exclusive 5p"
    assert infer_model("citroen", version, table) == infer_model("citroen", version, table)


# ---------------------------------------------------------------- lot 3b ----

# Fait rougir `return self.renames.get((brand_key, head_key), head_key)` dans
# `resolved` : la version écrit « Smart Cabriolet », le modèle s'appelle
# Fortwo. Sans le renommage, treize Smart entrent dans un seau « smart » qui
# n'est le nom d'aucune voiture.
def test_a_head_can_name_a_model_the_version_never_writes():
    table = known(qualifiers=["cabriolet"], smart=["smart"],
                  renames={("smart", "smart"): "fortwo"})
    assert infer_model("smart", "Smart Cabriolet 55ch Pure", table) == "fortwo"


# Fait rougir `limit is not None and (year is None or year > limit)` dans son
# sens passant : sous la condition, la tête nomme bien le modèle. 118 Citroën
# « Picasso » en dépendent, toutes antérieures à 2010.
def test_a_head_under_condition_names_its_model_when_the_year_fits():
    table = known(qualifiers=["1.6"], citroen=["picasso"],
                  renames={("citroen", "picasso"): "xsara picasso"},
                  year_max={("citroen", "picasso"): 2010})
    version = "Picasso 1.6 HDi110 Exclusive"
    assert infer_model("citroen", version, table, 2007) == "xsara picasso"


# Fait rougir `year > limit` : au-delà de l'année, la tête redevient ambiguë —
# un « Picasso » de 2013 peut être un C4 Picasso, et un modèle faux est pire
# qu'un modèle absent.
def test_beyond_its_year_a_conditional_head_proves_nothing():
    table = known(qualifiers=["1.6"], citroen=["picasso"],
                  renames={("citroen", "picasso"): "xsara picasso"},
                  year_max={("citroen", "picasso"): 2010})
    assert infer_model("citroen", "Picasso 1.6 HDi110", table, 2013) is None


# Fait rougir `year is None` : une année manquante ne remplit aucune
# condition. On ne parie pas sur l'âge d'une voiture qu'on ne connaît pas.
def test_a_missing_year_never_fulfils_a_condition():
    table = known(qualifiers=["1.6"], citroen=["picasso"],
                  renames={("citroen", "picasso"): "xsara picasso"},
                  year_max={("citroen", "picasso"): 2010})
    assert infer_model("citroen", "Picasso 1.6 HDi110", table, None) is None


# Fait rougir `if found is None and _MODEL_YEAR.match(words[start])` : un
# millésime écrit devant la version n'est pas un nom de modèle. Dix Dodge
# « 1973 Challenger » et une Ford « 1965 Mustang » l'écrivent ainsi.
def test_a_model_year_in_front_of_the_version_is_not_the_model():
    table = known(qualifiers=["5.0"], ford=["mustang"])
    assert infer_model("ford", "1965 Mustang 5.0 V8", table) == "mustang"


# Fait rougir `_MODEL_YEAR.match(words[start])` dans l'autre sens : **seul**
# un millésime autorise à passer le premier mot. Sans cette condition,
# l'ancrage en tête du lot 3a tombe — « Exclusive C4 Picasso » redeviendrait
# une C4 Picasso alors que rien ne dit que « Exclusive » est une finition.
def test_only_a_model_year_lets_the_search_move_past_the_first_word():
    table = known(qualifiers=["bluehdi"], citroen=["c4 picasso"])
    assert infer_model("citroen", "Exclusive C4 Picasso BlueHDi 150ch", table) is None
    assert infer_model("citroen", "2015 C4 Picasso BlueHDi 150ch", table) == "c4 picasso"


# Fait rougir `found is None and` : le saut ne joue **qu'après** un échec. 81
# Peugeot « 2008 » commencent par ce qui ressemble à un millésime et qui est
# leur nom — les chercher au deuxième mot les perdrait toutes.
def test_a_leading_number_that_is_a_model_is_read_as_the_model():
    table = known(qualifiers=["1.2"], peugeot=["2008", "208"])
    assert infer_model("peugeot", "2008 1.2 PureTech 110ch", table) == "2008"


# Fait rougir `after += span(words, after, best.replace(" ", ""))` : une
# version qui redit le modèle ne le change pas. Sans cette ligne, « 1973
# Challenger Challenger » bute sur son propre nom.
def test_a_version_that_repeats_the_model_still_names_it():
    table = known(qualifiers=["5.7"], dodge=["challenger"])
    version = "1973 Challenger Challenger 5.7 V8"
    assert infer_model("dodge", version, table) == "challenger"


# Fait rougir la garde qui suit la redite : après le modèle répété, le mot
# suivant est examiné comme n'importe quel autre. Sans elle, la redite
# ouvrirait une porte dérobée à « Challenger Hellcat ».
def test_after_a_repetition_the_next_word_is_still_judged():
    table = known(qualifiers=["5.7"], dodge=["challenger"])
    assert infer_model("dodge", "Challenger Challenger Hellcat", table) is None
