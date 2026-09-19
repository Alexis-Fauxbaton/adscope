from adscope_api.region import REGIONS, departments_of, of_department


def _all_departments():
    return [d for _name, departments in REGIONS.values() for d in departments]


# Fait rougir un département oublié dans une case de `REGIONS` : les 101
# départements (96 de métropole, 2A/2B compris, plus les 5 DOM) ont chacun une
# région.
def test_every_one_of_the_101_departments_has_a_region():
    all_departments = _all_departments()
    assert len(all_departments) == 101
    assert all(of_department(d) is not None for d in all_departments)


# Fait rougir un département recopié dans deux cases de `REGIONS` par erreur :
# jamais deux régions pour un seul département.
def test_no_department_belongs_to_two_regions():
    all_departments = _all_departments()
    assert len(all_departments) == len(set(all_departments))


# Fait rougir deux régions fusionnées ou dédoublées par erreur : dix-huit
# noms distincts, comme le découpage officiel en vigueur depuis 2016.
def test_there_are_eighteen_distinct_regions():
    names = {name for name, _departments in REGIONS.values()}
    assert len(names) == 18


def test_corsican_departments_map_to_corse():
    assert of_department("2A") == "Corse"
    assert of_department("2B") == "Corse"


def test_a_dom_department_maps_to_its_own_region():
    assert of_department("974") == "La Réunion"


def test_paris_maps_to_ile_de_france():
    assert of_department("75") == "Île-de-France"


def test_the_rhone_maps_to_auvergne_rhone_alpes():
    assert of_department("69") == "Auvergne-Rhône-Alpes"


def test_bouches_du_rhone_maps_to_paca():
    assert of_department("13") == "Provence-Alpes-Côte d'Azur"


# Fait rougir `DEPARTMENT_TO_REGION.get(department)` : un département inconnu
# (ou absent) ne devine rien.
def test_an_unrecognized_department_has_no_region():
    assert of_department("999") is None
    assert of_department(None) is None


# Fait rougir `entry[1] if entry else None` dans son sens positif : un
# identifiant de région connu rend ses départements.
def test_departments_of_a_known_region():
    assert departments_of("corse") == ("2A", "2B")


# Même ligne, dans le sens négatif : un identifiant inconnu ne devine rien,
# à charge pour l'appelant HTTP d'en faire un 422 (voir `market.py`).
def test_departments_of_an_unknown_region_is_none():
    assert departments_of("atlantide") is None
