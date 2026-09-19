"""Le rapport de santé des données : chaque section sur des données construites.

Pas d'horloge réelle : `NOW` est injecté partout, comme `data_health` l'exige
de son appelant.
"""

from datetime import datetime, timedelta, timezone

from adscope_api.data_health import Report, compute, head_line
from adscope_api.data_health_queries import (
    MIN_WINDOW_LISTINGS, emerging_models, publication_freshness, unknown_brands,
    unknown_share,
)
from adscope_api.models import Listing
from adscope_api.taxonomy import derive

NOW = datetime(2026, 9, 19, 8, 0, tzinfo=timezone.utc)
WEEK = timedelta(days=7)


def add(session, site, site_id, first_seen, *, brand="Renault", model="Clio",
        published_at=None):
    row = Listing(site=site, site_id=site_id, first_seen=first_seen,
                  last_seen=first_seen, observations=1, brand=brand, model=model,
                  published_at=published_at)
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


# Fait rougir l'assemblage de `compute` : chaque section vient bien de la
# fonction qui la calcule, sur la même session et la même fenêtre.
def test_compute_wires_every_section(session):
    add(session, "lbc", "1", NOW, brand="Zorglub", model="X")
    session.commit()
    report = compute(session, now=NOW, window=WEEK)
    assert report.total_listings == 1
    assert report.last_seen == NOW
    assert report.unknown_brands == [{"brand": "Zorglub", "count": 1}]
