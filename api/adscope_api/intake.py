"""Ce que l'API reçoit d'une page tierce, ramené à ce que la base peut porter.

Les largeurs ne sont pas répétées ici : `gauge` les lit sur les colonnes.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from . import gauge

Precision = Literal["day", "month", "year"]
SellerType = Literal["pro", "private"]
# Ce qu'une page d'annonce peut dire d'elle-même quand elle ne porte plus
# d'annonce. Une énumération fermée, jamais du texte libre : c'est une page
# tierce qui l'écrit, et `disappearance` décide seule laquelle écrit en base.
Evidence = Literal["absent", "unreadable", "status:sold", "status:inactive",
                   "status:pending", "status:deleted"]


class ObservationIn(BaseModel):
    """Ce qu'une page tierce nous tend, ramené à ce que la base peut porter.

    Les largeurs ne sont pas répétées ici : `gauge` les lit sur les colonnes.
    Chaque champ hors gabarit est tronqué ou ignoré selon ce qu'il est — jamais
    au prix des quatre-vingt-dix-neuf autres observations du lot.
    """

    site: str
    site_id: str
    price: int | None = None
    brand: str | None = None
    model: str | None = None
    version: str | None = None
    year: int | None = None
    mileage: int | None = None
    postal_code: str | None = None
    seller_type: SellerType | None = None
    # Transmis pour les professionnels seuls ; l'API le vérifie plutôt que
    # de faire confiance à l'émetteur.
    seller_id: str | None = None
    seller_name: str | None = None
    published_days_ago: int | None = None
    published_precision: Precision = "day"
    published_at: datetime | None = None
    bumped_at: datetime | None = None

    @field_validator("brand", "model", "version", "seller_name", mode="before")
    @classmethod
    def _prose(cls, value, info):
        return gauge.prose(value, info.field_name)

    @field_validator("postal_code", "seller_id", mode="before")
    @classmethod
    def _code(cls, value, info):
        return gauge.code(value, info.field_name)

    @field_validator("price", "year", "mileage", "published_days_ago", mode="before")
    @classmethod
    def _number(cls, value, info):
        return gauge.number(value, info.field_name)

    # Un type de vendeur qu'on ne connaît pas n'apprend rien : `record` laisse
    # alors en place ce qu'on savait. Une précision inconnue est ramenée à la
    # moins engageante — « jour » poserait une borne haute qu'on n'a pas.
    @field_validator("seller_type", "published_precision", mode="before")
    @classmethod
    def _known(cls, value, info):
        if info.field_name == "seller_type":
            return value if value in (None, "pro", "private") else None
        return value if value in ("day", "month", "year") else "year"

    # Une date illisible est une date de moins, pas un lot perdu.
    @field_validator("published_at", "bumped_at", mode="wrap")
    @classmethod
    def _moment(cls, value, handler):
        try:
            return handler(value)
        except ValidationError:
            return None


class ObservationsIn(BaseModel):
    """Le lot, où une annonce ne peut pas en emporter cent.

    Chaque observation est validée pour elle-même : celle qu'aucun gabarit ne
    rattrape — sans identité d'annonce, ou fautive pour une raison qu'on n'a pas
    prévue — est refusée seule, et comptée. `refused` est écrit ici : ce que
    l'émetteur en dirait est remplacé.
    """

    items: list[ObservationIn] = Field(min_length=1, max_length=100)
    refused: int = 0

    @model_validator(mode="before")
    @classmethod
    def _one_by_one(cls, data):
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            return data
        kept, refused = [], 0
        for raw in data["items"]:
            try:
                assert gauge.identified(raw)
                kept.append(ObservationIn.model_validate(raw))
            except (AssertionError, ValidationError):
                refused += 1
        return {**data, "items": kept, "refused": refused}


class AbsenceIn(BaseModel):
    """Une constatation d'absence : le site dit lui-même que l'annonce n'est
    plus là, et par quel signe. L'identité de l'annonce ne se rattrape pas."""

    site: str = Field(max_length=gauge.width("site"))
    site_id: str = Field(max_length=gauge.width("site_id"))
    evidence: Evidence
