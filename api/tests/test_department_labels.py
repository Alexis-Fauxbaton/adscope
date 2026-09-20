from adscope_api.department_labels import DEPARTMENT_LABELS, label_of
from adscope_api.region import REGIONS


def _region_departments():
    return {d for _name, departments in REGIONS.values() for d in departments}


# Fait rougir un département oublié dans `DEPARTMENT_LABELS` : les mêmes 101
# clés que `region.REGIONS`, ni plus ni moins.
def test_the_101_departments_match_the_region_table():
    assert set(DEPARTMENT_LABELS) == _region_departments()


# Fait rougir une entrée laissée vide (`""`) ou toute confusion entre deux
# départements homonymes par erreur : 101 noms, tous distincts.
def test_every_label_is_non_empty_and_distinct():
    assert all(name.strip() for name in DEPARTMENT_LABELS.values())
    assert len(set(DEPARTMENT_LABELS.values())) == 101


def test_corsican_departments_have_their_own_name():
    assert label_of("2A") == "Corse-du-Sud"
    assert label_of("2B") == "Haute-Corse"


def test_a_dom_department_has_its_name():
    assert label_of("974") == "La Réunion"


# Fait rougir `DEPARTMENT_LABELS.get(department, department)` dans son repli :
# un code non répertorié se rend tel quel, jamais une exception.
def test_an_unknown_code_falls_back_to_itself():
    assert label_of("999") == "999"
