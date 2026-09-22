"""La couverture d'une recherche enregistrée : la part de son périmètre vue
depuis moins de 24 h — ce que le balayage (`sweep.py`) a réellement fait
récemment, mesuré sur les données elles-mêmes, jamais sur une file consommée.

Un seul chemin : `MarketParams.core_kwargs()` → `market_query.core`, le même
que `/v1/market` et `alert_rules._alert_query`. Aucune clause `where` n'est
réécrite ici — sans quoi une recherche pourrait compter différemment selon
qu'elle passe par `/v1/searches` ou par `/v1/sweep`.
"""

from datetime import timedelta

from sqlalchemy import func, select

from .market_query import core as market_core

# « Vue il y a moins de 24 h » — pas les 48 h d'`alert_rules.SEEN_WINDOW` :
# c'est la fenêtre du balayage quotidien (F2), pas celle d'une alerte.
FRESH = timedelta(hours=24)


def counts(session, license_, now, params) -> tuple[int, int]:
    """`(total, fraîches)` sur le périmètre complet de la recherche — filtres
    intacts, contrairement à `sweep_url`/`sweep_split`, qui retirent
    `min_age_days`/`dropped` et un `fuel` non traduisible avant de compter."""
    query, _age, _delta = market_core(license_, now, **params.core_kwargs())
    sub = query.subquery()
    total, fresh = session.execute(
        select(func.count(), func.count().filter(sub.c.last_seen >= now - FRESH))
        .select_from(sub)
    ).one()
    return total, fresh


def coverage_of(session, license_, now, params) -> tuple[int, float | None]:
    """`(seen_total, coverage_24h)`. `coverage_24h` est `None`, jamais `0.0`,
    quand le périmètre est vide : « rien à voir » et « rien vu » ne se disent
    pas pareil, et l'ordre de la file de balayage les traite différemment."""
    total, fresh = counts(session, license_, now, params)
    if total == 0:
        return 0, None
    return total, round(fresh / total, 2)
