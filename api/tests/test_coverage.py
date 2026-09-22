from datetime import datetime, timedelta, timezone

from adscope_api.auth import resolve
from adscope_api.coverage import coverage_of
from adscope_api.market_params import MarketParams
from adscope_api.models import Listing
from adscope_api.taxonomy import derive

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)


def car(session, site_id, *, brand="Renault", model="Clio", last_seen=NOW):
    row = Listing(site="lbc", site_id=site_id, first_seen=last_seen, last_seen=last_seen,
                  observations=1, brand=brand, model=model)
    derive(row)
    session.add(row)
    session.commit()
    return row


def clio(session, key):
    return coverage_of(session, resolve(session, key), NOW, MarketParams(brand="Renault", model="Clio"))


# Fait rougir `FRESH = timedelta(hours=24)` : trois annonces sur quatre vues il
# y a douze heures tombent dans la fenêtre, la quatrième (jamais vue depuis)
# non — sans la bonne constante, `12h < FRESH` basculerait.
def test_three_of_four_seen_twelve_hours_ago(session, key):
    for i in range(3):
        car(session, str(i), last_seen=NOW - timedelta(hours=12))
    car(session, "3", last_seen=NOW - timedelta(days=10))
    seen_total, coverage_24h = clio(session, key)
    assert (seen_total, coverage_24h) == (4, 0.75)


# Fait rougir la comparaison `last_seen >= now - FRESH` : deux annonces vues
# il y a vingt-cinq heures restent hors couverture, une vue il y a vingt-trois
# y entre — l'asymétrie (2 contre 1) évite qu'un sens inversé de la
# comparaison passe par coïncidence.
def test_seen_twenty_five_hours_ago_is_outside_coverage(session, key):
    car(session, "1", last_seen=NOW - timedelta(hours=25))
    car(session, "2", last_seen=NOW - timedelta(hours=25))
    car(session, "3", last_seen=NOW - timedelta(hours=23))
    seen_total, coverage_24h = clio(session, key)
    assert (seen_total, coverage_24h) == (3, 0.33)


# Fait rougir le passage de `params.core_kwargs()` à `market_query.core` : une
# Clio hors périmètre (ici une autre marque) ne doit compter ni au numérateur
# ni au dénominateur.
def test_a_listing_outside_the_perimeter_counts_in_neither_number(session, key):
    car(session, "1", brand="Renault", model="Clio", last_seen=NOW - timedelta(hours=1))
    car(session, "2", brand="Peugeot", model="208", last_seen=NOW - timedelta(hours=1))
    seen_total, coverage_24h = clio(session, key)
    assert (seen_total, coverage_24h) == (1, 1.0)


# Fait rougir `if total == 0: return 0, None` : un périmètre vide ne rend
# jamais `0.0` — « rien à voir » et « rien vu » ne se disent pas pareil.
def test_an_empty_perimeter_is_none_not_zero(session, key):
    seen_total, coverage_24h = clio(session, key)
    assert (seen_total, coverage_24h) == (0, None)
