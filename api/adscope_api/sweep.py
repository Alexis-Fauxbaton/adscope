"""`GET /v1/sweep` : la file des recherches à balayer, commune à tous les
comptes et servie derrière une clé de licence ou le cookie du compte
opérateur (`require_operator`, jamais `require_account`) — comme
`revisit.due`, la file ne connaît pas l'appelant, mais un cookie qui
l'appelle doit être celui d'Alexis : le périmètre de tous les marchands
(marque, modèle, prix, département) sort de chaque entrée.

`GET`, pas `POST`, et rien n'est consommé : deux appels de suite rendent la
même file tant que rien n'a été ouvert. La couverture se mesure sur les
données elles-mêmes (`last_seen`), jamais sur un bail posé ici — c'est la
différence de fond avec `/v1/revisits`.

Dédoublonnée par la chaîne `query` canonique (`SavedSearch.query`, déjà
normalisée par `saved_searches._normalized_query`) : deux comptes, même
recherche, une seule entrée. Aucune information de compte n'en sort.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from .alert_models import SavedSearch
from .coverage import coverage_of
from .db import get_session
from .market_params import MarketParams
from .operator import require_operator
from .sessions import now_utc
from .sweep_split import cut
from .sweep_url import translate

router = APIRouter()

DEFAULT_PAGES = 120


def _stripped(params, unmapped):
    """Les filtres réellement émis dans l'URL : `min_age_days`/`dropped`
    n'ont pas d'équivalent leboncoin, et un `fuel`/`gearbox` non traduisible
    sort aussi du compte attendu — sinon une traduction juste consignerait un
    écart permanent au log du runbook."""
    return params.model_copy(update={
        "min_age_days": None, "dropped": None,
        "fuel": [] if "fuel" in unmapped else params.fuel,
        "gearbox": [] if "gearbox" in unmapped else params.gearbox,
    })


def _queries(session):
    return session.scalars(
        select(SavedSearch.query).where(SavedSearch.paused.is_(False)).distinct()
    ).all()


def _entries(session, license_, now):
    items, skipped = [], []
    for raw in _queries(session):
        params = MarketParams.from_query(raw)
        url, unmapped, skip_reason, missing = translate(session, params)
        if skip_reason:
            entry = {"reason": skip_reason}
            if missing:
                entry["missing"] = missing
            skipped.append(entry)
            continue

        _, coverage_24h = coverage_of(session, license_, now, params)
        cuts = cut(session, license_, now, _stripped(params, unmapped))
        if cuts is None:
            skipped.append({"reason": "trop_large"})
            continue

        for cut_params, expected_total, pages in cuts:
            cut_url, _cut_unmapped, _skip, _missing = translate(session, cut_params)
            items.append({
                "url": cut_url, "pages": pages, "expected_total": expected_total,
                "coverage_24h": coverage_24h, "unmapped": unmapped,
            })
    items.sort(key=lambda item: (item["coverage_24h"] is not None, item["coverage_24h"] or 0, item["url"]))
    return items, skipped


def _budget(items, pages):
    kept, used = [], 0
    for item in items:
        if used + item["pages"] > pages:
            break
        kept.append(item)
        used += item["pages"]
    return kept, used


@router.get("/v1/sweep")
def get_sweep(pages: int = Query(default=DEFAULT_PAGES, ge=1, le=400),
             session=Depends(get_session), license_=Depends(require_operator),
             now=Depends(now_utc)):
    items, skipped = _entries(session, license_, now)
    kept, used = _budget(items, pages)
    return {"pages": used, "items": kept, "skipped": skipped}
