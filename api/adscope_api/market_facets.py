"""`/v1/market/facets` : la cascade du site — marque → modèle, carburant,
boîte, localisation, vendeur, les trois fourchettes — sur les mêmes filtres
que `/v1/market` (sans `sort`/`limit`/`offset`). Chaque facette se compte sans
son propre filtre (`market_query.core`, `exclude`) : choisir « diesel » ne
vide pas la liste des carburants, `total` seul applique tout. Le détail par
facette est dans `facet_query.py`, les libellés dans `spelling.py`/`vocab.py`/
`region.py`.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from . import facet_query as fq
from .auth import require_license
from .db import get_session
from .facet_schemas import FacetsOut
from .market_filters import combined as combined_departments
from .market_query import core
from .market_ranges import parse as parse_ranges
from .schemas import SellerType
from .vocab import Fuel, Gearbox

router = APIRouter()


@router.get("/v1/market/facets", response_model=FacetsOut)
def get_facets(
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
    session=Depends(get_session), license_=Depends(require_license),
):
    now = datetime.now(timezone.utc)
    bounds = parse_ranges(price_min, price_max, year_min, year_max, mileage_min, mileage_max)
    common = dict(
        brand=brand, model=model, q=q, seller_type=seller_type, fuel=fuel, gearbox=gearbox,
        department=combined_departments(department, region), bounds=bounds,
        min_age_days=min_age_days, dropped=dropped,
    )

    def excluding(*names):
        built, _age, _delta = core(license_, now, exclude=frozenset(names), **common)
        return built

    fuel_list, fuel_unknown = fq.fuel(session, excluding("fuel"))
    gearbox_list, gearbox_unknown = fq.gearbox(session, excluding("gearbox"))
    regions, departments, location_unknown = fq.locations(session, excluding("location"))

    return {
        "total": fq.total(session, excluding()),
        "brands": fq.brands(session, excluding("brand")),
        "models": fq.models(session, excluding("model")) if brand else [],
        "fuel": fuel_list, "fuel_unknown": fuel_unknown,
        "gearbox": gearbox_list, "gearbox_unknown": gearbox_unknown,
        "regions": regions, "departments": departments, "location_unknown": location_unknown,
        "seller_type": fq.seller_types(session, excluding("seller_type")),
        "ranges": {
            "price": fq.ranges(session, excluding("price"), "price"),
            "year": fq.ranges(session, excluding("year"), "year"),
            "mileage": fq.ranges(session, excluding("mileage"), "mileage"),
        },
    }
