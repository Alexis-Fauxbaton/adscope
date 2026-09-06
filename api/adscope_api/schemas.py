from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

Precision = Literal["day", "month", "year"]
SellerType = Literal["pro", "private"]


class ObservationIn(BaseModel):
    site: str = Field(max_length=8)
    site_id: str = Field(max_length=32)
    price: int | None = Field(default=None, ge=0)
    brand: str | None = None
    model: str | None = None
    version: str | None = None
    year: int | None = None
    mileage: int | None = None
    postal_code: str | None = None
    seller_type: SellerType | None = None
    # Transmis pour les professionnels seuls ; l'API le vérifie plutôt que
    # de faire confiance à l'émetteur.
    seller_id: str | None = Field(default=None, max_length=32)
    seller_name: str | None = Field(default=None, max_length=128)
    published_days_ago: int | None = Field(default=None, ge=0, le=3650)
    published_precision: Precision = "day"
    published_at: datetime | None = None
    bumped_at: datetime | None = None


class ObservationsIn(BaseModel):
    items: list[ObservationIn] = Field(min_length=1, max_length=100)


class BatchIn(BaseModel):
    site: str = Field(max_length=8)
    ids: list[str] = Field(min_length=1, max_length=30)


class PricePointOut(BaseModel):
    at: datetime
    price: int


class SignalsOut(BaseModel):
    site: str
    site_id: str
    fingerprint: str | None
    first_seen: datetime
    last_seen: datetime
    observations: int
    tracked_days: int
    seller_type: SellerType | None
    site_published_first: date | None
    published_at: datetime | None
    bumped_at: datetime | None
    real_age_days: int | None
    age_source: Literal["exact", "inferred"] | None
    republished: bool
    republished_at: date | None
    price: int | None
    price_history: list[PricePointOut]
    price_delta_since_first: int | None
    price_delta_days_since_first: int | None
    stable_days: int | None


class SellerStatsOut(BaseModel):
    """Ce qu'un marchand dit de lui-même sans le vouloir.

    Les comptes accompagnent chaque statistique : une médiane sur trois
    annonces n'est pas une médiane, et c'est au lecteur qu'il revient de le
    savoir. `aged` porte la population des deux premières, `price_changed_listings`
    et `price_drop_listings` celle des deux dernières.
    """

    site: str
    seller_id: str
    seller_name: str | None
    listings: int
    aged: int
    over_a_month: int
    over_a_month_share: float | None
    median_age_days: int | None
    price_changed_listings: int
    price_drop_listings: int
    price_drop_rate: float | None
    price_drop_after_days: int | None
