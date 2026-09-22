from adscope_api.vocab import FUEL_VALUES, GEARBOX_VALUES, canonical


# Fait rougir `if value is None: return None` : une observation muette sur le
# champ n'apprend rien, `observations.record` ne doit rien écraser.
def test_a_missing_value_stays_missing():
    assert canonical(None, FUEL_VALUES, "fuel") is None


# Fait rougir `folded = value.strip().lower()` : la casse et les espaces du
# site n'inventent pas une seconde entrée du vocabulaire.
def test_a_value_is_folded_to_lowercase_ascii():
    assert canonical(" Diesel ", FUEL_VALUES, "fuel") == "diesel"


# Fait rougir `if folded in values: return folded` : une valeur du vocabulaire
# passe telle quelle.
def test_a_known_gearbox_value_passes_through():
    assert canonical("automatique", GEARBOX_VALUES, "gearbox") == "automatique"


# Fait rougir `return OTHER` : une valeur hors vocabulaire ne fait pas échouer
# l'observation, elle se range dans le seau commun. Le kérosène n'est le
# carburant d'aucune annonce de voiture d'occasion : il ne rejoindra jamais le
# vocabulaire fermé, contrairement au GNV et à l'Hydrogène (`test_vocab.py`
# plus bas), et sert donc d'exemple stable de valeur hors vocabulaire.
def test_an_unknown_value_falls_back_to_autre(caplog):
    assert canonical("kerosene", FUEL_VALUES, "fuel") == "autre"


# Fait rougir `folded = ... if isinstance(value, str) else None` : un type
# inattendu (un entier envoyé pour un champ texte) ne casse pas la validation,
# il tombe dans le même seau que le reste de ce qu'on ne reconnaît pas.
def test_a_non_string_value_falls_back_to_autre():
    assert canonical(4, FUEL_VALUES, "fuel") == "autre"


# Fait rougir `log.warning(...)` : la valeur hors vocabulaire est journalisée,
# pas seulement rangée en silence.
def test_an_unknown_value_is_logged(caplog):
    with caplog.at_level("WARNING", logger="adscope.vocab"):
        canonical("kerosene", FUEL_VALUES, "fuel")
    assert "kerosene" in caplog.text


# Fait rougir `OTHER` mis au lieu de `"gnv"`/`"hydrogene"` dans `FUEL_VALUES` :
# les deux codes leboncoin relevés le 2026-09-19 (7 et 9) ont leur propre case,
# `autre` ne recueille plus que le code 5.
def test_gnv_and_hydrogen_are_not_lumped_into_autre():
    assert canonical("gnv", FUEL_VALUES, "fuel") == "gnv"
    assert canonical("hydrogene", FUEL_VALUES, "fuel") == "hydrogene"


# Fait rougir un retrait ou un ajout silencieux dans `FUEL_VALUES`/
# `GEARBOX_VALUES` : ce vocabulaire est dupliqué côté extension
# (`extension/src/sites/leboncoin.js`, table `FUEL`, et
# `tests/vehicle-fields.test.mjs` qui le fige à son tour) faute d'un fichier
# `shared/` commun pour ce genre de liste aujourd'hui — un écart entre les deux
# doit se voir au diff des deux tests, pas rester silencieux. `ethanol` (F2)
# n'a pas de code leboncoin connu (`sweep_url.FUEL_CODES`) : il entre au
# vocabulaire de l'API sans entrer dans la table `FUEL` de l'extension, donc
# `vehicle-fields.test.mjs` reste à neuf valeurs, celui-ci en gagne une.
def test_the_fuel_vocabulary_matches_what_the_extension_sends():
    assert FUEL_VALUES == (
        "essence", "diesel", "hybride", "hybride_rechargeable", "electrique",
        "gpl", "gnv", "hydrogene", "ethanol", "autre",
    )


def test_the_gearbox_vocabulary_matches_what_the_extension_sends():
    assert GEARBOX_VALUES == ("manuelle", "automatique", "autre")
