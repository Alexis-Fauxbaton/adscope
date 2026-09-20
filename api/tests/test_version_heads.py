"""La tête d'une version : ce qui précède la motorisation.

Les cas sont ceux des 93 candidats du lot 3b
(`.superpowers/recherche-lot3b-candidats.md`), qui ont servi à écrire la
frontière. Fonction pure, aucune horloge, aucune base.
"""

from adscope_api.version_heads import head_phrase


# Fait rougir `_DECIMAL` : la cylindrée ferme la tête. « C5 Aircross BlueHDi »
# et « C5 Aircross 1.6 » doivent donner la même chose.
def test_the_head_stops_at_the_engine_displacement():
    assert head_phrase("C5 Aircross 1.6 130ch Feel") == "c5 aircross"


# Fait rougir `_POWER` : une puissance ferme la tête aussi — « Spring 45ch
# Business » ne nomme pas un modèle « Spring 45ch ».
def test_the_head_stops_at_the_power():
    assert head_phrase("Spring 45ch Business 2020") == "spring"
    # Et en **premier** mot, là où `_ENGINE_CODE` ne joue pas (il se garde de
    # la première place) : une Smart dont la version dit « 55ch Pulse » ne
    # nomme aucun modèle.
    assert head_phrase("55ch Pulse") == ""


# Fait rougir `word in ENGINE_WORDS` : un sigle moteur ferme la tête sans
# chiffre pour le trahir. « Austral E-Tech » s'arrête à « Austral ».
def test_the_head_stops_at_an_engine_acronym():
    assert head_phrase("Austral E-Tech full hybrid 200ch Iconic") == "austral"


# Fait rougir `rank > 0` : un nombre en **première** place appartient au nom.
# Sans cette condition, les 81 Peugeot 2008 et les 3 Ferrari 512 n'auraient
# plus de tête du tout.
def test_a_number_in_first_place_belongs_to_the_name():
    assert head_phrase("2008 1.2 PureTech 110ch") == "2008"
    assert head_phrase("512 5.0 M") == "512"


# Fait rougir `_NUMBER` : un nombre **plus loin** ferme la tête. C'est ce qui
# sépare « Série 2 Gran Tourer » — dont le 2 est en deuxième place mais tient
# au nom — d'un « Classe R 280 », dont le 280 est la motorisation.
def test_a_number_further_along_ends_the_head():
    assert head_phrase("Classe R 280 CDI 7GTro 4 Matic") == "classe r"
    assert head_phrase("Série 2 Gran Tourer 218dA 150ch") == "serie 2 gran tourer"


# Fait rougir `_ENGINE_CODE` : « 218dA » est un code moteur BMW, pas un nom.
def test_an_alphanumeric_engine_code_ends_the_head():
    assert head_phrase("Série 2 ActiveTourer 218d 150ch Luxury") == "serie 2 activetourer"


# Fait rougir `return " ".join(tail[:rank])` quand `rank` vaut zéro : une
# version qui commence par sa motorisation ne nomme aucun modèle, et rendre
# une tête vide vaut mieux que rendre le premier mot venu. 39 annonces.
def test_a_version_that_starts_with_its_engine_has_no_head():
    assert head_phrase("2.0 HDi 110ch Pack Ambiance") == ""


# Fait rougir `0 < len(tail) <= MAX_WORDS` : sans frontière et sans fin, la
# version est illisible plutôt que devinée — et une version vide ne nomme rien.
def test_a_version_without_any_boundary_is_judged_illegible():
    assert head_phrase("un deux trois quatre cinq six sept") == ""
    assert head_phrase(None) == ""
    assert head_phrase("F8 Tributo Base") == "f8 tributo base"


# Fait rougir `words, start = head(version)` : le préfixe de finition que
# leboncoin colle par un souligné n'est pas la tête. 3 350 versions l'écrivent.
def test_the_finish_prefix_is_not_part_of_the_head():
    assert head_phrase("Sport_Série 2 Gran Tourer 218dA 150ch Sport") == \
        "serie 2 gran tourer"
