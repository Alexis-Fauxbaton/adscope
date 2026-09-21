"""`/v1/searches` : les recherches enregistrées d'un compte.

Une recherche est un jeu de filtres du marché (`market_params.MarketParams`),
nommé — `query` est validée et renormalisée à l'écriture, pour que deux
écrans identiques donnent une seule chaîne stockée. `PUT` remplace l'objet
entier : la page a la recherche en main (elle vient de l'afficher), et
« champ absent = ne pas toucher » est une règle qu'aucun test ne protège
bien — déjà le choix de `PUT /v1/families`.

Chaque accès par identifiant vérifie l'appartenance au compte : une ressource
d'un autre compte est un 404, jamais un 403, qui confirmerait qu'elle existe.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select

from .auth import require_account
from .db import get_session
from .alert_models import SavedSearch
from .market_params import MarketParams
from .sessions import now_utc

router = APIRouter()

MAX_SEARCHES = 50


class SearchIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    query: str = Field(max_length=2000)
    notify_drops: bool = True
    notify_new: bool = False
    min_age_days: int = Field(default=30, ge=0, le=3650)
    min_drop_pct: int = Field(default=3, ge=1, le=90)
    paused: bool = False

    @field_validator("name")
    @classmethod
    def _trimmed(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("nom vide")
        return value


class SearchOut(SearchIn):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}


def _normalized_query(raw: str) -> str:
    """Validée (paramètre inconnu, valeur hors vocabulaire, fourchette à
    l'envers → 422) et renormalisée — la même règle que `/v1/market` accepte."""
    params = MarketParams.from_query(raw)
    params.core_kwargs()  # ne sert qu'à valider département/fourchettes ici
    return params.to_query()


def _owned(session, account_id: int, search_id: int) -> SavedSearch | None:
    row = session.get(SavedSearch, search_id)
    return row if row is not None and row.account_id == account_id else None


@router.get("/v1/searches", response_model=list[SearchOut])
def get_searches(session=Depends(get_session), account_id=Depends(require_account)):
    return session.scalars(
        select(SavedSearch).where(SavedSearch.account_id == account_id)
        .order_by(SavedSearch.created_at, SavedSearch.id)
    ).all()


@router.post("/v1/searches", response_model=SearchOut, status_code=201)
def post_search(payload: SearchIn, session=Depends(get_session),
                account_id=Depends(require_account), now=Depends(now_utc)):
    count = session.scalar(
        select(func.count()).select_from(SavedSearch)
        .where(SavedSearch.account_id == account_id)
    )
    if count >= MAX_SEARCHES:
        raise HTTPException(status_code=409, detail="trop de recherches enregistrées")
    row = SavedSearch(
        account_id=account_id, name=payload.name, query=_normalized_query(payload.query),
        notify_drops=payload.notify_drops, notify_new=payload.notify_new,
        min_age_days=payload.min_age_days, min_drop_pct=payload.min_drop_pct,
        paused=payload.paused, created_at=now,
    )
    session.add(row)
    session.commit()
    return row


@router.get("/v1/searches/{search_id}", response_model=SearchOut)
def get_search(search_id: int, session=Depends(get_session), account_id=Depends(require_account)):
    row = _owned(session, account_id, search_id)
    if row is None:
        raise HTTPException(status_code=404, detail="recherche inconnue")
    return row


@router.put("/v1/searches/{search_id}", response_model=SearchOut)
def put_search(search_id: int, payload: SearchIn, session=Depends(get_session),
               account_id=Depends(require_account)):
    row = _owned(session, account_id, search_id)
    if row is None:
        raise HTTPException(status_code=404, detail="recherche inconnue")
    row.name = payload.name
    row.query = _normalized_query(payload.query)
    row.notify_drops = payload.notify_drops
    row.notify_new = payload.notify_new
    row.min_age_days = payload.min_age_days
    row.min_drop_pct = payload.min_drop_pct
    row.paused = payload.paused
    session.commit()
    return row


@router.delete("/v1/searches/{search_id}", status_code=204)
def delete_search(search_id: int, session=Depends(get_session), account_id=Depends(require_account)):
    session.execute(
        delete(SavedSearch).where(SavedSearch.account_id == account_id, SavedSearch.id == search_id)
    )
    session.commit()
