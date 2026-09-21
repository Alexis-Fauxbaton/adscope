"""`/v1/digests` : la boîte d'envoi d'un compte.

La liste ne porte pas les corps — vingt emails HTML, c'est une réponse à
plusieurs centaines de kilo-octets pour une page qui n'en affiche qu'un.
`POST /v1/digests/visit` est non authentifiée : celui qui arrive de son email
n'a pas encore de session. Elle ne stocke rien du visiteur — un compteur, et
la première visite si elle est encore nulle.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select

from .alert_models import Digest
from .auth import require_account
from .db import get_session
from .sessions import check_csrf, now_utc

router = APIRouter()


class DigestSummary(BaseModel):
    id: int
    day: date
    subject: str
    created_at: datetime
    visits: int
    first_visit_at: datetime | None
    model_config = {"from_attributes": True}


class DigestOut(DigestSummary):
    text: str
    html: str


class VisitIn(BaseModel):
    token: str


@router.get("/v1/digests", response_model=list[DigestSummary])
def get_digests(limit: int = Query(default=20, ge=1, le=100), session=Depends(get_session),
                account_id=Depends(require_account)):
    return session.scalars(
        select(Digest).where(Digest.account_id == account_id)
        .order_by(Digest.created_at.desc()).limit(limit)
    ).all()


@router.get("/v1/digests/{digest_id}", response_model=DigestOut)
def get_digest(digest_id: int, session=Depends(get_session), account_id=Depends(require_account)):
    row = session.get(Digest, digest_id)
    if row is None or row.account_id != account_id:
        raise HTTPException(status_code=404, detail="email inconnu")
    return row


@router.post("/v1/digests/visit", status_code=204)
def post_visit(payload: VisitIn, request: Request, session=Depends(get_session),
              now=Depends(now_utc)):
    check_csrf(request)
    row = session.scalar(select(Digest).where(Digest.token == payload.token))
    if row is None:
        raise HTTPException(status_code=404, detail="jeton inconnu")
    row.visits += 1
    if row.first_visit_at is None:
        row.first_visit_at = now
    session.commit()
