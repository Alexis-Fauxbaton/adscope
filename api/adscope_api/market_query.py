"""Les annonces du marché, agrégées en SQL pour `/v1/market` : le dernier prix,
et le premier et le dernier prix *changé* (`price_points.confirmation = false`
— une confirmation dit que le prix n'a pas bougé, voir `observations.record`),
un par annonce dans Postgres — la base en porte 47 000, jamais chargées en
Python. `price_delta_since_first` exige deux prix changés : un seul ne dit
rien contre quoi le comparer. `feed_query.py` recalcule l'ancienneté en Python
(`sellers.age_days`, `age_expr` en SQL ici) et rend le même item.
Les filtres de famille et la recherche `q` sont dans `search.py`, sur la couche
canonique ; le contrat d'un item et son `label` sont dans `market_items.py`."""

from sqlalchemy import Date, DateTime, Integer, case, cast, extract, func, literal, select

from . import search
from .follow_models import Follow
from .models import Listing, PricePoint


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


def _core(license_, now, *, brand, model, q, seller_type, min_age_days, dropped,
         fuel=None, gearbox=None, department=None):
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
            Listing.year, Listing.mileage, last_price.c.price,
            Listing.fuel, Listing.gearbox, Listing.department, Listing.seller_type,
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
    query = search.family(query, Listing.canon_brand, Listing.canon_model, brand, model)
    query = search.text(query, Listing.search_text, q)
    if seller_type:
        query = query.where(Listing.seller_type == seller_type)
    if fuel:
        query = query.where(Listing.fuel.in_(fuel))
    if gearbox:
        query = query.where(Listing.gearbox.in_(gearbox))
    if department is not None:
        # Jamais `if department:` : une intersection région/département vide
        # (`market._combined_departments`) doit rendre zéro ligne, pas
        # retomber sur « aucun filtre » parce que la liste est vide.
        query = query.where(Listing.department.in_(department))
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


def market_page(session, license_, now, *, brand=None, model=None, q=None,
                seller_type=None, min_age_days=None, dropped=None,
                fuel=None, gearbox=None, department=None,
                sort="age_desc", limit=50, offset=0):
    """`(total, lignes)` : le total porte sur le filtre, jamais sur la page."""
    query, age, delta = _core(
        license_, now, brand=brand, model=model, q=q, seller_type=seller_type,
        min_age_days=min_age_days, dropped=dropped,
        fuel=fuel, gearbox=gearbox, department=department,
    )
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    query = query.order_by(*_order(sort, age, delta)).limit(limit).offset(offset)
    return total, session.execute(query).all()
