"""Le réglage d'alertes d'un compte : l'email du matin, les suivis inclus, et
le jeton de désabonnement.

La ligne se pose paresseusement (`settings_of`), à la première lecture du
réglage ou au premier passage du script du matin — c'est là qu'on frappe le
jeton.

**Écart documenté au plan** (`.superpowers/alertes-f1-plan.md` § 8) : le plan
prévoyait un jeton *haché* en base, sur le modèle de `sessions.hash_token`.
Mais ce jeton doit rester identique et valable dans *chaque* email envoyé,
potentiellement pendant des années — `digest_build.py` en a besoin en clair à
chaque passage du script, alors qu'un jeton haché ne se lit qu'à sa frappe, la
première fois, et le schéma ne porte qu'une colonne (pas un historique de
jetons). Sans secret d'application (le plan écarte le HMAC) et sans table
d'historique, la seule lecture qui tienne est de garder le jeton en clair,
la même sensibilité que `digests.token`, déjà en clair dans ce même lot.
Détail dans le rapport de fin de lot ; le contrat HTTP, lui, ne change pas.

Le désabonnement est un POST non authentifié : un lien de messagerie n'a pas
de session, et un GET mutant serait déclenché par les analyseurs de liens qui
préchargent les URL. Le jeton ne tournant jamais, il rallumerait aussi
l'email du matin à qui le détient encore (un vieil email transféré) : le
réabonnement, lui, exige donc une session (`require_account`) — seul le
compte peut se rallumer lui-même.
"""

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from .alert_models import AccountSettings
from .auth import require_account
from .db import get_session
from .sessions import check_csrf, now_utc

router = APIRouter()


def settings_of(session, account_id: int, now: datetime) -> AccountSettings:
    """Le réglage du compte — créé, et le jeton frappé, s'il manque encore."""
    row = session.get(AccountSettings, account_id)
    if row is None:
        row = AccountSettings(
            account_id=account_id, unsubscribe_token_hash=secrets.token_urlsafe(16),
            created_at=now,
        )
        session.add(row)
        session.flush()
    return row


class SettingsIO(BaseModel):
    digest_enabled: bool = True
    include_follows: bool = True
    model_config = {"from_attributes": True}


class TokenIn(BaseModel):
    token: str


def _by_token(session, token: str) -> AccountSettings | None:
    return session.scalar(
        select(AccountSettings).where(AccountSettings.unsubscribe_token_hash == token)
    )


@router.get("/v1/alerts/settings", response_model=SettingsIO)
def get_alert_settings(session=Depends(get_session), account_id=Depends(require_account),
                       now=Depends(now_utc)):
    row = settings_of(session, account_id, now)
    session.commit()
    return row


@router.put("/v1/alerts/settings", response_model=SettingsIO)
def put_alert_settings(payload: SettingsIO, session=Depends(get_session),
                       account_id=Depends(require_account), now=Depends(now_utc)):
    row = settings_of(session, account_id, now)
    row.digest_enabled = payload.digest_enabled
    row.include_follows = payload.include_follows
    session.commit()
    return row


@router.post("/v1/alerts/unsubscribe", response_model=SettingsIO)
def unsubscribe(payload: TokenIn, request: Request, session=Depends(get_session)):
    check_csrf(request)
    row = _by_token(session, payload.token)
    if row is None:
        raise HTTPException(status_code=404, detail="jeton inconnu")
    row.digest_enabled = False
    session.commit()
    return row


@router.post("/v1/alerts/resubscribe", response_model=SettingsIO)
def resubscribe(session=Depends(get_session), account_id=Depends(require_account),
                now=Depends(now_utc)):
    # Jamais par jeton : lui seul ne tourne pas, il rallumerait l'email du
    # matin à qui détient encore un vieil email transféré (voir docstring).
    # `require_account` couvre le CSRF côté cookie (`require_license`), comme
    # les autres routes écrivant par compte (`saved_searches.py`).
    row = settings_of(session, account_id, now)
    row.digest_enabled = True
    session.commit()
    return row
