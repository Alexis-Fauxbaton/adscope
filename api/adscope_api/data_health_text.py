"""Le rapport de santé mis en texte, pour un humain (voir `data_health.py`).

Séparé du calcul : la mise en page ne se teste pas de la même façon que les
requêtes, et ce module à lui seul dépasserait les 150 lignes avec elles.
"""

from .data_health import Report


def _pct(rate) -> str:
    return "—" if rate is None else f"{rate:.1%}"


def render(report: Report) -> str:
    lines = [
        f"Rapport de santé — {report.now:%Y-%m-%d %H:%M} UTC",
        f"{report.total_listings} annonces en base, dernière vue le "
        f"{report.last_seen:%Y-%m-%d %H:%M} UTC" if report.last_seen
        else f"{report.total_listings} annonces en base, aucune vue",
        "",
        "Marques inconnues de shared/vehicle-aliases.json :",
    ]
    if report.unknown_brands:
        for row in report.unknown_brands:
            lines.append(f"  - {row['brand']} ({row['count']} annonces)")
    else:
        lines.append("  - aucune")

    lines += ["", "Modèles apparus dans la fenêtre (>= 5 annonces) :"]
    if report.emerging_models:
        for row in report.emerging_models:
            lines.append(
                f"  - {row['brand']} / {row['model']} ({row['count']} annonces) "
                f"→ affiché « {row['label']} »"
            )
    else:
        lines.append("  - aucun")

    overall, window = report.unknown_share["overall"], report.unknown_share["window"]
    lines += [
        "", "Part d'« Autres » :",
        f"  - modèle : {_pct(overall['model_rate'])} sur toute la base, "
        f"{_pct(window['model_rate'])} sur la fenêtre",
        f"  - marque + modèle : {_pct(overall['brand_and_model_rate'])} sur "
        f"toute la base, {_pct(window['brand_and_model_rate'])} sur la fenêtre",
        f"  - modèle déduit de la version : {_pct(overall['inferred_rate'])} des "
        f"annonces sans modèle du site ({overall['inferred']}), "
        f"{overall['unresolved']} restent non précisées",
    ]

    lines += ["", "Date de première publication, par site :"]
    if report.freshness:
        for row in report.freshness:
            cur, prev = row["current"], row["previous"]
            if not row["enough_volume"]:
                lines.append(
                    f"  - {row['site']} : {cur['new']} nouvelles annonces "
                    f"(fenêtre précédente : {prev['new']}) — trop peu pour conclure"
                )
            else:
                lines.append(
                    f"  - {row['site']} : {cur['new']} nouvelles annonces, "
                    f"{_pct(row['current_ratio'])} avec date exacte "
                    f"(fenêtre précédente : {prev['new']}, "
                    f"{_pct(row['previous_ratio'])})"
                )
    else:
        lines.append("  - aucune nouvelle annonce sur les deux fenêtres")

    rate = report.field_fill_rate
    lines += [
        "", "Remplissage de carburant / boîte / département :",
        f"  - toute la base ({rate['overall']['total']} annonces) : "
        f"{_pct(rate['overall']['fuel_rate'])} / {_pct(rate['overall']['gearbox_rate'])} / "
        f"{_pct(rate['overall']['department_rate'])}",
        f"  - fenêtre ({rate['window']['total']} annonces) : "
        f"{_pct(rate['window']['fuel_rate'])} / {_pct(rate['window']['gearbox_rate'])} / "
        f"{_pct(rate['window']['department_rate'])}",
    ]

    named = report.model_named_by_version
    lines += [
        "", "Version qui nomme un autre modèle connu de la marque (information, "
        "jamais une alerte) :",
        f"  - {named['count']} sur {named['population']} ({_pct(named['rate'])})",
    ]

    lines += ["", "Règles pas encore vérifiées sur données réelles :"]
    for key, title in (
        ("corsica", "Corse (département 2A/2B)"),
        ("lacentrale_fuel", "La Centrale, carburant hors essence/diesel"),
        ("lacentrale_gearbox", "La Centrale, boîte renseignée"),
    ):
        row = report.unverified_rules.get(key, {"count": 0, "examples": []})
        if not row["count"]:
            lines.append(f"  - {title} : aucune donnée encore")
        else:
            examples = ", ".join(f"{e['site']}/{e['site_id']}" for e in row["examples"])
            lines.append(
                f"  - {title} : à vérifier maintenant — {row['count']} annonces "
                f"(ex. {examples})"
            )

    lines += ["", "Part de « autre » par site (carburant, information seulement) :"]
    if report.fuel_other_share:
        for row in report.fuel_other_share:
            lines.append(
                f"  - {row['site']} : {_pct(row['rate'])} sur {row['total']} annonces "
                f"avec carburant renseigné"
            )
    else:
        lines.append("  - aucune annonce avec carburant renseigné")

    if report.alerts:
        lines += ["", *(f"ALERTE : {a}" for a in report.alerts)]
    lines += ["", f"Code de sortie : {1 if report.alerts else 0}"]
    return "\n".join(lines)
