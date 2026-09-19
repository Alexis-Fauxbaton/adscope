"""`/v1/follows/feed` : ce qu'une licence voit bouger sur ce qu'elle suit.

En Python, pas en SQL agrégé : le feed ne porte que les annonces suivies par
une licence — une poignée, déjà en mémoire une fois chargées avec leurs prix,
comme dans `signals.signals_for`. `age_days` reprend `sellers.age_days`, le
même calcul que `market_query.age_expr` fait en SQL sur les 47 000 annonces.
"""

from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .follow_models import Follow
from .market_items import ItemOut
from .models import Listing
from .naming import label
from .region import of_department as region_of_department
from .sellers import age_days
from .urls import build as build_url

# Les seuils d'ancienneté qui valent la peine d'être signalés. Le plus haut
# franchi *pendant* la fenêtre : une annonce à 95 jours qui en avait déjà 88 la
# semaine dernière n'a rien franchi de neuf.
THRESHOLDS = (90, 60, 30)


class ChangeOut(BaseModel):
    at: datetime
    from_: int = Field(alias="from", serialization_alias="from")
    to: int

    model_config = {"populate_by_name": True}


class FlagsOut(BaseModel):
    dropped: bool
    crossed: Literal[30, 60, 90] | None
    disappeared: bool


class FeedItemOut(ItemOut):
    followed_at: datetime
    changes: list[ChangeOut]
    flags: FlagsOut


class FeedOut(BaseModel):
    items: list[FeedItemOut]


def _crossed(age_now, since_days):
    """Le plus haut seuil franchi pendant la fenêtre. `since_days` est un
    nombre entier de jours, donc l'ancienneté au début de la fenêtre est
    exactement `age_now - since_days`, sans second calcul."""
    if age_now is None:
        return None
    before = age_now - since_days
    return next((t for t in THRESHOLDS if before < t <= age_now), None)


def _feed_item(listing, followed_at, since_days, since, now) -> dict:
    changes = [p for p in listing.prices if not p.confirmation]
    pairs = [
        {"at": cur.observed_at, "from": prev.price, "to": cur.price}
        for prev, cur in zip(changes, changes[1:]) if cur.observed_at >= since
    ]
    delta = changes[-1].price - changes[0].price if len(changes) >= 2 else None
    age = age_days(listing, now)
    return {
        "site": listing.site, "site_id": listing.site_id,
        "url": build_url(listing.site, listing.site_id),
        "brand": listing.brand, "model": listing.model, "version": listing.version,
        "label": label(listing.brand, listing.model, listing.version),
        "year": listing.year, "mileage": listing.mileage,
        "price": listing.prices[-1].price if listing.prices else None,
        "fuel": listing.fuel, "gearbox": listing.gearbox, "department": listing.department,
        "region": region_of_department(listing.department),
        "seller_type": listing.seller_type, "seller_name": listing.seller_name,
        "published_at": listing.published_at, "age_days": age,
        "price_delta_since_first": delta,
        "last_change_at": changes[-1].observed_at if changes else None,
        "followed": True, "disappeared_at": listing.disappeared_at,
        "followed_at": followed_at, "changes": pairs,
        "flags": {
            "dropped": delta is not None and delta < 0,
            "crossed": _crossed(age, since_days),
            "disappeared": (
                listing.disappeared_at is not None and listing.disappeared_at >= since
            ),
        },
    }


def feed_for(session, license_, since_days, now) -> list[dict]:
    since = now - timedelta(days=since_days)
    rows = session.execute(
        select(Listing, Follow.followed_at)
        .join(Follow, Follow.listing_id == Listing.id)
        .where(Follow.license_key_hash == license_.key_hash)
        .options(selectinload(Listing.prices))
    ).all()
    items = [_feed_item(listing, at, since_days, since, now) for listing, at in rows]
    # Ce qui a bougé d'abord : les annonces sans changement dans la fenêtre
    # passent en second, triées par site pour un ordre stable entre deux appels.
    items.sort(key=lambda it: (not it["changes"], it["site"], it["site_id"]))
    return items
