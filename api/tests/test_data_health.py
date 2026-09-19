"""Le rapport de santé des données : chaque section sur des données construites.

Pas d'horloge réelle : `NOW` est injecté partout, comme `data_health` l'exige
de son appelant.
"""

from datetime import datetime, timedelta, timezone

from adscope_api.data_health import Report, compute, head_line
from adscope_api.data_health_fields import field_fill_rate, version_names_another_model
from adscope_api.data_health_queries import (
    MIN_WINDOW_LISTINGS, emerging_models, publication_freshness, unknown_brands,
    unknown_share,
)
from adscope_api.data_health_unverified import fuel_other_share_by_site, unverified_rules
from adscope_api.models import Listing
from adscope_api.taxonomy import derive

NOW = datetime(2026, 9, 19, 8, 0, tzinfo=timezone.utc)
WEEK = timedelta(days=7)


def add(session, site, site_id, first_seen, *, brand="Renault", model="Clio",
        version=None, published_at=None, last_seen=None, fuel=None, gearbox=None,
        department=None):
    row = Listing(site=site, site_id=site_id, first_seen=first_seen,
                  last_seen=last_seen or first_seen, observations=1, brand=brand,
                  model=model, version=version, published_at=published_at,
                  fuel=fuel, gearbox=gearbox, department=department)
    derive(row)
    session.add(row)
    return row


# Fait rougir `total = session.scalar(select(func.count(Listing.id))) or 0` :
# sans elle, la ligne de tête ne compte pas la base.
def test_head_line_counts_the_base(session):
    add(session, "lbc", "1", NOW)
    add(session, "lbc", "2", NOW - timedelta(days=1))
    session.commit()
    head = head_line(session, NOW)
    assert head["total"] == 2
    assert head["last_seen"] == NOW


# Fait rougir `if not key or key in _BRANDS: continue` dans `unknown_brands` :
# sans elle, une marque du fichier (« Renault ») apparaîtrait comme inconnue.
def test_a_known_brand_never_shows_as_unknown(session):
    add(session, "lbc", "1", NOW, brand="Renault", model="Clio")
    session.commit()
    assert unknown_brands(session) == []


# Fait rougir l'accumulation `entry["count"] += count` : deux écritures d'une
# même marque inconnue se somment sur une seule ligne, avec la plus fréquente
# des deux écritures retenue.
def test_an_unknown_brand_is_reported_with_its_count_and_spelling(session):
    for n in range(3):
        add(session, "lbc", f"a{n}", NOW, brand="Zorglub", model="X")
    add(session, "lbc", "b0", NOW, brand="ZORGLUB", model="X")
    session.commit()
    rows = unknown_brands(session)
    assert rows == [{"brand": "Zorglub", "count": 4}]


# Fait rougir `having(func.count(Listing.id) >= min_listings)` : en dessous du
# seuil, un modèle apparu ne remonte pas.
def test_a_model_below_the_threshold_does_not_appear(session):
    for n in range(4):
        add(session, "lbc", f"a{n}", NOW - timedelta(hours=1), brand="Fiat", model="Panda")
    session.commit()
    assert emerging_models(session, NOW - WEEK, NOW) == []


# Même ligne, dans l'autre sens, et `label(brand, model, None)` : le libellé
# affiché accompagne la ligne.
def test_a_model_at_the_threshold_appears_with_its_label(session):
    for n in range(5):
        add(session, "lbc", f"a{n}", NOW - timedelta(hours=1), brand="Fiat", model="Panda")
    session.commit()
    rows = emerging_models(session, NOW - WEEK, NOW)
    assert rows == [{"brand": "Fiat", "model": "Panda", "count": 5, "label": "Fiat Panda"}]


# Fait rougir `Listing.first_seen >= since, Listing.first_seen < now` : une
# annonce vue avant la fenêtre ne compte pas comme apparue dedans, même si le
# modèle atteint le seuil ailleurs.
def test_a_model_seen_only_before_the_window_does_not_appear(session):
    for n in range(5):
        add(session, "lbc", f"a{n}", NOW - WEEK - timedelta(days=1), brand="Fiat", model="Panda")
    session.commit()
    assert emerging_models(session, NOW - WEEK, NOW) == []


# Fait rougir `func.count(Listing.id).filter(Listing.canon_model ==
# _UNKNOWN_KEY)` : sans le filtre, la part de modèles inconnus ne se
# distingue pas du total.
# « Autres » est ce que le site écrit lui-même quand il ne connaît pas le
# modèle (voir `taxonomy.UNKNOWN`) — jamais un modèle nul.
def test_unknown_share_model_share_counts_only_the_unknown_model(session):
    add(session, "lbc", "1", NOW, brand="Renault", model="Clio")
    add(session, "lbc", "2", NOW, brand="Renault", model="Autres")
    session.commit()
    share = unknown_share(session, NOW - WEEK, NOW)
    assert share["overall"]["model_rate"] == 0.5


# Fait rougir la seconde branche du filtre — marque *et* modèle inconnus — qui
# doit rester strictement sous la part du modèle seul.
def test_unknown_share_brand_and_model_share_is_stricter_than_model_alone(session):
    add(session, "lbc", "1", NOW, brand="Renault", model="Autres")  # modèle seul
    add(session, "lbc", "2", NOW, brand="Autres", model="Autres")   # les deux
    session.commit()
    share = unknown_share(session, NOW - WEEK, NOW)
    assert share["overall"]["model_rate"] == 1.0
    assert share["overall"]["brand_and_model_rate"] == 0.5


# Fait rougir `if since is not None: query = query.where(...)` : la part sur
# la fenêtre ne doit pas compter ce qui est hors fenêtre.
def test_unknown_share_the_window_excludes_older_listings(session):
    add(session, "lbc", "1", NOW - WEEK - timedelta(days=1), brand="Autres", model="Autres")
    add(session, "lbc", "2", NOW - timedelta(hours=1), brand="Renault", model="Clio")
    session.commit()
    share = unknown_share(session, NOW - WEEK, NOW)
    assert share["overall"]["model_rate"] == 0.5
    assert share["window"]["model_rate"] == 0.0


def freshness_batch(session, site, since, tag, *, total, exact):
    """`total` annonces vues dans `[since, since + total minutes)`, dont
    `exact` avec `published_at` posé — les autres sans date exacte."""
    for n in range(total):
        add(session, site, f"{tag}{n}", since + timedelta(minutes=n),
            published_at=since if n < exact else None)


# Fait rougir `cur_ratio < FRESHNESS_ALERT_BELOW and prev_ratio >
# FRESHNESS_BASELINE_ABOVE` dans `publication_freshness` : une chute de 100 %
# à 20 % de dates exactes, sur assez de volume, doit alerter.
def test_freshness_alerts_on_a_real_drop(session):
    freshness_batch(session, "lbc", NOW - WEEK, "cur", total=10, exact=2)
    freshness_batch(session, "lbc", NOW - 2 * WEEK, "prev", total=10, exact=10)
    session.commit()
    rows = publication_freshness(session, NOW, WEEK, min_listings=5)
    assert rows == [{
        "site": "lbc", "current": {"new": 10, "exact": 2},
        "previous": {"new": 10, "exact": 10},
        "current_ratio": 0.2, "previous_ratio": 1.0,
        "enough_volume": True, "alert": True,
    }]


# Fait rougir `enough = cur["new"] >= min_listings and prev["new"] >=
# min_listings` : la même chute, sous le volume minimal, ne doit jamais
# alerter — « trop peu pour conclure ».
def test_freshness_stays_silent_below_the_minimum_volume(session):
    freshness_batch(session, "lbc", NOW - WEEK, "cur", total=10, exact=2)
    freshness_batch(session, "lbc", NOW - 2 * WEEK, "prev", total=10, exact=10)
    session.commit()
    rows = publication_freshness(session, NOW, WEEK)  # seuil par défaut : 50
    assert rows[0]["enough_volume"] is False
    assert rows[0]["alert"] is False


# Fait rougir `MIN_WINDOW_LISTINGS = 50` : c'est le seuil que le rapport
# applique par défaut, celui donné dans le brief.
def test_the_default_minimum_volume_is_fifty():
    assert MIN_WINDOW_LISTINGS == 50


# Fait rougir la borne `> FRESHNESS_BASELINE_ABOVE` : sans une fenêtre
# précédente déjà quasi parfaite, une chute ne prouve rien — le site a peut-être
# toujours été médiocre sur ce point.
def test_freshness_stays_silent_without_an_established_baseline(session):
    freshness_batch(session, "lbc", NOW - WEEK, "cur", total=10, exact=2)
    freshness_batch(session, "lbc", NOW - 2 * WEEK, "prev", total=10, exact=9)
    session.commit()
    rows = publication_freshness(session, NOW, WEEK, min_listings=5)
    assert rows[0]["previous_ratio"] == 0.9
    assert rows[0]["alert"] is False


# Fait rougir la borne `< FRESHNESS_ALERT_BELOW` : une part encore à 90 % ou
# au-dessus n'est pas une alerte, même après un excellent passé.
def test_freshness_stays_silent_when_still_at_the_threshold(session):
    freshness_batch(session, "lbc", NOW - WEEK, "cur", total=10, exact=9)
    freshness_batch(session, "lbc", NOW - 2 * WEEK, "prev", total=10, exact=10)
    session.commit()
    rows = publication_freshness(session, NOW, WEEK, min_listings=5)
    assert rows[0]["current_ratio"] == 0.9
    assert rows[0]["alert"] is False


# Fait rougir la compréhension de liste de `Report.alerts` : seules les lignes
# à `alert=True` doivent produire un message, avec le site et les deux parts.
def test_report_alerts_lists_only_the_rows_that_alert(session):
    freshness_batch(session, "lbc", NOW - WEEK, "cur", total=10, exact=2)
    freshness_batch(session, "lbc", NOW - 2 * WEEK, "prev", total=10, exact=10)
    session.commit()
    report = Report(
        now=NOW, total_listings=0, last_seen=None,
        freshness=publication_freshness(session, NOW, WEEK, min_listings=5),
    )
    assert report.alerts == [
        "lbc : la part de dates exactes tombe à 20% (elle dépassait 100% la "
        "fenêtre précédente)"
    ]


# Fait rougir `fuel / total` (et les deux voisines) dans `_rate` : le taux ne
# compte que ce qui est effectivement posé.
def test_field_fill_rate_counts_what_is_actually_set(session):
    add(session, "lbc", "1", NOW, fuel="diesel", gearbox="automatique", department="75")
    add(session, "lbc", "2", NOW)
    session.commit()
    rate = field_fill_rate(session, NOW - WEEK, NOW)
    assert rate["overall"] == {
        "total": 2, "fuel_rate": 0.5, "gearbox_rate": 0.5, "department_rate": 0.5,
    }


# Fait rougir `query.where(Listing.last_seen >= since, Listing.last_seen <
# now)` : la fenêtre porte sur ce qui a été *revu*, pas sur ce qui est apparu —
# une annonce ancienne que le balayage vient de compléter doit compter.
def test_field_fill_rate_window_counts_what_was_seen_not_what_is_new(session):
    add(session, "lbc", "1", NOW - 2 * WEEK, last_seen=NOW - timedelta(hours=1),
        fuel="diesel")
    session.commit()
    rate = field_fill_rate(session, NOW - WEEK, NOW)
    assert rate["window"] == {
        "total": 1, "fuel_rate": 1.0, "gearbox_rate": 0.0, "department_rate": 0.0,
    }


# Fait rougir `if not total: ... None` : une base vide ne rend pas une
# division par zéro, elle ne rend rien à lire.
def test_field_fill_rate_is_none_on_an_empty_window(session):
    rate = field_fill_rate(session, NOW - WEEK, NOW)
    assert rate["window"] == {
        "total": 0, "fuel_rate": None, "gearbox_rate": None, "department_rate": None,
    }


# Fait rougir `having(func.count(Listing.id) >= min_listings)` dans
# `_known_models_by_brand` : sous le seuil, « Scénic » n'est pas un modèle
# connu, une version qui le nomme ne compte donc pas comme contredite.
def test_version_naming_a_model_below_the_threshold_does_not_count(session):
    add(session, "lbc", "megane", NOW, brand="Renault", model="Mégane", version="Scénic 1.5")
    add(session, "lbc", "scenic0", NOW, brand="Renault", model="Scénic")
    session.commit()
    result = version_names_another_model(session, min_listings=2)
    assert result == {"count": 0, "population": 1, "rate": 0.0}


# Fait rougir `if any(version_names_model(version, other) for other in
# known.get(brand, set()) - {model})` : au-dessus du seuil, la version qui
# nomme un autre modèle connu de la marque compte.
def test_version_naming_a_known_model_of_the_same_brand_counts(session):
    add(session, "lbc", "megane", NOW, brand="Renault", model="Mégane", version="Scénic 1.5")
    for n in range(5):
        add(session, "lbc", f"scenic{n}", NOW, brand="Renault", model="Scénic")
    session.commit()
    result = version_names_another_model(session, min_listings=5)
    assert result == {"count": 1, "population": 1, "rate": 1.0}


# Fait rougir `known.get(brand, set()) - {model}` : le modèle déclaré est
# retiré de la comparaison, une version qui ne fait que le répéter n'est pas
# une contradiction.
def test_a_version_that_only_repeats_the_declared_model_does_not_count(session):
    for n in range(5):
        add(session, "lbc", f"clio{n}", NOW, brand="Renault", model="Clio", version="Clio V")
    session.commit()
    result = version_names_another_model(session, min_listings=5)
    assert result == {"count": 0, "population": 5, "rate": 0.0}


# Fait rougir `if not _is_sub_model(other, model)` : « C3 Aircross » est un
# C3 dit plus précisément, sa version commence par « C3 » sans contredire
# personne — mesuré sur la base réelle (Citroën C3 / C3 Aircross).
def test_a_sub_model_is_not_a_contradiction(session):
    for n in range(5):
        add(session, "lbc", f"c3-{n}", NOW, brand="Citroen", model="C3")
    for n in range(5):
        add(session, "lbc", f"aircross{n}", NOW, brand="Citroen", model="C3 Aircross",
            version="C3 Aircross PureTech 110ch")
    session.commit()
    result = version_names_another_model(session, min_listings=5)
    assert result["count"] == 0


# Fait rougir `_is_bare_number` : un modèle réduit à un seul nombre (« 200 »
# chez Mercedes) est un code de finition mal extrait, pas un modèle — mesuré
# sur la base réelle, où il multipliait le compte par sept.
def test_a_bare_numeric_model_is_never_considered_known(session):
    for n in range(5):
        add(session, "lbc", f"n{n}", NOW, brand="Mercedes", model="200")
    for n in range(5):
        add(session, "lbc", f"a{n}", NOW, brand="Mercedes", model="Classe A",
            version="Classe A 200 CDI Fascination")
    session.commit()
    result = version_names_another_model(session, min_listings=5)
    assert result["count"] == 0


# Fait rougir l'assemblage de `compute` : chaque section vient bien de la
# fonction qui la calcule, sur la même session et la même fenêtre.
def test_compute_wires_every_section(session):
    add(session, "lbc", "1", NOW, brand="Zorglub", model="X")
    session.commit()
    report = compute(session, now=NOW, window=WEEK)
    assert report.total_listings == 1
    assert report.last_seen == NOW
    assert report.unknown_brands == [{"brand": "Zorglub", "count": 1}]


# Fait rougir `field_fill_rate=field_fill_rate(session, since, now)` dans
# `compute` : la section est bien câblée, pas seulement calculable seule.
def test_compute_wires_the_field_fill_rate(session):
    add(session, "lbc", "1", NOW, fuel="diesel")
    session.commit()
    report = compute(session, now=NOW, window=WEEK)
    assert report.field_fill_rate["overall"]["fuel_rate"] == 1.0


# Fait rougir `model_named_by_version=version_names_another_model(session)`
# dans `compute`.
def test_compute_wires_the_model_named_by_version(session):
    for n in range(5):
        add(session, "lbc", f"scenic{n}", NOW, brand="Renault", model="Scénic")
    add(session, "lbc", "megane", NOW, brand="Renault", model="Mégane", version="Scénic 1.5")
    session.commit()
    report = compute(session, now=NOW, window=WEEK)
    assert report.model_named_by_version["count"] == 1


# Fait rougir `Listing.department.in_(("2A", "2B"))` dans `_rule` (via
# `unverified_rules`) : sans annonce corse en base, rien ne permet encore de
# vérifier la règle.
def test_unverified_corsica_rule_is_empty_without_corsican_listings(session):
    add(session, "lbc", "1", NOW, department="75")
    session.commit()
    assert unverified_rules(session)["corsica"] == {"count": 0, "examples": []}


# Même règle, dans le sens positif : une annonce 2A et une 2B comptent, une
# annonce 75 non — et les deux figurent en exemple.
def test_unverified_corsica_rule_counts_corsican_listings_with_examples(session):
    add(session, "lbc", "1", NOW, department="2A")
    add(session, "lbc", "2", NOW, department="2B")
    add(session, "lbc", "3", NOW, department="75")
    session.commit()
    rules = unverified_rules(session)
    assert rules["corsica"]["count"] == 2
    assert {e["site_id"] for e in rules["corsica"]["examples"]} == {"1", "2"}


# Fait rougir `Listing.site == "lc"` dans la règle du carburant La Centrale :
# un carburant tiers sur leboncoin ne la vérifie pas, elle porte sur l'autre
# site.
def test_unverified_lacentrale_fuel_rule_ignores_other_sites(session):
    add(session, "lbc", "1", NOW, fuel="hybride")
    session.commit()
    assert unverified_rules(session)["lacentrale_fuel"] == {"count": 0, "examples": []}


# Même règle : essence et diesel sur La Centrale ne comptent pas
# (`Listing.fuel.notin_(("essence", "diesel"))`), un carburant tiers oui.
def test_unverified_lacentrale_fuel_rule_counts_only_other_fuels(session):
    add(session, "lc", "1", NOW, fuel="essence")
    add(session, "lc", "2", NOW, fuel="diesel")
    add(session, "lc", "3", NOW, fuel="hybride")
    session.commit()
    rules = unverified_rules(session)
    assert rules["lacentrale_fuel"]["count"] == 1
    assert rules["lacentrale_fuel"]["examples"] == [{"site": "lc", "site_id": "3"}]


# Fait rougir `Listing.gearbox.isnot(None)` : une boîte non renseignée sur La
# Centrale ne permet toujours pas de vérifier la règle.
def test_unverified_lacentrale_gearbox_rule_is_empty_without_data(session):
    add(session, "lc", "1", NOW)
    session.commit()
    assert unverified_rules(session)["lacentrale_gearbox"] == {"count": 0, "examples": []}


# Même règle, dans le sens positif — et `Listing.site == "lc"` : une boîte
# renseignée sur leboncoin ne compte pas, seule La Centrale est en cause.
def test_unverified_lacentrale_gearbox_rule_counts_only_lacentrale(session):
    add(session, "lc", "1", NOW, gearbox="manuelle")
    add(session, "lbc", "2", NOW, gearbox="manuelle")
    session.commit()
    rules = unverified_rules(session)
    assert rules["lacentrale_gearbox"]["count"] == 1
    assert rules["lacentrale_gearbox"]["examples"] == [{"site": "lc", "site_id": "1"}]


# Fait rougir `func.count(Listing.id).filter(Listing.fuel == OTHER)` dans
# `fuel_other_share_by_site` : la part de « autre » ne compte que ce qui y
# est réellement rangé.
def test_fuel_other_share_counts_only_the_autre_bucket(session):
    add(session, "lbc", "1", NOW, fuel="diesel")
    add(session, "lbc", "2", NOW, fuel="autre")
    session.commit()
    assert fuel_other_share_by_site(session) == [
        {"site": "lbc", "total": 2, "other": 1, "rate": 0.5},
    ]


# Fait rougir `.where(Listing.fuel.isnot(None))` : une annonce sans carburant
# ne pèse ni pour le total ni pour la part.
def test_fuel_other_share_ignores_listings_without_fuel(session):
    add(session, "lbc", "1", NOW, fuel="diesel")
    add(session, "lbc", "2", NOW)
    session.commit()
    assert fuel_other_share_by_site(session) == [
        {"site": "lbc", "total": 1, "other": 0, "rate": 0.0},
    ]


# Fait rougir `group_by(Listing.site)` : un pic chez un site ne se confond
# jamais avec un autre.
def test_fuel_other_share_is_reported_separately_per_site(session):
    add(session, "lbc", "1", NOW, fuel="diesel")
    add(session, "lc", "2", NOW, fuel="autre")
    session.commit()
    assert fuel_other_share_by_site(session) == [
        {"site": "lbc", "total": 1, "other": 0, "rate": 0.0},
        {"site": "lc", "total": 1, "other": 1, "rate": 1.0},
    ]


# Fait rougir `unverified_rules=unverified_rules(session)` dans `compute`.
def test_compute_wires_unverified_rules(session):
    add(session, "lbc", "1", NOW, department="2A")
    session.commit()
    report = compute(session, now=NOW, window=WEEK)
    assert report.unverified_rules["corsica"]["count"] == 1


# Fait rougir `fuel_other_share=fuel_other_share_by_site(session)` dans
# `compute`.
def test_compute_wires_fuel_other_share(session):
    add(session, "lbc", "1", NOW, fuel="autre")
    session.commit()
    report = compute(session, now=NOW, window=WEEK)
    assert report.fuel_other_share == [{"site": "lbc", "total": 1, "other": 1, "rate": 1.0}]
