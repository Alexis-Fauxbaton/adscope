"""La mise en texte du rapport de santé, et son code de sortie.

`Report` est construit à la main ici : la mise en page ne dépend pas de la
base, seulement des champs du rapport (voir `test_data_health.py` pour le
calcul de ces champs).
"""

from datetime import datetime, timezone

from adscope_api.data_health import Report
from adscope_api.data_health_text import render

NOW = datetime(2026, 9, 19, 8, 0, tzinfo=timezone.utc)


def bare_report(**kw):
    base = dict(
        now=NOW, total_listings=10, last_seen=NOW,
        unknown_brands=[], emerging_models=[],
        unknown_share={
            "overall": {"total": 10, "model_rate": 0.1, "brand_and_model_rate": 0.0,
                        "inferred": 0, "unresolved": 1, "inferred_rate": 0.0},
            "window": {"total": 2, "model_rate": 0.0, "brand_and_model_rate": 0.0,
                       "inferred": 0, "unresolved": 0, "inferred_rate": None},
        },
        freshness=[],
        field_fill_rate={
            "overall": {"total": 10, "fuel_rate": 0.5, "gearbox_rate": 0.5,
                        "department_rate": 0.5},
            "window": {"total": 2, "fuel_rate": 1.0, "gearbox_rate": 1.0,
                       "department_rate": 1.0},
        },
        model_named_by_version={"count": 0, "population": 0, "rate": None},
    )
    base.update(kw)
    return Report(**base)


# Fait rougir `f"Rapport de santé — {report.now:%Y-%m-%d %H:%M} UTC"` : sans
# elle, le rapport ne date pas ce qu'il dit.
def test_the_head_line_carries_the_date_and_the_size():
    text = render(bare_report())
    assert "Rapport de santé — 2026-09-19 08:00 UTC" in text
    assert "10 annonces en base" in text


# Fait rougir `lines.append(f"  - {row['brand']} ({row['count']} annonces)")` :
# une marque inconnue doit se lire avec son compte.
def test_an_unknown_brand_line_shows_the_count():
    text = render(bare_report(unknown_brands=[{"brand": "Zorglub", "count": 4}]))
    assert "  - Zorglub (4 annonces)" in text


# Fait rougir la branche `else: lines.append("  - aucune")` : sans marque
# inconnue, le rapport le dit plutôt que de laisser la section vide.
def test_no_unknown_brand_says_so():
    text = render(bare_report())
    assert "Marques inconnues de shared/vehicle-aliases.json :\n  - aucune" in text


# Fait rougir l'affichage du libellé calculé dans la section des modèles
# apparus : c'est lui qui permet de repérer une écriture à corriger.
def test_an_emerging_model_line_shows_the_computed_label():
    text = render(bare_report(emerging_models=[
        {"brand": "Fiat", "model": "Panda", "count": 5, "label": "Fiat Panda"},
    ]))
    assert "  - Fiat / Panda (5 annonces) → affiché « Fiat Panda »" in text


# Fait rougir la branche « trop peu pour conclure » : sous le volume minimal,
# le rapport ne doit jamais afficher une part chiffrée.
def test_freshness_below_volume_says_too_little_to_conclude():
    text = render(bare_report(freshness=[{
        "site": "lc", "current": {"new": 4, "exact": 1}, "previous": {"new": 3, "exact": 3},
        "current_ratio": 0.25, "previous_ratio": 1.0,
        "enough_volume": False, "alert": False,
    }]))
    assert "lc : 4 nouvelles annonces (fenêtre précédente : 3) — trop peu pour conclure" in text
    assert "25.0%" not in text


# Fait rougir les lignes de `rate = report.field_fill_rate` : les trois taux
# de remplissage se lisent, base entière et fenêtre.
def test_the_field_fill_rate_line_shows_the_three_rates():
    text = render(bare_report(field_fill_rate={
        "overall": {"total": 100, "fuel_rate": 0.3, "gearbox_rate": 0.4,
                    "department_rate": 0.5},
        "window": {"total": 20, "fuel_rate": 1.0, "gearbox_rate": 1.0,
                   "department_rate": 1.0},
    }))
    assert "toute la base (100 annonces) : 30.0% / 40.0% / 50.0%" in text
    assert "fenêtre (20 annonces) : 100.0% / 100.0% / 100.0%" in text


# Fait rougir `named = report.model_named_by_version` : l'information promise
# à Alexis se lit, jamais préfixée « ALERTE ».
def test_the_model_named_by_version_line_is_informational_not_an_alert():
    text = render(bare_report(model_named_by_version={
        "count": 74, "population": 16167, "rate": 74 / 16167,
    }))
    assert "74 sur 16167" in text
    assert "ALERTE" not in text


# Fait rougir `if report.alerts: lines += ["", *(f"ALERTE : {a}" ...)]` :
# l'alerte doit apparaître dans le texte, pas seulement dans les données.
def test_an_alert_shows_up_in_the_text():
    text = render(bare_report(freshness=[{
        "site": "lbc", "current": {"new": 60, "exact": 12}, "previous": {"new": 55, "exact": 55},
        "current_ratio": 0.2, "previous_ratio": 1.0,
        "enough_volume": True, "alert": True,
    }]))
    assert "ALERTE : lbc : la part de dates exactes tombe à 20%" in text
    assert "Code de sortie : 1" in text


# Fait rougir `f"Code de sortie : {1 if report.alerts else 0}"` dans l'autre
# sens : sans alerte, le rapport annonce un code nul.
def test_no_alert_announces_exit_code_zero():
    text = render(bare_report())
    assert "Code de sortie : 0" in text
    assert "ALERTE" not in text


# Fait rougir `if not row["count"]: lines.append(f"  - {title} : aucune
# donnée encore")` : tant qu'aucune annonce ne permet de vérifier une règle,
# le rapport le dit plutôt que de rester silencieux.
def test_an_unverified_rule_at_zero_says_no_data_yet():
    text = render(bare_report())
    assert "Corse (département 2A/2B) : aucune donnée encore" in text


# Fait rougir la branche non nulle : dès qu'il y a de quoi vérifier une
# règle, le rapport le dit « maintenant », avec le compte et trois exemples.
def test_an_unverified_rule_with_data_calls_it_out_with_examples():
    text = render(bare_report(unverified_rules={
        "corsica": {"count": 5, "examples": [
            {"site": "lbc", "site_id": "1"}, {"site": "lbc", "site_id": "2"},
            {"site": "lc", "site_id": "3"},
        ]},
        "lacentrale_fuel": {"count": 0, "examples": []},
        "lacentrale_gearbox": {"count": 0, "examples": []},
    }))
    assert (
        "Corse (département 2A/2B) : à vérifier maintenant — 5 annonces "
        "(ex. lbc/1, lbc/2, lc/3)" in text
    )
    assert "ALERTE" not in text
    assert "Code de sortie : 0" in text


# Fait rougir `else: lines.append("  - aucune annonce avec carburant
# renseigné")` : sans aucune annonce à carburant connu, le rapport le dit.
def test_no_fuel_other_share_says_so():
    text = render(bare_report())
    assert "aucune annonce avec carburant renseigné" in text


# Fait rougir la boucle qui affiche `report.fuel_other_share` : la part de
# « autre » se lit par site, jamais confondue entre deux sites.
def test_the_fuel_other_share_line_shows_each_site():
    text = render(bare_report(fuel_other_share=[
        {"site": "lbc", "total": 100, "other": 5, "rate": 0.05},
        {"site": "lc", "total": 40, "other": 20, "rate": 0.5},
    ]))
    assert "lbc : 5.0% sur 100 annonces avec carburant renseigné" in text
    assert "lc : 50.0% sur 40 annonces avec carburant renseigné" in text


# Fait rougir la ligne « modèle déduit de la version » de `render` : la part
# des « Autres » que la déduction a résolus, et ce qui lui résiste.
def test_the_deduced_model_line_shows_what_was_resolved_and_what_remains():
    text = render(bare_report(unknown_share={
        "overall": {"total": 10, "model_rate": 0.2, "brand_and_model_rate": 0.0,
                    "inferred": 3, "unresolved": 17, "inferred_rate": 0.15},
        "window": {"total": 2, "model_rate": 0.0, "brand_and_model_rate": 0.0,
                   "inferred": 0, "unresolved": 0, "inferred_rate": None},
    }))
    assert "modèle déduit de la version : 15.0%" in text
    assert "(3)" in text and "17 restent non précisées" in text
