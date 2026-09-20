"""`/v1/market` et `/v1/follows/feed` : le marché et le suivi, tels qu'un
marchand les lit.

Le contrat et les calculs vivent dans `market_query.py` (agrégé en SQL, sur
les 47 000 annonces) et `feed_query.py` (en Python, sur ce qu'une licence
suit) ; ce module ne fait que les monter en routes, comme `main.py` le fait
pour le reste — `market.py` est le seul routeur à en porter deux, pour tenir
les deux sous les 150 lignes. `department`/`region` (`market_filters.py`) et
les six fourchettes (`market_ranges.py`) sont partagés avec
`market_facets.py`, qui accepte les mêmes filtres.
"""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import require_license
from .db import get_session
from .feed_query import FeedOut, feed_for
from .market_filters import combined as combined_departments
from .market_items import MarketOut, item_of
from .market_query import market_page
from .market_ranges import parse as parse_ranges
from .schemas import SellerType
from .vocab import Fuel, Gearbox

router = APIRouter()


@router.get("/v1/market", response_model=MarketOut)
def get_market(
    brand: str | None = None, model: str | None = None,
    q: str | None = Query(default=None, max_length=120),
    seller_type: SellerType | None = None,
    fuel: list[Fuel] | None = Query(default=None),
    gearbox: list[Gearbox] | None = Query(default=None),
    department: list[str] | None = Query(default=None),
    region: list[str] | None = Query(default=None),
    price_min: int | None = Query(default=None, ge=0),
    price_max: int | None = Query(default=None, ge=0),
    year_min: int | None = Query(default=None, ge=0),
    year_max: int | None = Query(default=None, ge=0),
    mileage_min: int | None = Query(default=None, ge=0),
    mileage_max: int | None = Query(default=None, ge=0),
    min_age_days: int | None = Query(default=None, ge=0),
    dropped: bool | None = None,
    sort: Literal["age_desc", "drop_desc", "recent"] = "age_desc",
    limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
    session=Depends(get_session), license_=Depends(require_license),
):
    now = datetime.now(timezone.utc)
    bounds = parse_ranges(price_min, price_max, year_min, year_max, mileage_min, mileage_max)
    total, rows = market_page(
        session, license_, now, brand=brand, model=model, q=q, seller_type=seller_type,
        fuel=fuel, gearbox=gearbox, department=combined_departments(department, region),
        bounds=bounds,
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
