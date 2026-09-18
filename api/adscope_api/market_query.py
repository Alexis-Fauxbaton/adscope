"""Les annonces du marché, agrégées en SQL pour `/v1/market` : le dernier prix,
et le premier et le dernier prix *changé* (`price_points.confirmation = false`
— une confirmation dit que le prix n'a pas bougé, voir `observations.record`),
un par annonce dans Postgres — la base en porte 47 000, jamais chargées en
Python. `price_delta_since_first` exige deux prix changés : un seul ne dit
rien contre quoi le comparer. `ItemOut` est repris par `feed_query.py`, qui
recalcule l'ancienneté en Python (`sellers.age_days`, `age_expr` en SQL ici)."""

from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import Date, DateTime, Integer, case, cast, extract, func, literal, select

from .follow_models import Follow
from .models import Listing, PricePoint
from .schemas import SellerType
from .urls import build as build_url


# `seller_name` est nul pour un particulier — déjà en base ainsi.
class ItemOut(BaseModel):
    site: str
    site_id: str
    url: str | None
    brand: str | None
    model: str | None
    version: str | None
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


CHANGED = PricePoint.confirmation.is_(False)


def _distinct_price(*cols, where=None, desc=False):
    # Un prix par annonce, `comparables._last_prices` généralisé aux bornes.
    order = PricePoint.observed_at, PricePoint.id
    query = select(PricePoint.listing_id, *cols)
    if where is not None:
        query = query.where(where)
    if desc:
        order = (c.desc() for c in order)
    return query.distinct(PricePoint.listing_id).order_by(PricePoint.listing_id, *order).subquery()


def age_expr(now):
    """`sellers.age_days` en SQL : l'exact d'abord, l'inférée ensuite."""
    when = literal(now, type_=DateTime(timezone=True))
    exact = cast(func.floor(extract("epoch", when - Listing.published_at) / 86400), Integer)
    inferred = cast(cast(when, Date) - Listing.site_published_first, Integer)
    return case(
        (Listing.published_at.is_not(None), exact),
        (Listing.site_published_first.is_not(None), inferred),
        else_=None,
    )


def _core(license_, now, *, brand, model, seller_type, min_age_days, dropped):
    last_price = _distinct_price(PricePoint.price.label("price"), desc=True)
    first_change = _distinct_price(PricePoint.price.label("price"), where=CHANGED)
    last_change = _distinct_price(
        PricePoint.price.label("price"), PricePoint.observed_at.label("at"),
        where=CHANGED, desc=True,
    )
    change_count = (
        select(PricePoint.listing_id, func.count().label("n")).where(CHANGED)
        .group_by(PricePoint.listing_id).subquery()
    )
    age = age_expr(now)
    delta = case(
        (change_count.c.n >= 2, last_change.c.price - first_change.c.price), else_=None,
    )
    followed = (
        select(1)
        .where(Follow.license_key_hash == license_.key_hash, Follow.listing_id == Listing.id)
        .exists()
    )
    query = (
        select(
            Listing.site, Listing.site_id, Listing.brand, Listing.model, Listing.version,
            Listing.year, Listing.mileage, last_price.c.price, Listing.seller_type,
            Listing.seller_name, Listing.published_at, age.label("age_days"),
            delta.label("price_delta_since_first"), last_change.c.at.label("last_change_at"),
            followed.label("followed"), Listing.disappeared_at,
        )
        .select_from(Listing)
        .outerjoin(last_price, last_price.c.listing_id == Listing.id)
        .outerjoin(first_change, first_change.c.listing_id == Listing.id)
        .outerjoin(last_change, last_change.c.listing_id == Listing.id)
        .outerjoin(change_count, change_count.c.listing_id == Listing.id)
        .where(Listing.disappeared_at.is_(None))
    )
    if brand:
        query = query.where(Listing.brand == brand)
    if model:
        query = query.where(Listing.model == model)
    if seller_type:
        query = query.where(Listing.seller_type == seller_type)
    if min_age_days is not None:
        query = query.where(age >= min_age_days)
    if dropped is not None:
        query = query.where(delta < 0 if dropped else (delta.is_(None)) | (delta >= 0))
    return query, age, delta


def _order(sort, age, delta):
    primary = {
        "drop_desc": delta.asc().nulls_last(),
        "recent": age.asc().nulls_last(),
    }.get(sort, age.desc().nulls_last())
    return (primary, Listing.site, Listing.site_id)


def market_page(session, license_, now, *, brand=None, model=None, seller_type=None,
                min_age_days=None, dropped=None, sort="age_desc", limit=50, offset=0):
    """`(total, lignes)` : le total porte sur le filtre, jamais sur la page."""
    query, age, delta = _core(
        license_, now, brand=brand, model=model, seller_type=seller_type,
        min_age_days=min_age_days, dropped=dropped,
    )
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    query = query.order_by(*_order(sort, age, delta)).limit(limit).offset(offset)
    return total, session.execute(query).all()


def item_of(row) -> dict:
    return {
        "site": row.site, "site_id": row.site_id, "url": build_url(row.site, row.site_id),
        "brand": row.brand, "model": row.model, "version": row.version, "year": row.year,
        "mileage": row.mileage, "price": row.price, "seller_type": row.seller_type,
        "seller_name": row.seller_name, "published_at": row.published_at,
        "age_days": row.age_days, "price_delta_since_first": row.price_delta_since_first,
        "last_change_at": row.last_change_at, "followed": row.followed,
        "disappeared_at": row.disappeared_at,
    }
