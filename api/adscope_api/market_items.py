"""Le contrat d'un item d'annonce, partagé par `/v1/market` et
`/v1/follows/feed`.

Il vivait dans `market_query.py`, que `label` et la recherche `q` ont fait
passer les 150 lignes. Il est de toute façon lu des deux côtés : `feed_query`
étend `ItemOut` et compose le même dictionnaire à partir d'objets ORM là où
`item_of` part d'une ligne agrégée en SQL.

`label` est le nom propre du véhicule — composé ici, à partir des formes
observées, par `taxonomy.label` ; aucun client ne recompose « marque modèle
version » de son côté.
"""

from datetime import datetime

from pydantic import BaseModel

from .schemas import SellerType
from .taxonomy import label
from .urls import build as build_url


# `seller_name` est nul pour un particulier — déjà en base ainsi.
class ItemOut(BaseModel):
    site: str
    site_id: str
    url: str | None
    brand: str | None
    model: str | None
    version: str | None
    label: str
    year: int | None
    mileage: int | None
    price: int | None
    seller_type: SellerType | None
    seller_name: str | None
    published_at: datetime | None
    age_days: int | None
    price_delta_since_first: int | None
    last_change_at: datetime | None
    followed: bool
    disappeared_at: datetime | None


class MarketOut(BaseModel):
    total: int
    items: list[ItemOut]


def item_of(row) -> dict:
    return {
        "site": row.site, "site_id": row.site_id, "url": build_url(row.site, row.site_id),
        "brand": row.brand, "model": row.model, "version": row.version,
        "label": label(row.brand, row.model, row.version), "year": row.year,
        "mileage": row.mileage, "price": row.price, "seller_type": row.seller_type,
        "seller_name": row.seller_name, "published_at": row.published_at,
        "age_days": row.age_days, "price_delta_since_first": row.price_delta_since_first,
        "last_change_at": row.last_change_at, "followed": row.followed,
        "disappeared_at": row.disappeared_at,
    }
