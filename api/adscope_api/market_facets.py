"""`/v1/market/facets` : la cascade du site — marque → modèle, carburant,
boîte, localisation, vendeur, les trois fourchettes — sur les mêmes filtres
que `/v1/market` (sans `sort`/`limit`/`offset`). Chaque facette se compte sans
son propre filtre (`market_query.core`, `exclude`) : choisir « diesel » ne
vide pas la liste des carburants, `total` seul applique tout.

Une facette en cascade ignore aussi son descendant, pas seulement son propre
filtre : `brands` exclut `brand` **et** `model` — sinon choisir un modèle
enferme dans sa marque (cul-de-sac constaté par le lot `web`,
`.superpowers/recherche-lot4-web.md`, impossible de changer de marque sans
d'abord défaire le modèle) — et `regions` exclut `location` en entier, qui
couvre `department` et `region` ensemble (`market_filters.combined`, une
seule liste avant `market_query.core`). `models` (n'exclut que `model`,
garde `brand`) et `departments` (n'exclut que `department`, garde `region` —
même symétrie, voir `facet_query.departments`) n'ont pas de descendant à eux :
rien n'y change au-delà de leur propre filtre.

Le détail par facette est dans `facet_query.py`, les libellés dans
`spelling.py`/`vocab.py`/`region.py`/`department_labels.py`.
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
    location_all = combined_departments(department, region)
    location_region_only = combined_departments(None, region)
    common = dict(
        brand=brand, model=model, q=q, seller_type=seller_type, fuel=fuel, gearbox=gearbox,
        bounds=bounds, min_age_days=min_age_days, dropped=dropped,
    )

    def excluding(*names, department=location_all):
        built, _age, _delta = core(license_, now, exclude=frozenset(names), department=department, **common)
        return built

    fuel_list, fuel_unknown = fq.fuel(session, excluding("fuel"))
    gearbox_list, gearbox_unknown = fq.gearbox(session, excluding("gearbox"))
    regions, location_unknown = fq.regions(session, excluding("location"))
    departments = fq.departments(session, excluding(department=location_region_only))

    return {
        "total": fq.total(session, excluding()),
        "brands": fq.brands(session, excluding("brand", "model")),
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
