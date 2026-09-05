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
