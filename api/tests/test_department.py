from adscope_api.department import is_complete, normalize, of_postal_code


# Fait rougir `len(postal_code) == 5 and postal_code.isdigit()` : un fragment
# n'est pas un code postal complet.
def test_a_five_digit_code_is_complete():
    assert is_complete("75015") is True
    assert is_complete("92") is False
    assert is_complete(None) is False


# Fait rougir `upper = value.strip().upper()` puis `_CODE.fullmatch` : un
# département reçu directement est accepté sous sa forme usuelle.
def test_a_two_digit_department_is_accepted_as_is():
    assert normalize("44") == "44"


# Fait rougir la même ligne côté DOM : trois chiffres sont un département
# valide, pas seulement deux.
def test_a_three_digit_department_is_accepted():
    assert normalize("974") == "974"


# Fait rougir `2[AB]` dans `_CODE` et la mise en capitale : la Corse écrite en
# minuscules reste valide.
def test_corsican_departments_are_accepted_case_insensitively():
    assert normalize("2a") == "2A"
    assert normalize("2b") == "2B"


# Fait rougir `return upper if _CODE.fullmatch(upper) else None` : un
# département ne se tronque jamais, une valeur illisible est ignorée.
def test_an_unrecognizable_department_is_ignored():
    assert normalize("Île-de-France") is None
    assert normalize("1") is None


# Fait rougir `if not isinstance(value, str): return None` dans `is_complete`,
# atteint via `of_postal_code` : un code postal absent ne dérive rien.
def test_no_department_is_derived_from_a_missing_postal_code():
    assert of_postal_code(None) is None


# Fait rougir `return postal_code[:2]` : la règle usuelle, hors Corse et DOM.
def test_the_metropolitan_department_is_the_first_two_digits():
    assert of_postal_code("69003") == "69"


# Fait rougir `"2A" if int(postal_code) < 20200 else "2B"` dans le sens bas.
def test_corsica_below_20200_is_2a():
    assert of_postal_code("20090") == "2A"


# Fait rougir la même ligne dans le sens haut.
def test_corsica_from_20200_is_2b():
    assert of_postal_code("20200") == "2B"
    assert of_postal_code("20600") == "2B"


# Fait rougir `if _DOM.match(postal_code): return postal_code[:3]` : le
# département des DOM tient sur trois chiffres, jamais deux.
def test_a_dom_postal_code_gives_a_three_digit_department():
    assert of_postal_code("97410") == "974"


# Fait rougir `is_complete` traversé par `of_postal_code` : un code
# incomplet ou non numérique ne dérive rien plutôt qu'un département faux.
def test_an_incomplete_postal_code_derives_nothing():
    assert of_postal_code("920") is None
    assert of_postal_code("ABCDE") is None
