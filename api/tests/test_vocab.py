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
# l'observation, elle se range dans le seau commun.
def test_an_unknown_value_falls_back_to_autre(caplog):
    assert canonical("gnv", FUEL_VALUES, "fuel") == "autre"


# Fait rougir `folded = ... if isinstance(value, str) else None` : un type
# inattendu (un entier envoyé pour un champ texte) ne casse pas la validation,
# il tombe dans le même seau que le reste de ce qu'on ne reconnaît pas.
def test_a_non_string_value_falls_back_to_autre():
    assert canonical(4, FUEL_VALUES, "fuel") == "autre"


# Fait rougir `log.warning(...)` : la valeur hors vocabulaire est journalisée,
# pas seulement rangée en silence.
def test_an_unknown_value_is_logged(caplog):
    with caplog.at_level("WARNING", logger="adscope.vocab"):
        canonical("gnv", FUEL_VALUES, "fuel")
    assert "gnv" in caplog.text
