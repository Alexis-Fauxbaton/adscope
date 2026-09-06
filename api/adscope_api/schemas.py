"""Ce que l'API rend. Ce qu'elle reçoit vit dans `intake`, avec son gabarit."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

SellerType = Literal["pro", "private"]


class BatchIn(BaseModel):
    site: str = Field(max_length=8)
    ids: list[str] = Field(min_length=1, max_length=30)


class PricePointOut(BaseModel):
    at: datetime
    price: int
    # Le point n'a été écrit que parce que la semaine était passée : le prix
    # n'a pas bougé, il a été revu.
    confirmation: bool


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
    # Depuis le dernier *changement*, jamais depuis la dernière confirmation.
    stable_days: int | None
    # De quoi lire cette stabilité : combien de fois le prix a été revu depuis,
    # et le plus long intervalle pendant lequel personne ne l'a regardé. Un
    # simple compteur ne suffirait pas — quarante relevés d'une semaine et
    # quarante étalés sur deux mois donneraient le même nombre.
    price_checks: int | None
    price_gap_days: int | None


class SellerStatsOut(BaseModel):
    """Ce qu'un marchand dit de lui-même sans le vouloir.

    `listings` n'est pas son stock : c'est le nombre de ses annonces que notre
    base connaît et qui ont été revues dans les `window_days` derniers jours.
    Son catalogue réel nous est inconnu, et la fenêtre part avec le relevé pour
    que l'affichage puisse le dire.

    Les comptes accompagnent chaque statistique : une médiane sur trois
    annonces n'est pas une médiane, et c'est au lecteur qu'il revient de le
    savoir. `aged` porte la population des deux premières, `price_changed_listings`
    et `price_drop_listings` celle des deux dernières.
    """

    site: str
    seller_id: str
    seller_name: str | None
    listings: int
    window_days: int
    aged: int
    over_a_month: int
    over_a_month_share: float | None
    median_age_days: int | None
    price_changed_listings: int
    price_drop_listings: int
    price_drop_rate: float | None
    price_drop_after_days: int | None
