"""Les candidats d'alerte venus des suivis : `feed_query.feed_for` réutilisée
telle quelle, jamais réécrite — sorti de `alert_rules.py`, à sa limite de
longueur. Le pont compte → licence est `auth.of_account`.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .alert_journal import ref_at
from .alert_models import AccountSettings
from .auth import of_account
from .feed_query import feed_for
from .models import PricePoint

# Un matin manqué se rattrape de lui-même : le journal d'unicité interdit
# déjà de redire une alerte, sept jours de fenêtre n'en répètent aucune.
FOLLOWS_WINDOW_DAYS = 7


def _window_from(session, listing_id, before_at):
    """Le relevé qui précède `before_at`, pour la fenêtre honnête d'une
    baisse venue des suivis — `feed_query.feed_for` ne rend que `at`."""
    return session.scalar(
        select(PricePoint.observed_at)
        .where(PricePoint.listing_id == listing_id, PricePoint.confirmation.is_(False),
              PricePoint.observed_at < before_at)
        .order_by(PricePoint.observed_at.desc()).limit(1)
    )


def _candidate(item, kind, ref, **extra):
    return {
        "kind": kind, "ref": ref, "listing_id": item["listing_id"],
        "site": item["site"], "site_id": item["site_id"], "url": item["url"],
        "label": item["label"], "department": item["department"],
        "age_days": item["age_days"], "price": item["price"],
        "price_delta_since_first": item["price_delta_since_first"],
        "price_before": None, "price_after": None, "window_from": None, "window_to": None,
        "search_query": None,
        **extra,
    }


def follows_for(session, account_id, now) -> list[dict]:
    """Au plus trois candidats par item suivi : baisse (un par changement),
    seuil franchi, disparition. Plancher `max(followed_at, settings.created_at)`
    : rien d'antérieur à l'un ou l'autre n'est jamais dit. Un compte sans
    licence valable n'a ni suivi ni marché — son courrier est vide, sans
    lever."""
    license_ = of_account(session, account_id, now)
    if license_ is None:
        return []
    # Sans ligne de réglage, aucune alerte de suivi n'a jamais été prise en
    # compte : rien à plancher au-delà de `followed_at` (`digest_send.py`
    # crée toujours la ligne avant d'appeler ceci, en pratique).
    settings = session.get(AccountSettings, account_id)
    settings_floor = settings.created_at if settings is not None else datetime.min.replace(
        tzinfo=timezone.utc
    )
    items = feed_for(session, license_, FOLLOWS_WINDOW_DAYS, now)
    candidates = []
    for item in items:
        floor = max(item["followed_at"], settings_floor)
        for change in item["changes"]:
            if change["at"] > floor and change["to"] < change["from"]:
                window_from = _window_from(session, item["listing_id"], change["at"])
                candidates.append(_candidate(
                    item, "drop", ref_at(change["at"]),
                    price_before=change["from"], price_after=change["to"],
                    window_from=window_from, window_to=change["at"],
                ))
        crossed = item["flags"]["crossed"]
        if crossed is not None and item["age_days"] is not None:
            crossed_at = now - timedelta(days=item["age_days"] - crossed)
            if crossed_at > floor:
                candidates.append(_candidate(item, "crossed", str(crossed), crossed=crossed))
        if item["flags"]["disappeared"] and item["disappeared_at"] is not None \
                and item["disappeared_at"] > floor:
            candidates.append(_candidate(item, "gone", "gone"))
    return candidates
