"""Le gabarit de `/v1/market/facets` — `schemas.py` porte celui du reste,
mais ce contrat a assez de formes imbriquées pour mériter son propre fichier,
comme `market_items.ItemOut`."""

from pydantic import BaseModel


class FacetItem(BaseModel):
    key: str
    label: str
    count: int


class DepartmentFacetItem(BaseModel):
    key: str
    label: str
    count: int


class SellerTypeFacetItem(BaseModel):
    key: str
    count: int


class RangeOut(BaseModel):
    min: int | None
    max: int | None


class RangesOut(BaseModel):
    price: RangeOut
    year: RangeOut
    mileage: RangeOut


class FacetsOut(BaseModel):
    total: int
    brands: list[FacetItem]
    models: list[FacetItem]
    fuel: list[FacetItem]
    fuel_unknown: int
    gearbox: list[FacetItem]
    gearbox_unknown: int
    regions: list[FacetItem]
    departments: list[DepartmentFacetItem]
    location_unknown: int
    seller_type: list[SellerTypeFacetItem]
    ranges: RangesOut
