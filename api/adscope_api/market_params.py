"""Un jeu de filtres du marché : les seize paramètres de `/v1/market`, dans
les deux sens — une chaîne de requête, ou les arguments de `market_query.core`.

Porté ici, à part de `market.py`, pour qu'une recherche enregistrée
(`saved_searches.py`) puisse être rejouée sans réexprimer les filtres : la
traduction filtres → `core` n'existe qu'à cet endroit, et `market.get_market`
s'en sert aussi — les deux chemins ne peuvent plus diverger. `sort`, `limit`,
`offset` en sont exclus : une recherche enregistrée est un filtre, pas une
page.

**Garde de dérive.** Un filtre ajouté demain à `/v1/market` et oublié ici
serait ignoré en silence par les alertes — `test_market_params.py` compare les
noms de paramètres de la route (par `inspect.signature`) aux champs ci-dessous.
"""

from urllib.parse import parse_qsl, urlencode

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError

from .market_filters import combined as combined_departments
from .market_ranges import parse as parse_ranges
from .schemas import SellerType
from .vocab import Fuel, Gearbox

FIELDS = (
    "brand", "model", "q", "seller_type", "fuel", "gearbox", "department", "region",
    "price_min", "price_max", "year_min", "year_max", "mileage_min", "mileage_max",
    "min_age_days", "dropped",
)
_LISTS = {"fuel", "gearbox", "department", "region"}


class MarketParams(BaseModel):
    brand: str | None = None
    model: str | None = None
    q: str | None = Field(default=None, max_length=120)
    seller_type: SellerType | None = None
    fuel: list[Fuel] = []
    gearbox: list[Gearbox] = []
    department: list[str] = []
    region: list[str] = []
    price_min: int | None = Field(default=None, ge=0)
    price_max: int | None = Field(default=None, ge=0)
    year_min: int | None = Field(default=None, ge=0)
    year_max: int | None = Field(default=None, ge=0)
    mileage_min: int | None = Field(default=None, ge=0)
    mileage_max: int | None = Field(default=None, ge=0)
    min_age_days: int | None = Field(default=None, ge=0)
    dropped: bool | None = None

    @classmethod
    def from_query(cls, raw: str) -> "MarketParams":
        """La chaîne de requête d'une recherche enregistrée, validée — un nom
        hors des seize champs, ou une valeur hors vocabulaire, est un 422."""
        data: dict[str, list[str] | str] = {}
        for name, value in parse_qsl(raw):
            if name not in FIELDS:
                raise HTTPException(status_code=422, detail=f"paramètre inconnu : {name}")
            if name in _LISTS:
                data.setdefault(name, []).append(value)
            else:
                data[name] = value
        try:
            return cls(**data)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail=error.errors()) from error

    def to_query(self) -> str:
        """La forme canonique : ordre fixe des champs, listes triées — deux
        écritures du même filtre rendent la même chaîne."""
        pairs = []
        for name in FIELDS:
            value = getattr(self, name)
            if name in _LISTS:
                pairs += [(name, v) for v in sorted(value)]
            elif isinstance(value, bool):
                pairs.append((name, "true" if value else "false"))
            elif value is not None and value != "":
                pairs.append((name, value))
        return urlencode(pairs)

    def core_kwargs(self) -> dict:
        """Ce que `market_query.core` attend — la traduction filtres → `core`,
        faite une seule fois. `market.get_market` et `alert_rules.py` en
        dépendent tous les deux."""
        bounds = parse_ranges(self.price_min, self.price_max, self.year_min, self.year_max,
                              self.mileage_min, self.mileage_max)
        return {
            "brand": self.brand, "model": self.model, "q": self.q,
            "seller_type": self.seller_type,
            "fuel": self.fuel or None, "gearbox": self.gearbox or None,
            "department": combined_departments(self.department or None, self.region or None),
            "bounds": bounds, "min_age_days": self.min_age_days, "dropped": self.dropped,
        }
