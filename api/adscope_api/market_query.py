"""Les annonces du marché, agrégées en SQL pour `/v1/market` : le dernier prix,
et le premier et le dernier prix *changé* (`price_points.confirmation = false`
— une confirmation dit que le prix n'a pas bougé, voir `observations.record`),
un par annonce dans Postgres — la base en porte 56 000, jamais chargées en
Python. `price_delta_since_first` exige deux prix changés : un seul ne dit
rien contre quoi le comparer. `feed_query.py` recalcule l'ancienneté en Python
(`sellers.age_days`, `age_expr` en SQL ici) et rend le même item.

`core` bâtit la requête filtrée, réutilisée telle quelle par `facet_query.py`
: chaque facette y ajoute son propre `GROUP BY` sur la colonne qui l'intéresse
et exclut son propre filtre (`exclude`) — Postgres élague de lui-même les
jointures dont aucune colonne ne ressort (vérifié par `EXPLAIN ANALYZE` sur la
base réelle, voir `.superpowers/recherche-lot4-api.md`), donc `core` reste
unique et complet plutôt que décliné en variantes allégées. `coverage.py`
(lot F2) s'en sert à son tour, d'où `Listing.last_seen` dans le `select` :
`market_items.item_of` lit ses colonnes par nom et ignore le reste, aucun
item de `/v1/market` n'en gagne une.
Le contrat d'un item et son `label` sont dans `market_items.py`."""

from sqlalchemy import Date, DateTime, Integer, case, cast, extract, func, literal, select

from . import absence_scope, search
from .follow_models import Follow
from .market_ranges import clauses as range_clauses, parse as parse_ranges
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


def core(license_, now, *, brand=None, model=None, q=None, seller_type=None,
        min_age_days=None, dropped=None, fuel=None, gearbox=None, department=None,
        bounds=None, exclude=frozenset()):
    """La requête filtrée, avec l'âge et la baisse de prix qu'elle expose —
    `market_page` la pagine, `facet_query.py` la groupe. `exclude` saute
    l'application d'un filtre nommé sans changer ce que la requête sait
    calculer, pour qu'une facette puisse se compter sans son propre filtre."""
    bounds = bounds if bounds is not None else parse_ranges()
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
            Listing.id.label("id"),
            Listing.site, Listing.site_id, Listing.brand, Listing.model, Listing.version,
            Listing.canon_brand, Listing.canon_model, Listing.canon_model_source,
            Listing.year, Listing.mileage, last_price.c.price,
            Listing.fuel, Listing.gearbox, Listing.department, Listing.seller_type,
            Listing.seller_name, Listing.published_at, age.label("age_days"),
            delta.label("price_delta_since_first"), last_change.c.at.label("last_change_at"),
            followed.label("followed"), Listing.disappeared_at, Listing.probably_gone_at,
            Listing.last_seen,
        )
        .select_from(Listing)
        .outerjoin(last_price, last_price.c.listing_id == Listing.id)
        .outerjoin(first_change, first_change.c.listing_id == Listing.id)
        .outerjoin(last_change, last_change.c.listing_id == Listing.id)
        .outerjoin(change_count, change_count.c.listing_id == Listing.id)
        .where(*absence_scope.visible(license_))
    )
    query = search.family(query, Listing.canon_brand, Listing.canon_model, brand, model, exclude)
    query = search.text(query, Listing.search_text, q)
    if seller_type and "seller_type" not in exclude:
        query = query.where(Listing.seller_type == seller_type)
    if fuel and "fuel" not in exclude:
        query = query.where(Listing.fuel.in_(fuel))
    if gearbox and "gearbox" not in exclude:
        query = query.where(Listing.gearbox.in_(gearbox))
    if department is not None and "location" not in exclude:
        # Jamais `if department:` : une intersection région/département vide
        # (`market_filters.combined`) doit rendre zéro ligne, pas retomber sur
        # « aucun filtre » parce que la liste est vide.
        query = query.where(Listing.department.in_(department))
    if min_age_days is not None:
        query = query.where(age >= min_age_days)
    if dropped is not None:
        query = query.where(delta < 0 if dropped else (delta.is_(None)) | (delta >= 0))
    range_columns = {"price": last_price.c.price, "year": Listing.year, "mileage": Listing.mileage}
    for condition in range_clauses(bounds, range_columns, exclude):
        query = query.where(condition)
    return query, age, delta


def total(session, query):
    """Le compte du filtre, jamais de la page — partagé par `market_page` et
    `facet_query.total`, qui en ont chacun besoin sur une requête `core`."""
    return session.scalar(select(func.count()).select_from(query.subquery()))


def _order(sort, age, delta):
    primary = {
        "drop_desc": delta.asc().nulls_last(),
        "recent": age.asc().nulls_last(),
    }.get(sort, age.desc().nulls_last())
    return (primary, Listing.site, Listing.site_id)


def market_page(session, license_, now, *, brand=None, model=None, q=None,
                seller_type=None, min_age_days=None, dropped=None,
                fuel=None, gearbox=None, department=None, bounds=None,
                sort="age_desc", limit=50, offset=0):
    """`(total, lignes)` : le total porte sur le filtre, jamais sur la page."""
    query, age, delta = core(
        license_, now, brand=brand, model=model, q=q, seller_type=seller_type,
        min_age_days=min_age_days, dropped=dropped,
        fuel=fuel, gearbox=gearbox, department=department, bounds=bounds,
    )
    count = total(session, query)
    query = query.order_by(*_order(sort, age, delta)).limit(limit).offset(offset)
    return count, session.execute(query).all()
