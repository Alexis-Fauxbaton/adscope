"""Les six fourchettes du marché : `price_min`/`price_max` (dernier prix
relevé), `year_min`/`year_max`, `mileage_min`/`mileage_max`. Bornes entières,
optionnelles, chacune 422 si `min > max` — un filtre muet qui ne rend jamais
rien serait pire qu'une erreur, comme `department` (`market.py`).

Partagé par `market_query.core` (`/v1/market`) et `facet_query.py`
(`/v1/market/facets`, qui compte chaque fourchette sans elle-même — voir son
commentaire sur la règle « sans son propre filtre »).
"""

from fastapi import HTTPException

FIELDS = ("price", "year", "mileage")


def parse(price_min=None, price_max=None, year_min=None, year_max=None,
         mileage_min=None, mileage_max=None) -> dict:
    """`{champ: (min, max)}`, 422 dès qu'une borne dépasse l'autre."""
    bounds = {
        "price": (price_min, price_max),
        "year": (year_min, year_max),
        "mileage": (mileage_min, mileage_max),
    }
    for field, (low, high) in bounds.items():
        if low is not None and high is not None and low > high:
            raise HTTPException(status_code=422, detail=f"{field}_min > {field}_max")
    return bounds


def clauses(bounds, columns, exclude=frozenset()):
    """Les conditions SQL des bornes qui ne sont pas dans `exclude`.

    `columns` donne l'expression SQL de chaque champ : `price` est un prix
    dérivé (`market_query.core`, dernier prix relevé), pas une colonne brute
    comme `year`/`mileage`."""
    conditions = []
    for field in FIELDS:
        if field in exclude:
            continue
        low, high = bounds[field]
        column = columns[field]
        if low is not None:
            conditions.append(column >= low)
        if high is not None:
            conditions.append(column <= high)
    return conditions
