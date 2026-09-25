"""Les règles d'alerte sur une recherche enregistrée : baisse et nouvelle
annonce, évaluées pour un « maintenant » donné — aucune fonction ne lit
l'horloge, `now` est toujours un paramètre. Les candidats des suivis vivent
à part, dans `alert_follows.py` (limite de longueur).

Rejouent la recherche contre `market_query.core`, comme `/v1/market` : la
traduction filtres → `core` (`market_params.MarketParams`) n'existe qu'à un
seul endroit, les deux chemins ne peuvent plus diverger.
"""

from datetime import timedelta

from sqlalchemy import func, or_, select

from .alert_journal import ref_at
from .config import alerts_confirmed_only
from .market_params import MarketParams
from .market_query import core as market_core
from .models import License, Listing, PricePoint
from .naming import label as naming_label
from .taxonomy import inferred_model
from .urls import build as build_url

# « Vue il y a moins de 48 h » : sur `last_seen`, jamais `last_revisit_at` —
# le second dit seulement que la file a servi la fiche, pas qu'on l'a vue
# vivante (voir `models.Listing`).
SEEN_WINDOW = timedelta(hours=48)


def _item(row) -> dict:
    return {
        "listing_id": row.id, "site": row.site, "site_id": row.site_id,
        "url": build_url(row.site, row.site_id),
        "label": naming_label(row.brand, row.model, row.version,
                              inferred_model(row.canon_model, row.canon_model_source), row.year),
        "department": row.department, "age_days": row.age_days, "price": row.price,
        "price_delta_since_first": row.price_delta_since_first,
    }


def _alert_query(search, license_, now):
    """La requête filtrée d'une recherche enregistrée, rejouée contre
    `market_query.core`, restreinte aux deux conditions propres à l'alerte."""
    params = MarketParams.from_query(search.query)
    kwargs = params.core_kwargs()
    # `min_age_days` désigne deux choses — le filtre du marché, le seuil de
    # la règle — les deux s'appliquent. `None` si les deux valent zéro : forcer
    # un entier ferait exclure les annonces d'âge inconnu (`age` NULL) même
    # sans seuil demandé (`market_query.core:110`).
    threshold = max(kwargs.get("min_age_days") or 0, search.min_age_days)
    kwargs["min_age_days"] = threshold or None
    query, _age, _delta = market_core(license_, now, **kwargs)
    return query.where(
        Listing.last_seen >= now - SEEN_WINDOW,
        Listing.absent_since.is_(None),
    )


def drops_for(session, search, license_, now) -> list[dict]:
    """Les baisses d'une recherche enregistrée — une ligne par annonce, la
    plus récente postérieure à `created_at`. La fenêtre (`lag`) porte sur
    toute la série ; le filtre `created_at` s'applique après, sur le relevé
    qui constate la baisse — sinon le premier relevé postérieur à
    l'enregistrement n'aurait pas de prédécesseur. Le cumul est daté à ce
    relevé (`first_price`, le tout premier prix confirmé de la série) : celui
    de `market_query.core` porte la valeur du jour, fausse sur toute ligne qui
    n'est pas la dernière baisse connue."""
    rows = session.execute(_alert_query(search, license_, now)).all()
    items = {row.id: _item(row) for row in rows}
    if not items:
        return []
    order = (PricePoint.observed_at, PricePoint.id)
    lag_price = func.lag(PricePoint.price).over(partition_by=PricePoint.listing_id, order_by=order)
    lag_at = func.lag(PricePoint.observed_at).over(partition_by=PricePoint.listing_id, order_by=order)
    first_price = func.first_value(PricePoint.price).over(
        partition_by=PricePoint.listing_id, order_by=order
    )
    windowed = (
        select(PricePoint.listing_id, PricePoint.id, PricePoint.price, PricePoint.observed_at,
              lag_price.label("prev"), lag_at.label("prev_at"), first_price.label("first_price"))
        .where(PricePoint.confirmation.is_(False), PricePoint.listing_id.in_(items.keys()))
    ).subquery()
    clauses = [
        windowed.c.prev.is_not(None),
        windowed.c.price < windowed.c.prev,
        windowed.c.observed_at > search.created_at,
        (windowed.c.prev - windowed.c.price) * 100 >= search.min_drop_pct * windowed.c.prev,
    ]
    if alerts_confirmed_only():
        # Un relevé du robot postérieur à la baisse — ou la baisse elle-même
        # vue par le robot (`observed_at >= …`, pas `>` : elle est alors déjà
        # confirmée par elle-même). `license_key_hash` nul = le crawler
        # d'avant la colonne, qui fait foi aussi.
        clauses.append(
            select(1).select_from(PricePoint)
            .outerjoin(License, License.key_hash == PricePoint.license_key_hash)
            .where(PricePoint.listing_id == windowed.c.listing_id,
                  PricePoint.observed_at >= windowed.c.observed_at,
                  or_(PricePoint.license_key_hash.is_(None), License.automated.is_(True)))
            .exists()
        )
    drop_rows = session.execute(
        select(windowed).where(*clauses)
        .distinct(windowed.c.listing_id)
        .order_by(windowed.c.listing_id, windowed.c.observed_at.desc(), windowed.c.id.desc())
    ).all()
    return [
        {**items[row.listing_id], "kind": "drop", "ref": ref_at(row.observed_at),
         "price_before": row.prev, "price_after": row.price,
         "window_from": row.prev_at, "window_to": row.observed_at,
         "price_delta_since_first": row.price - row.first_price,
         "search_query": search.query}
        for row in drop_rows
    ]


def new_for(session, search, license_, now) -> list[dict]:
    """Les annonces neuves depuis l'enregistrement — seulement si
    `search.notify_new` : les sites sources alertent déjà dessus, en temps
    réel."""
    if not search.notify_new:
        return []
    query = (
        _alert_query(search, license_, now)
        .add_columns(Listing.first_seen)
        .where(Listing.first_seen > search.created_at)
    )
    rows = session.execute(query).all()
    return [
        {**_item(row), "kind": "new", "ref": ref_at(row.first_seen),
         "price_before": None, "price_after": row.price,
         "window_from": None, "window_to": row.first_seen, "search_query": search.query}
        for row in rows
    ]
