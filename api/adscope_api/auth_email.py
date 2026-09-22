"""La connexion par mot de passe : ce qu'elle répond, ce qu'elle ouvre.

Le lien magique a disparu (voir `auth_signup.py` pour ce qui reste de sa
mécanique — vérification, réinitialisation). Un marchand tape son adresse et
son mot de passe, comme sur n'importe quel site ; son navigateur garde une
session, une clé de machine continue de porter la licence en clair.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from . import accounts, sessions
from .auth import require_account, require_license
from .db import get_session
from .passwords import policy_error
from .rate_limit import guard
from .sessions import check_csrf, is_secure, now_utc, set_cookie

router = APIRouter()


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class ChangeIn(BaseModel):
    current: str = Field(max_length=128)
    password: str = Field(max_length=128)


@router.post("/v1/auth/login", status_code=204)
def post_login(payload: LoginIn, request: Request, session=Depends(get_session),
              now=Depends(now_utc)):
    check_csrf(request)
    email = payload.email.strip().lower()
    guard("login", email, request, now)
    raw = accounts.login(session, email, payload.password, now)
    session.commit()
    response = Response(status_code=204)
    set_cookie(response, raw, is_secure())
    return response


@router.post("/v1/auth/logout", status_code=204)
def post_logout(request: Request, session=Depends(get_session)):
    check_csrf(request)
    sessions.drop(session, request.cookies.get(sessions.COOKIE, ""))
    session.commit()
    response = Response(status_code=204)
    sessions.clear_cookie(response, is_secure())
    return response


@router.post("/v1/auth/password", status_code=204)
def post_change_password(payload: ChangeIn, request: Request, session=Depends(get_session),
                         account_id=Depends(require_account)):
    # Pas d'appel direct à `check_csrf` ici : `require_account` (via
    # `require_license`) le fait déjà pour une session cookie, et en dispense
    # une clé `Bearer` — comme le reste des routes authentifiées de l'API.
    error = policy_error(payload.password)
    if error:
        raise HTTPException(status_code=422, detail=error)
    keep = sessions.hash_token(request.cookies.get(sessions.COOKIE, ""))
    accounts.change_password(session, account_id, payload.current, payload.password, keep)
    session.commit()
    return Response(status_code=204)


# Qui est là : l'adresse pour un humain, rien pour une clé de machine — elle
# n'appartient à personne.
@router.get("/v1/me")
def get_me(license_=Depends(require_license)):
    return {"email": license_.account.email if license_.account else None,
            "label": license_.label, "expires_at": license_.expires_at}
