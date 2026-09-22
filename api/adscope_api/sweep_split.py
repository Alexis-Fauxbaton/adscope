"""Le découpage d'une recherche trop large en bornes balayables : `pages`
d'abord, puis, au-delà du plafond, l'ordre de `crawler/RUNBOOK.md` —
`owner_type` en premier axe, la tranche de prix ensuite.

Rend une liste de `MarketParams` (les coupes), jamais des URL : c'est
`sweep_url.translate` qui les traduit, une par une, dans `sweep.py`.
"""

import math

from .market_query import core as market_core, total as market_total
from .models import Listing

ADS_PER_PAGE = 35
# ≈ 700 annonces. Au-delà, une page de résultats ne suffit plus à couvrir la
# recherche dans le budget d'un run de balayage.
PAGE_CAP = 20
# owner_type (2) × deux coupes de prix (2×2) = 8 : la profondeur au-delà de
# laquelle une recherche marque+modèle n'existe pas sur ce marché (la plus
# grosse famille de la base, Renault Clio, en porte 4 723).
MAX_ENTRIES = 8


def _pages(total):
    # Le `max(1, …)` fait ouvrir sa page 1 à une recherche neuve dont le
    # périmètre est vide en base — sans lui, elle ne se remplirait jamais.
    return max(1, math.ceil(total / ADS_PER_PAGE))


def _count(session, license_, now, params):
    # `site == "lbc"` : l'URL traduite ne montre que leboncoin
    # (`sweep_url.translate`), le compte attendu doit porter sur le même
    # périmètre, sous peine d'un écart permanent au log du runbook.
    query, _age, _delta = market_core(license_, now, **params.core_kwargs())
    query = query.where(Listing.site == "lbc")
    return market_total(session, query)


def _price_bounds(params):
    low = params.price_min or 0
    high = params.price_max
    if high is None:
        high = low * 2 if low else 5000
    mid = round((low + high) / 2, -2)
    return max(mid, low + 1)


def cut(session, license_, now, params, *, owner_done=False, price_rounds=0):
    """`[(MarketParams, expected_total, pages)]`, ou `None` si la recherche
    dépasse `MAX_ENTRIES` même découpée."""
    total = _count(session, license_, now, params)
    pages = _pages(total)
    if pages <= PAGE_CAP:
        return [(params, total, pages)]

    if not owner_done and params.seller_type is None:
        branches = [
            params.model_copy(update={"seller_type": "private"}),
            params.model_copy(update={"seller_type": "pro"}),
        ]
        owner_done = True
    elif price_rounds < 2:
        mid = _price_bounds(params)
        branches = [
            params.model_copy(update={"price_max": mid}),
            params.model_copy(update={"price_min": mid + 1}),
        ]
        price_rounds += 1
    else:
        return None

    out = []
    for branch in branches:
        sub = cut(session, license_, now, branch, owner_done=owner_done, price_rounds=price_rounds)
        if sub is None:
            return None
        out += sub
    return out if len(out) <= MAX_ENTRIES else None
