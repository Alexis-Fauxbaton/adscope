"""`/v1/market` et `/v1/follows/feed` : le marché et le suivi, tels qu'un
marchand les lit.

Le contrat et les calculs vivent dans `market_query.py` (agrégé en SQL, sur
les 47 000 annonces) et `feed_query.py` (en Python, sur ce qu'une licence
suit) ; ce module ne fait que les monter en routes, comme `main.py` le fait
pour le reste — `market.py` est le seul routeur à en porter deux, pour tenir
les deux sous les 150 lignes.
"""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import require_license
from .db import get_session
from .department import normalize as normalize_department
from .feed_query import FeedOut, feed_for
from .market_items import MarketOut, item_of
from .market_query import market_page
from .schemas import SellerType
from .vocab import Fuel, Gearbox

router = APIRouter()


# `department` n'est pas un vocabulaire fermé (une centaine de codes, plus les
# DOM et la Corse) : validé au format, comme à l'entrée (`intake._department_code`)
# — pas tronqué, jamais deviné. Une valeur qui n'y ressemble pas est un 422 :
# un filtre muet qui ne rend jamais rien serait pire qu'une erreur.
def _departments(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    normalized = [normalize_department(v) for v in values]
    if None in normalized:
        raise HTTPException(status_code=422, detail="department inconnu")
    return normalized


@router.get("/v1/market", response_model=MarketOut)
def get_market(
    brand: str | None = None, model: str | None = None,
    q: str | None = Query(default=None, max_length=120),
    seller_type: SellerType | None = None,
    fuel: list[Fuel] | None = Query(default=None),
    gearbox: list[Gearbox] | None = Query(default=None),
    department: list[str] | None = Query(default=None),
    min_age_days: int | None = Query(default=None, ge=0),
    dropped: bool | None = None,
    sort: Literal["age_desc", "drop_desc", "recent"] = "age_desc",
    limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
    session=Depends(get_session), license_=Depends(require_license),
):
    now = datetime.now(timezone.utc)
    total, rows = market_page(
        session, license_, now, brand=brand, model=model, q=q, seller_type=seller_type,
        fuel=fuel, gearbox=gearbox, department=_departments(department),
        min_age_days=min_age_days, dropped=dropped, sort=sort, limit=limit, offset=offset,
    )
    return {"total": total, "items": [item_of(row) for row in rows]}


@router.get("/v1/follows/feed", response_model=FeedOut)
def get_feed(since_days: int = Query(default=7), session=Depends(get_session),
            license_=Depends(require_license)):
    # `Literal[1, 7]` ne coercerait pas la chaîne de la query string vers
    # l'entier sous cette version de FastAPI (mesuré : un 422 même sur `?
    # since_days=7`) — d'où la vérification à la main.
    if since_days not in (1, 7):
        raise HTTPException(status_code=422, detail="since_days vaut 1 ou 7")
    now = datetime.now(timezone.utc)
    return {"items": feed_for(session, license_, since_days, now)}
