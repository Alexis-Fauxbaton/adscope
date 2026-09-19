"""Le nom propre du véhicule : marque, modèle, version — sans redite.

Les cas sont tirés de la base réelle (52 956 annonces, mesurée le 2026-09-19,
voir `.superpowers/recherche-lot1.md`) : 15 523 versions sur 17 451 répètent le
modèle, 3 350 collent la finition par un souligné et la redisent, et leboncoin
écrit le modèle avec ou sans espace selon la colonne.
"""

from adscope_api.naming import label


# Fait rougir `head = [p for p in (...) if p and p != UNKNOWN]` : 4 762 annonces
# portent « Autres » pour modèle, il ne s'affiche jamais.
def test_the_unknown_bucket_never_shows_in_a_label():
    assert label("Ferrari", "Autres", None) == "Ferrari"


# Fait rougir `or NO_VEHICLE` : 277 annonces n'ont ni marque ni modèle, et un
# item du marché doit tout de même porter un nom.
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
# une marque dont le modèle s'appelle Mini, 389 annonces.
def test_a_brand_equal_to_its_model_is_not_said_twice():
    assert label("Mini", "Mini", "Mini Cooper S 192ch Exquisite BVA7") == (
        "Mini Cooper S 192ch Exquisite BVA7"
    )


# Fait rougir `plies = {fold(v).replace(" ", "") ...}` de `_phrases` : ce sont
# des suites entières, jamais des mots isolés. Découpées en mots, « Land Rover »
# mangerait le « Rover » de « Range Rover Evoque » — 226 annonces de la base.
def test_a_two_word_brand_does_not_eat_a_word_of_another_name():
    assert label("Land Rover", "Autres", "Range Rover Evoque 2.0 TD4 150 SE BVA") == (
        "Land Rover Range Rover Evoque 2.0 TD4 150 SE BVA"
    )


# Fait rougir la même ligne dans l'autre sens, et `if len(run) >= len(phrase)`
# dans `_span` : l'accumulation va jusqu'au poids de la suite cherchée, donc un
# nom de deux mots se retire en entier — « rangerover » vaut « Range » + « Rover ».
def test_a_two_word_model_the_version_repeats_goes_whole():
    assert label("Land Rover", "Range Rover", "Range Rover Sport 3.0 SDV6") == (
        "Land Rover Range Rover Sport 3.0 SDV6"
    )


# Fait rougir l'accumulation `run += ply` de `_span` et le tri `key=len,
# reverse=True` de `_phrases` : leboncoin écrit le modèle « Ds3 » en colonne et
# « DS 3 » dans la version. Sans l'accumulation, ou si la marque « Ds » passait
# avant le modèle « Ds3 », seul le « DS » partait et le « 3 » restait orphelin —
# « Ds Ds3 3 Crossback ». Et depuis `_rebrand`, la marque ne se répète plus en
# tête puisque le modèle canonique commence déjà par elle (68 annonces DS).
def test_the_model_written_with_a_space_in_the_version_goes_whole():
    assert label("Ds", "Ds3", "DS 3 Crossback PureTech 130ch Performance Line") == (
        "DS 3 Crossback PureTech 130ch Performance Line"
    )


# Fait rougir la même ligne dans l'autre sens : le modèle observé porte l'espace
# (« Rav 4 »), la version ne l'a pas (« RAV4 »). C'est le même retrait des
# espaces qui réunit les deux.
def test_the_model_written_without_its_space_in_the_version_goes_whole():
    assert label("Toyota", "Rav 4", "RAV4 197 Hybride Collection AWD CVT") == (
        "Toyota RAV4 197 Hybride Collection AWD CVT"
    )


# Fait rougir `_phrases(brand, model, canon_brand, canon_model)` dans `label` :
# le retrait compare les deux écritures, pas seulement celle du site. Le cas
# vient de l'alias, donc de nous : les 23 « Corvette / Autres » deviennent des
# Chevrolet, et une version qui dirait « Chevrolet » doit le perdre comme elle
# perd « Corvette ». Aucune des 23 ne le dit aujourd'hui — c'est un garde-fou
# posé sur notre propre mécanisme, pas sur une forme observée.
def test_the_brand_an_alias_gives_is_removed_from_the_version_too():
    assert label("Corvette", "Autres", "Chevrolet Corvette 6.2 V8 659ch") == (
        "Chevrolet Corvette 6.2 V8 659ch"
    )


# Fait rougir `if run == phrase` dans `_span` : c'est l'égalité, pas le préfixe.
# Sans elle « C3 » mordrait dans « C3500 » et le libellé perdrait un nom de
# camion.
def test_a_short_model_never_bites_into_a_longer_word():
    assert label("Chevrolet", "C3", "C3500 Silverado 5.7 V8") == (
        "Chevrolet C3 C3500 Silverado 5.7 V8"
    )


# Fait rougir `conditional = rule.get("vers_modele_sous_reserve_de_version")`
# dans `taxonomy.canonical` : les Camaro du seau « Corvette / Autres » ne
# disent pas « Corvette » dans leur version, l'alias ne pose donc plus ce
# modèle faux — seule la marque est corrigée, et le préfixe de finition
# « Base_ » suit la règle ordinaire de `_unglued` (il ne reparaît pas plus
# loin, il reste).
def test_the_conditional_alias_does_not_pose_a_model_the_version_contradicts():
    assert label("Corvette", "Autres", "Base_Camaro Coupé 6.2 V8 453ch 8AT") == (
        "Chevrolet Base Camaro Coupé 6.2 V8 453ch 8AT"
    )
    assert label("Corvette", "Autres", "1969 Camaro Camaro SS") == (
        "Chevrolet 1969 Camaro Camaro SS"
    )


# Fait rougir `return rest if prefix and repeated else version` dans `_unglued` :
# leboncoin colle la finition devant la version par un souligné et la redit à la
# fin. 3 350 versions. Le préfixe qui reparaît ne dit rien de plus, il part.
def test_a_finition_prefix_the_version_repeats_goes_away():
    assert label(
        "Bmw", "Serie 1",
        "Edition M Sport Pro_Série 1 M135iA xDrive 306ch Edition M Sport Pro",
    ) == "BMW Série 1 M135iA xDrive 306ch Edition M Sport Pro"


# Fait rougir la même ligne sur un préfixe d'un seul mot, le cas le plus courant.
def test_the_finition_prefix_goes_even_when_the_model_follows_it():
    assert label("Citroen", "C4 Picasso", "Exclusive_C4 Picasso BlueHDi 150ch Exclusive S&S") == (
        "Citroën C4 Picasso BlueHDi 150ch Exclusive S&S"
    )


# Fait rougir `else version` de la même ligne : un préfixe qui **ne** se répète
# **pas** porte la seule finition qu'on ait, et on ne jette pas une information.
def test_a_finition_prefix_that_repeats_nothing_stays():
    assert label("Corvette", "Autres", "Base_Camaro Coupé 6.2 V8 453ch 8AT") == (
        "Chevrolet Base Camaro Coupé 6.2 V8 453ch 8AT"
    )


# Fait rougir `_WORDS` dans `_trimmed` : le souligné gardé devient une espace,
# il ne reste pas collé au mot suivant.
def test_the_kept_underscore_becomes_a_space():
    assert label("Peugeot", "208", "Base_1.2 PureTech 75ch") == (
        "Peugeot 208 Base 1.2 PureTech 75ch"
    )


# Fait rougir `fold(v) != fold(UNKNOWN)` dans `_phrases` : « Autres » n'est pas
# un nom, il n'a rien à retirer d'une version qui le contient.
def test_the_unknown_bucket_removes_nothing_from_a_version():
    assert label("Autres", "Autres", "Autres 1.6 HDi") == "Autres 1.6 HDi"


# Fait rougir `[w for w in _WORDS.split(version or "") if w]` dans `_trimmed` :
# une version qui commence ou finit par une espace donne des mots vides, et un
# mot vide gardé fait une espace de trop dans le libellé.
def test_the_spacing_of_a_version_is_tidied():
    assert label("Hyundai", "Ioniq", "  Ioniq   Ioniq ") == "Hyundai Ioniq"
    assert label("Hyundai", "Ioniq", "  Electric   136ch ") == (
        "Hyundai Ioniq Electric 136ch"
    )


def test_a_version_that_repeats_nothing_is_kept_whole():
    assert label("Hyundai", "Ioniq", "Ioniq Electric 136ch Executive 2cv") == (
        "Hyundai Ioniq Electric 136ch Executive 2cv"
    )


# Fait rougir `canonical` dans `label` : c'est l'orthographe d'affichage qui
# s'écrit, celle du fichier, pas celle que le site a saisie.
def test_the_label_shows_the_official_spelling():
    assert label("CITROEN", "Ds3", None) == "Citroën DS 3"
    assert label("Audi", "Tt", "Tt 1.8 T 180ch") == "Audi TT 1.8 T 180ch"


# Remesuré sur la base réelle (52 957 annonces, 2026-09-19) : 94 annonces dont
# le modèle canonique commence par la marque — DS 68, McLaren 15, Abarth 11,
# zéro contre-exemple. Fait rougir `_rebrand` dans `label` : sans lui, la
# marque se répète — « DS DS 3 », jamais affiché tel quel aujourd'hui.
def test_a_model_that_already_starts_with_the_brand_does_not_repeat_it():
    assert label("Ds", "Ds3", None) == "DS 3"
    assert label("Abarth", "Abarth 500", "Abarth 500 1.4 T-Jet 135ch") == (
        "Abarth 500 1.4 T-Jet 135ch"
    )


# La marque a sa propre orthographe d'affichage, sur la liste fermée des 83
# marques ; le modèle est un vocabulaire ouvert et ne la porte pas toujours
# aussi soigneusement (« Mclaren » sans capitale au C). Fait rougir
# `[canon_brand, *model_words[len(brand_words):]]` dans `_rebrand` : sans lui
# le libellé reprendrait l'écriture du modèle telle quelle et perdrait la
# casse propre de la marque.
def test_the_kept_brand_keeps_its_own_spelling_not_the_models():
    assert label("McLaren", "Mclaren 720S", "Mclaren 720S 4.0 V8 720ch") == (
        "McLaren 720S 4.0 V8 720ch"
    )


# Garde-fou explicitement demandé : une marque égale à son modèle continue de
# ne se dire qu'une fois, comme avant ce lot — jamais par `_rebrand`, qui ne
# doit même pas être atteint puisque `head` est déjà réduit à un seul élément.
def test_a_brand_equal_to_its_model_still_behaves_as_before_this_change():
    assert label("Mini", "Mini", "Mini Cooper S 192ch Exquisite BVA7") == (
        "Mini Cooper S 192ch Exquisite BVA7"
    )


# Fait rougir la comparaison mot à mot de `_rebrand` dans ce sens : un modèle
# plus court que la marque n'a pas assez de mots pour l'égaler, il ne doit
# rien perdre.
def test_a_model_shorter_than_the_brand_is_not_touched():
    assert label("Land Rover", "Defender", "Defender 90 2.2 TD4") == (
        "Land Rover Defender 90 2.2 TD4"
    )


# Fait rougir la comparaison mot à mot de `_rebrand` (et non sous-chaîne) : une
# marque qui n'est qu'un préfixe textuel du modèle, sans former un mot entier,
# ne doit pas être retirée à tort.
def test_a_brand_that_is_only_a_text_prefix_not_a_whole_word_is_kept():
    assert label("Renault", "Renaultsport Clio", "Renaultsport Clio 200 CVS") == (
        "Renault Renaultsport Clio 200 CVS"
    )
