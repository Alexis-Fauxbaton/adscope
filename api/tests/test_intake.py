"""Ce qu'une observation gagne : carburant, boîte, département — trois faits
optionnels, jamais dans l'empreinte véhicule.
"""

from adscope_api.intake import ObservationIn


def obs(**kw):
    base = dict(site="lc", site_id="1")
    base.update(kw)
    return ObservationIn(**base)


# Fait rougir `values = FUEL_VALUES if info.field_name == "fuel" else
# GEARBOX_VALUES` puis `vocab_canonical` : une valeur du vocabulaire, plié en
# minuscules, passe telle quelle.
def test_fuel_and_gearbox_are_folded_to_the_closed_vocabulary():
    assert obs(fuel=" Diesel ", gearbox="AUTOMATIQUE").fuel == "diesel"
    assert obs(fuel=" Diesel ", gearbox="AUTOMATIQUE").gearbox == "automatique"


# Fait rougir `vocab_canonical` sur la branche hors vocabulaire : l'observation
# entière n'est pas perdue pour un fait secondaire, la valeur se range en
# « autre ».
def test_an_unknown_fuel_falls_back_to_autre_without_rejecting_the_observation():
    assert obs(fuel="gnv").fuel == "autre"


# Fait rougir `code if department.is_complete(code) else None` : un
# fragment de code postal n'est pas retenu.
def test_an_incomplete_postal_code_is_ignored():
    assert obs(postal_code="92").postal_code is None


def test_a_complete_postal_code_is_kept():
    assert obs(postal_code="75015").postal_code == "75015"


# Fait rougir `department.normalize(value)` : un département reçu qui ne
# ressemble à rien n'est pas retenu.
def test_an_unrecognizable_department_is_ignored():
    assert obs(department="Île-de-France").department is None


def test_a_valid_department_is_kept_and_uppercased():
    assert obs(department="2a").department == "2A"


# Fait rougir `derived = department.of_postal_code(self.postal_code)` dans
# `_derive_department` : seul le code postal arrive, le département en est
# déduit.
def test_the_department_is_derived_from_the_postal_code_alone():
    assert obs(postal_code="97410").department == "974"


# Fait rougir `if self.department is None and self.postal_code is not None` :
# un département donné par le site fait autorité, il ne se fait pas écraser
# par ce qu'on déduirait du code postal.
def test_a_department_given_directly_is_never_overridden_by_the_derivation():
    assert obs(postal_code="75015", department="93").department == "93"


# Fait rougir la même ligne dans l'autre sens : sans code postal, rien à
# dériver, le département reste absent.
def test_no_department_without_either_field():
    assert obs().department is None
