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
            "overall": {"total": 10, "model_rate": 0.1, "brand_and_model_rate": 0.0},
            "window": {"total": 2, "model_rate": 0.0, "brand_and_model_rate": 0.0},
        },
        freshness=[],
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
